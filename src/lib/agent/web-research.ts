import { z } from "zod";
import type { AgentTool } from "./tools/types";
import { assertAgentRole } from "./security";
import { maskAgentOutput } from "./masking";

// Structured public topics deliberately accept no free-text query, names, record
// content, street addresses or contact details. Only these labels leave the app.
const regions = {
  santa_rosa_rs: "Santa Rosa RS",
  horizontina_rs: "Horizontina RS",
  tres_de_maio_rs: "Três de Maio RS",
  tuparendi_rs: "Tuparendi RS",
  tucunduva_rs: "Tucunduva RS",
  porto_alegre_rs: "Porto Alegre RS",
  brasil: "Brasil",
} as const;
const topics = {
  precos_regionais: "mercado imobiliário preços de imóveis",
  mercado_local: "mercado imobiliário notícias",
  ipca: "IBGE IPCA índice oficial último mês",
  igpm: "FGV IGP-M índice oficial último mês",
} as const;
export const webResearchInput = z
  .object({
    topic: z.enum(["precos_regionais", "mercado_local", "ipca", "igpm"]),
    region: z
      .enum([
        "santa_rosa_rs",
        "horizontina_rs",
        "tres_de_maio_rs",
        "tuparendi_rs",
        "tucunduva_rs",
        "porto_alegre_rs",
        "brasil",
      ])
      .default("santa_rosa_rs"),
  })
  .strict();

export async function researchPublicMarket(
  input: z.infer<typeof webResearchInput>,
  options: { apiKey?: string; fetcher?: typeof fetch; signal?: AbortSignal } = {},
) {
  const params = webResearchInput.parse(input);
  const key = options.apiKey;
  if (!key)
    return {
      status: "not_configured",
      sources: [],
      message: "Pesquisa externa não configurada. Consulte apenas os dados do Gestão.",
    };
  const query = `${topics[params.topic]} ${params.topic === "ipca" || params.topic === "igpm" ? "Brasil" : regions[params.region]}`;
  const response = await (options.fetcher ?? fetch)("https://api.tavily.com/search", {
    method: "POST",
    signal: options.signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      query,
      max_results: 5,
      include_answer: false,
      include_raw_content: false,
      search_depth: "basic",
      ...(params.topic === "ipca"
        ? { include_domains: ["ibge.gov.br"] }
        : params.topic === "igpm"
          ? { include_domains: ["fgv.br"] }
          : {}),
    }),
  });
  if (!response.ok)
    throw new Error("A pesquisa externa está indisponível. Tente novamente depois.");
  const body = (await response.json()) as {
    results?: Array<{ title?: string; url?: string; content?: string }>;
  };
  const sources = (body.results ?? []).slice(0, 5).flatMap((item) => {
    try {
      const url = new URL(item.url ?? "");
      if (url.protocol !== "https:" || url.username || url.password) return [];
      return [
        {
          title: String(item.title ?? "Fonte").slice(0, 180),
          url: url.href,
          excerpt: String(item.content ?? "").slice(0, 600),
        },
      ];
    } catch {
      return [];
    }
  });
  return maskAgentOutput({
    status: "ok",
    topic: params.topic,
    region: regions[params.region],
    sources,
    message: sources.length
      ? "Fontes externas: verifique a data e a região antes de comparar."
      : "Não encontrei fontes para esta pesquisa.",
  });
}

export const webResearchTool: AgentTool = {
  name: "web_research",
  title: "Pesquisando o mercado imobiliário",
  description:
    "Pesquisa pública imobiliária regional ou índices oficiais. Nunca recebe nomes, documentos, contatos, endereços ou dados de proprietários.",
  inputSchema: webResearchInput,
  roles: ["admin"],
  async handler(input, ctx) {
    assertAgentRole(ctx, ["admin"]);
    const data = await researchPublicMarket(input, {
      apiKey: process.env.TAVILY_API_KEY,
      signal: ctx.signal,
    });
    return { content: [{ type: "text", text: data.message }], structuredContent: data };
  },
};
