import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "search_clients",
  title: "Buscar clientes",
  description: "Busca clientes por nome que você pode ver, com status e próximo passo (somente leitura).",
  inputSchema: {
    name: z.string().trim().max(80).optional().describe("Parte do nome do cliente."),
    limit: z.number().int().min(1).max(50).optional().describe("Máximo de resultados (padrão 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ name, limit }, ctx) => {
    if (!ctx.isAuthenticated()) throw new ToolError("Não autenticado");
    let q = supabaseForUser(ctx)
      .from("clients")
      .select("id,full_name,status,purpose,property_type,neighborhood,assigned_broker_name,next_step,next_follow_up_at,brand")
      .order("updated_at", { ascending: false })
      .limit(limit ?? 20);
    if (name) q = q.ilike("full_name", `%${name.replace(/[%_]/g, " ")}%`);
    const { data, error } = await q;
    if (error) throw new ToolError(error.message);
    const clients = (data ?? []).map((c) => ({
      id: c.id,
      nome: c.full_name,
      status: c.status,
      finalidade: c.purpose,
      tipoImovel: c.property_type,
      bairro: c.neighborhood,
      corretor: c.assigned_broker_name,
      proximoPasso: c.next_step,
      proximoRetorno: c.next_follow_up_at,
      marca: c.brand,
    }));
    return {
      content: [{ type: "text", text: `${clients.length} cliente(s).` }],
      structuredContent: { clients },
    };
  },
});
