import { z } from "zod";
import { operationalRoles } from "../security";
import { clientQuery, clientRecord, limitSchema, rows, safeLike } from "./common";
import { result, type AgentTool } from "./types";
export default {
  name: "search_clients",
  title: "Buscar clientes",
  description:
    "Busca clientes permitidos por nome, sem dados de contato. Corretor consulta somente sua carteira.",
  roles: [...operationalRoles, "financeiro"],
  inputSchema: z
    .object({ name: z.string().trim().max(80).optional(), limit: limitSchema })
    .strict(),
  async handler({ name, limit = 20 }, ctx) {
    let q = clientQuery(ctx)
      .order("updated_at", { ascending: false })
      .limit(limit + 1);
    if (name && safeLike(name)) q = q.ilike("full_name", `%${safeLike(name)}%`);
    const data = await rows(q, ctx);
    const clients = data.slice(0, limit).map(clientRecord);
    return result(
      clients.length
        ? `${clients.length} cliente(s) encontrado(s).`
        : "Não encontrei clientes com esses critérios.",
      { clients, total: clients.length, limited: data.length > limit },
    );
  },
} satisfies AgentTool;
