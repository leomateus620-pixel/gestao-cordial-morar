import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "business_insights",
  title: "Insights automáticos",
  description:
    "Cruza imóveis, aluguéis, NFS-e, atendimentos e marketing e devolve achados prontos em texto, com os pontos que pedem atenção (somente leitura).",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) throw new ToolError("Não autenticado");
    const supabase = supabaseForUser(ctx);
    const insights: Array<{ tema: string; achado: string; quantidade?: number }> = [];

    const now = new Date();
    const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const competencia = prev.toISOString().slice(0, 7);

    const [propsRes, contractsRes, nfseRes, attRes, campRes] = await Promise.all([
      supabase
        .from("properties")
        .select("disponibilidade,created_at,exibir_imovel")
        .is("archived_at", null)
        .limit(5000),
      supabase
        .from("rental_contracts")
        .select("id,status,payment_status,data_inicio,valor_mensal")
        .limit(2000),
      supabase
        .from("rental_nfse_emissions")
        .select("contract_id,status,modo_teste")
        .eq("competencia", competencia)
        .limit(2000),
      supabase
        .from("attendances")
        .select("status,proximo_retorno,created_at")
        .order("created_at", { ascending: false })
        .limit(5000),
      supabase.from("marketing_campaigns").select("id,nome,status,sync_status,sync_error").limit(500),
    ]);
    for (const res of [propsRes, contractsRes, nfseRes, attRes, campRes]) {
      if (res.error) throw new ToolError(res.error.message);
    }

    // Imóveis disponíveis há muito tempo
    const ha180 = Date.now() - 180 * 24 * 60 * 60 * 1000;
    const DISPONIVEL = new Set(["sim", "disponível", "disponivel"]);
    const encalhados = (propsRes.data ?? []).filter(
      (p) =>
        p.exibir_imovel &&
        (!p.disponibilidade || DISPONIVEL.has(p.disponibilidade.trim().toLowerCase())) &&
        p.created_at &&
        new Date(p.created_at).getTime() < ha180,
    );
    if (encalhados.length > 0) {
      insights.push({
        tema: "Imóveis",
        achado: `${encalhados.length} imóvel(is) disponível(is) e visível(is) há mais de 6 meses sem sair da carteira.`,
        quantidade: encalhados.length,
      });
    }

    // Aluguéis antigos (possível reajuste anual)
    const ativos = (contractsRes.data ?? []).filter((c) => c.status === "ativo");
    const ha365 = Date.now() - 365 * 24 * 60 * 60 * 1000;
    const semReajuste = ativos.filter(
      (c) => c.data_inicio && new Date(c.data_inicio).getTime() < ha365,
    );
    if (semReajuste.length > 0) {
      insights.push({
        tema: "Aluguéis",
        achado: `${semReajuste.length} contrato(s) ativo(s) com mais de 12 meses — verificar reajuste anual.`,
        quantidade: semReajuste.length,
      });
    }

    // Inadimplência
    const pendentes = ativos.filter((c) => c.payment_status !== "em_dia");
    if (pendentes.length > 0) {
      insights.push({
        tema: "Aluguéis",
        achado: `${pendentes.length} contrato(s) ativo(s) com pagamento fora de "em dia".`,
        quantidade: pendentes.length,
      });
    }

    // NFS-e da competência anterior
    const emitidas = new Set(
      (nfseRes.data ?? [])
        .filter((n) => !n.modo_teste && (n.status === "emitida" || n.status === "teste_ok"))
        .map((n) => n.contract_id),
    );
    const semNota = ativos.filter((c) => !emitidas.has(c.id));
    if (semNota.length > 0) {
      insights.push({
        tema: "NFS-e",
        achado: `${semNota.length} aluguel(is) ativo(s) sem NFS-e emitida na competência ${competencia}.`,
        quantidade: semNota.length,
      });
    }

    // Atendimentos parados
    const ha7 = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const parados = (attRes.data ?? []).filter((a) => {
      if (a.status !== "em_andamento" && a.status !== "novo") return false;
      const ref = a.proximo_retorno ?? a.created_at;
      return ref ? new Date(ref).getTime() < ha7 : false;
    });
    if (parados.length > 0) {
      insights.push({
        tema: "Atendimentos",
        achado: `${parados.length} atendimento(s) em aberto há mais de 7 dias sem retorno agendado.`,
        quantidade: parados.length,
      });
    }

    // Campanhas com erro de sincronização
    const campErro = (campRes.data ?? []).filter((c) => c.sync_status === "error" || c.sync_error);
    if (campErro.length > 0) {
      insights.push({
        tema: "Marketing",
        achado: `${campErro.length} campanha(s) com erro de sincronização: ${campErro
          .slice(0, 5)
          .map((c) => c.nome)
          .join(", ")}.`,
        quantidade: campErro.length,
      });
    }

    if (insights.length === 0) {
      insights.push({ tema: "Geral", achado: "Nenhum ponto de atenção encontrado nos dados atuais." });
    }

    return {
      content: [
        { type: "text", text: insights.map((i) => `• [${i.tema}] ${i.achado}`).join("\n") },
      ],
      structuredContent: { competenciaNfse: competencia, insights },
    };
  },
});
