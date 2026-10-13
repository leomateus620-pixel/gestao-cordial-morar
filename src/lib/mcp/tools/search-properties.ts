import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "search_properties",
  title: "Buscar imóveis",
  description: "Busca imóveis da carteira por código, bairro ou cidade (somente leitura).",
  inputSchema: {
    query: z.string().trim().max(80).optional().describe("Código, bairro ou cidade."),
    limit: z.number().int().min(1).max(50).optional().describe("Máximo de resultados (padrão 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    if (!ctx.isAuthenticated()) throw new ToolError("Não autenticado");
    let q = supabaseForUser(ctx)
      .from("properties")
      .select("id,codigo,codigo_cordial,codigo_morar,tipo,finalidade,bairro,cidade,valor,corretor_nome")
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(limit ?? 20);
    if (query) {
      const s = query.replace(/[%,()*]/g, " ");
      q = q.or(
        `codigo.ilike.%${s}%,codigo_cordial.ilike.%${s}%,codigo_morar.ilike.%${s}%,bairro.ilike.%${s}%,cidade.ilike.%${s}%`,
      );
    }
    const { data, error } = await q;
    if (error) throw new ToolError(error.message);
    const properties = (data ?? []).map((p) => ({
      id: p.id,
      codigo: p.codigo,
      codigoCordial: p.codigo_cordial,
      codigoMorar: p.codigo_morar,
      tipo: p.tipo,
      finalidade: p.finalidade,
      bairro: p.bairro,
      cidade: p.cidade,
      valor: p.valor,
      corretor: p.corretor_nome,
    }));
    return {
      content: [{ type: "text", text: `${properties.length} imóvel(is) encontrado(s).` }],
      structuredContent: { properties },
    };
  },
});
