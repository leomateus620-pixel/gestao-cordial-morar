import { z } from "zod";
import { lovableCompletion } from "../chat.server";
import { interimTier, type AssistantTier } from "../model-routing";

export const routeIntents = [
  "consulta",
  "acao",
  "analise",
  "pesquisa",
  "conteudo",
  "conversa",
] as const;

export const routeDecisionSchema = z
  .object({
    intent: z.enum(routeIntents),
    entidades: z
      .object({
        cliente: z.string().trim().max(200).optional(),
        imovel: z.string().trim().max(200).optional(),
        data: z.string().trim().max(40).optional(),
        faixa_preco: z.string().trim().max(80).optional(),
        bairro: z.string().trim().max(120).optional(),
        dormitorios: z.number().int().min(0).max(20).optional(),
        finalidade: z.string().trim().max(40).optional(),
      })
      .strict()
      .default({}),
    faltando: z.array(z.string().trim().max(120)).max(10).default([]),
    precisa_externo: z.boolean().default(false),
  })
  .strict();

export type RouteDecision = z.infer<typeof routeDecisionSchema>;

/** Maps the router's classified intent to the model tier used for the real turn. */
export const INTENT_TIER: Record<(typeof routeIntents)[number], AssistantTier> = {
  analise: "analysis",
  consulta: "fast",
  acao: "fast",
  pesquisa: "fast",
  conteudo: "fast",
  conversa: "fast",
};

export interface RouteResult {
  decision: RouteDecision;
  tier: AssistantTier;
}

const ROUTER_SYSTEM = `Você classifica a mensagem de um corretor/gestor de imobiliária em uma intenção de atendimento.
Responda SOMENTE com um objeto JSON válido, sem texto antes ou depois, seguindo este formato exato:
{"intent":"consulta|acao|analise|pesquisa|conteudo|conversa","entidades":{"cliente":"","imovel":"","data":"","faixa_preco":"","bairro":"","dormitorios":0,"finalidade":""},"faltando":["..."],"precisa_externo":false}
Regras de intenção:
- consulta: pedir dados já existentes no sistema (clientes, imóveis, atendimentos, agenda).
- acao: pedir para preparar/realizar uma mudança (agendar, enviar, mover etapa).
- analise: pedir comparação, relatório, tendência ou cenário sobre a carteira.
- pesquisa: pedir informação da internet/externa (notícias, cotações, mercado fora do sistema).
- conteudo: pedir texto, mensagem ou anúncio para redigir.
- conversa: saudação, agradecimento ou bate-papo sem necessidade de dado algum.
Omita do objeto "entidades" qualquer campo que não apareça na mensagem. "faltando" lista, em português, os dados que faltam para atender o pedido (pode ser vazio). "precisa_externo" é true apenas quando a resposta depende de dados fora do sistema (internet).`;

function fallbackDecision(message: string): RouteDecision {
  const intent = interimTier(message) === "analysis" ? "analise" : "consulta";
  return { intent, entidades: {}, faltando: [], precisa_externo: false };
}

function extractJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) throw new Error("router_no_json");
  return JSON.parse(text.slice(start, end + 1));
}

/** Classifies a user message into an intent and entities before the real assistant turn runs.
 * Any upstream or validation failure falls back to the interim heuristic tier; this never throws. */
export async function routeMessage(
  message: string,
  config: { apiKey: string; model: string; fetcher?: typeof fetch; signal?: AbortSignal },
): Promise<RouteResult> {
  try {
    const completion = await lovableCompletion(
      {
        messages: [
          { role: "system", content: ROUTER_SYSTEM },
          { role: "user", content: message.slice(0, 4000) },
        ],
        tools: [],
        signal: config.signal ?? AbortSignal.timeout(15_000),
      },
      { apiKey: config.apiKey, model: config.model, maxTokens: 400, fetcher: config.fetcher },
    );
    const decision = routeDecisionSchema.parse(extractJsonObject(completion.text));
    return { decision, tier: INTENT_TIER[decision.intent] };
  } catch {
    const decision = fallbackDecision(message);
    return { decision, tier: INTENT_TIER[decision.intent] };
  }
}
