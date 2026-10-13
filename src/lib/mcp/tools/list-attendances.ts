import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_attendances",
  title: "Listar atendimentos",
  description: "Lista os atendimentos recentes que você pode ver, com etapa e próximo retorno (somente leitura).",
  inputSchema: {
    status: z.string().trim().max(40).optional().describe("Filtrar por status exato."),
    limit: z.number().int().min(1).max(50).optional().describe("Máximo de resultados (padrão 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) throw new ToolError("Não autenticado");
    let q = supabaseForUser(ctx)
      .from("attendances")
      .select("id,cliente_nome,status,pipeline_stage,finalidade,imobiliaria,corretor_nome,imovel_codigo,proximo_passo,proximo_retorno,created_at")
      .order("created_at", { ascending: false })
      .limit(limit ?? 20);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) throw new ToolError(error.message);
    const attendances = (data ?? []).map((a) => ({
      id: a.id,
      cliente: a.cliente_nome,
      status: a.status,
      etapa: a.pipeline_stage,
      finalidade: a.finalidade,
      imobiliaria: a.imobiliaria,
      corretor: a.corretor_nome,
      imovelCodigo: a.imovel_codigo,
      proximoPasso: a.proximo_passo,
      proximoRetorno: a.proximo_retorno,
      criadoEm: a.created_at,
    }));
    return {
      content: [{ type: "text", text: `${attendances.length} atendimento(s).` }],
      structuredContent: { attendances },
    };
  },
});
