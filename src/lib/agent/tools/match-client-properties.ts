import { z } from "zod";
import { operationalRoles } from "../security";
import {
  clientQuery,
  clientRecord,
  limitSchema,
  PROPERTY_COLUMNS,
  propertyRecord,
  rows,
  uuidSchema,
  withPublicCovers,
} from "./common";
import { result, type AgentTool } from "./types";
const normalized = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
export function scoreProperty(client: any, property: any): { score: number; motivos: string[] } {
  let score = 0;
  const motivos: string[] = [];
  if (client.property_type && normalized(client.property_type) === normalized(property.tipo)) {
    score += 30;
    motivos.push("Tipo de imóvel solicitado");
  }
  const price = Number(property.valor);
  if (
    price > 0 &&
    (client.min_budget != null || client.max_budget != null) &&
    (!client.min_budget || price >= Number(client.min_budget)) &&
    (!client.max_budget || price <= Number(client.max_budget))
  ) {
    score += 35;
    motivos.push("Dentro do orçamento informado");
  }
  if (
    client.neighborhood &&
    property.bairro &&
    normalized(client.neighborhood) === normalized(property.bairro)
  ) {
    score += 25;
    motivos.push("Bairro de interesse");
  }
  const rooms = parseInt(String(client.bedrooms), 10);
  if (rooms > 0 && Number(property.dormitorios) >= rooms) {
    score += 10;
    motivos.push("Quantidade de dormitórios compatível");
  }
  return { score, motivos };
}
export default {
  name: "match_client_properties",
  title: "Encontrar imóveis compatíveis",
  description:
    "Compara orçamento, tipo, bairro e dormitórios de um cliente autorizado. Mostra score explicável e limita a amostra; não cria seleção.",
  roles: operationalRoles,
  inputSchema: z.object({ clientId: uuidSchema, limit: limitSchema }).strict(),
  async handler({ clientId, limit = 8 }, ctx) {
    const clients = await rows(clientQuery(ctx).eq("id", clientId).limit(1), ctx);
    const client = clients[0];
    if (!client)
      return result("Não encontrei esse cliente nos dados que você pode acessar.", {
        properties: [],
        total: 0,
        limited: false,
      });
    let q = ctx.supabase
      .from("properties")
      .select(PROPERTY_COLUMNS)
      .is("archived_at", null)
      .eq("is_draft", false)
      .eq("exibir_imovel", true)
      .order("created_at", { ascending: false });
    const purpose =
      client.purpose === "compra"
        ? "venda"
        : ["aluguel", "locacao"].includes(client.purpose)
          ? "locacao"
          : client.purpose;
    if (purpose && purpose !== "ambos") q = q.eq("finalidade", purpose);
    const data = await rows(q.limit(501), ctx);
    const ranked = data
      .slice(0, 500)
      .filter(
        (p) =>
          !p.disponibilidade ||
          ["sim", "disponivel", "disponível"].includes(
            String(p.disponibilidade).trim().toLowerCase(),
          ),
      )
      .map((p) => ({ ...propertyRecord(p), ...scoreProperty(client, p) }))
      .filter((p) => p.score > 0)
      .sort((a, b) => b.score - a.score || String(a.id).localeCompare(String(b.id)));
    const properties = await withPublicCovers(ranked.slice(0, limit), ctx);
    const missingCriteria = [
      !client.property_type && "Tipo de imóvel",
      client.min_budget == null && client.max_budget == null && "Orçamento",
      !client.neighborhood && "Bairro",
      !parseInt(String(client.bedrooms), 10) && "Dormitórios",
    ].filter(Boolean);
    return result(
      properties.length
        ? `${properties.length} imóvel(is) com critérios compatíveis. O score mede os dados cadastrados, não garante adequação completa.`
        : "Não encontrei imóveis compatíveis na amostra consultada.",
      {
        properties,
        client: clientRecord(client),
        total: properties.length,
        limited: data.length > 500 || ranked.length > limit,
        considerados: Math.min(data.length, 500),
        scoreMaximo: 100,
        missingCriteria,
      },
    );
  },
} satisfies AgentTool;
