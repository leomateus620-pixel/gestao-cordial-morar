import { z } from "zod";
import { operationalRoles, scopeAgency, scopeOwned } from "../security";
import { limitSchema, rows } from "./common";
import { result, type AgentTool } from "./types";
export const AGENCIAMENTO_COLUMNS =
  "id,tipo_imovel,bairro,cidade,corretor_id,corretor_nome,imobiliaria,status,data_agenciamento,fotos_realizadas,fotos_drive,placa_instalada,cadastrado_site,validado,property_id";
export const agenciamentoQuery = (ctx: any) =>
  scopeOwned(
    scopeAgency(
      ctx.supabase.from("agenciamentos").select(AGENCIAMENTO_COLUMNS),
      ctx,
      "imobiliaria",
    ),
    ctx,
    "corretor_id",
  );
export const agenciamentoRecord = (a: any) => ({
  id: a.id,
  tipo: a.tipo_imovel,
  bairro: a.bairro,
  cidade: a.cidade,
  corretor: a.corretor_nome,
  imobiliaria: a.imobiliaria,
  status: a.status,
  dataAgenciamento: a.data_agenciamento,
  pendencias: [
    !a.fotos_realizadas && "Fotos",
    !a.fotos_drive && "Arquivos de fotos",
    !a.placa_instalada && "Placa",
    !a.cadastrado_site && "Cadastro",
    !a.validado && "Validação",
  ].filter(Boolean),
  href: a.property_id
    ? `/imoveis/${a.property_id}`
    : `/agenciamentos?corretorId=${encodeURIComponent(a.corretor_id)}`,
});
export default {
  name: "expiring_agenciamentos",
  title: "Pendências de captação",
  description:
    "Consulta captações pendentes. O cadastro atual não possui vencimento contratual; esta ferramenta não inventa prazo de expiração.",
  roles: operationalRoles,
  inputSchema: z.object({ limit: limitSchema }).strict(),
  async handler({ limit = 20 }, ctx) {
    const data = await rows(
      agenciamentoQuery(ctx)
        .not("status", "in", "(validado,cancelado)")
        .order("data_agenciamento", { ascending: true })
        .limit(limit + 1),
      ctx,
    );
    const agenciamentos = data.slice(0, limit).map(agenciamentoRecord);
    return result(
      "O cadastro não informa vencimento de agenciamentos. " +
        (agenciamentos.length
          ? `Encontrei ${agenciamentos.length} captação(ões) com pendências para revisar.`
          : "Não encontrei captações pendentes."),
      {
        agenciamentos,
        total: agenciamentos.length,
        limited: data.length > limit,
        expirationAvailable: false,
        href: "/agenciamentos",
      },
    );
  },
} satisfies AgentTool;
