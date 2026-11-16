import { z } from "zod";
import { sitePublicHost } from "../cordial-site/domains";
import {
  chatInputSchema,
  normalizedEventSchema,
  newDraft,
  type BotBrand,
  type BotEvent,
} from "./contracts";
import { repository, type PublicRepository } from "./repository.server";
import { BotError } from "./errors";
import { dailyIdentity, sha256 } from "./quota.server";
import { newToken, readToken, sessionCookie, sessionHash } from "./session.server";
import { centralContact, toCard } from "./cards";
import {
  prepareTurn,
  runTurn,
  TurnNotAccepted,
  type TurnDependencies,
} from "./orchestrator.server";
import { interpret } from "./provider.server";
import { publicSuggestions } from "./suggestions.server";
import { transcribeRequest, voiceAvailable } from "./voice.server";
import { QUOTA_MESSAGE } from "./brand-config";
import { readBoundedBody } from "./transport";
export { readBoundedBody } from "./transport";

export type BotEndpoint = "session" | "chat" | "suggestions" | "transcribe" | "events";
export const publicBotHeaders = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};
const publicMessages: Record<string, string> = {
  quota_exhausted: QUOTA_MESSAGE,
  burst: "Aguarde um momento e tente novamente.",
  busy: "Sua busca ainda está em andamento. Aguarde um momento.",
  stale_revision: "Sua busca mudou em outra janela. Atualize os filtros para continuar.",
  interrupted:
    "Esse envio foi interrompido. Seus filtros estão preservados; você pode fazer um novo envio.",
  session_expired: "Sua sessão expirou. Reabra o assistente para continuar.",
  invalid_request: "Revise a mensagem ou seleção e tente novamente.",
  request_timeout: "O envio demorou demais. Confira sua conexão e tente novamente.",
  invalid_audio: "Não consegui ler esse áudio. Grave novamente ou digite sua mensagem.",
  audio_too_large: "Grave um áudio de até um minuto e 10 MB.",
  audio_too_long: "Grave um áudio de até um minuto.",
  empty_audio: "Não identifiquei fala no áudio. Grave novamente ou digite sua mensagem.",
  voice_unavailable: "A transcrição está indisponível agora. Você pode digitar sua mensagem.",
  service_unavailable:
    "O assistente está indisponível agora. Use a busca do site ou fale com nossa equipe pelo WhatsApp.",
  not_found: "Não encontrado.",
};
/** No forwarded host/IP, client brand, bearer or employee session participates in authority. */
export function validatePublicBotRequest(
  request: Request,
  brand: BotBrand,
  endpoint: BotEndpoint,
  env = process.env,
) {
  const url = new URL(request.url);
  if (url.pathname !== `/api/${brand}-site/bot/${endpoint}` || url.search)
    throw new BotError("not_found", 404);
  for (const candidate of ["cordial", "morar"] as const) {
    const prefix = candidate === "cordial" ? "CORDIAL_SITE" : "MORAR_SITE";
    const host = sitePublicHost(candidate, env[`VITE_${prefix}_PUBLIC_HOST`]);
    if ([host, `www.${host}`].includes(url.host.toLowerCase()) && candidate !== brand)
      throw new BotError("not_found", 404);
  }
  const expectedMethod = endpoint === "suggestions" ? "GET" : "POST";
  if (request.method !== expectedMethod) throw new BotError("invalid_request", 405);
  const origin = request.headers.get("origin");
  if (
    (expectedMethod === "POST" && origin !== url.origin) ||
    (origin && origin !== url.origin) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new BotError("invalid_request", 403);
  if (
    request.method === "POST" &&
    endpoint !== "transcribe" &&
    request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !==
      "application/json"
  )
    throw new BotError("invalid_request", 415);
}
async function jsonBody(request: Request) {
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(await readBoundedBody(request, 8192, 5000)),
    );
  } catch (error) {
    if (error instanceof BotError) throw error;
    throw new BotError("invalid_request", 400);
  }
}
export function publicBotError(error: unknown): Response {
  const failure =
    error instanceof BotError
      ? error
      : error instanceof z.ZodError
        ? new BotError("invalid_request", 400)
        : new BotError("service_unavailable");
  return Response.json(
    {
      code: failure.code,
      message: publicMessages[failure.code] ?? publicMessages.service_unavailable,
      retryAfter: failure.retryAfter,
      ...(failure instanceof TurnNotAccepted ? { draft: failure.draft } : {}),
    },
    {
      status: failure.status,
      headers: {
        ...publicBotHeaders,
        ...(failure.status === 429 || failure.status === 503
          ? { "Retry-After": String(failure.retryAfter) }
          : {}),
      },
    },
  );
}
export async function handlePublicBot(
  request: Request,
  brand: BotBrand,
  endpoint: BotEndpoint,
  dependencies: TurnDependencies = { repo: repository, interpret },
): Promise<Response> {
  const repo = dependencies.repo;
  try {
    validatePublicBotRequest(request, brand, endpoint);
    const identity = await dailyIdentity(request);
    if (endpoint === "session") {
      z.object({})
        .strict()
        .parse(await jsonBody(request));
      const config = await repo.configuration(brand, request.signal);
      if (!config.enabled) throw new BotError("service_unavailable");
      const token = readToken(request, brand) ?? newToken();
      const hash = await sha256(token);
      const session = await repo.session(brand, hash, identity, request.signal);
      const ids = [...new Set(session.turns.flatMap((t) => t.ids))];
      const documents = ids.length ? await repo.resolve(brand, ids, request.signal) : [];
      const map = new Map(
        documents.filter((d) => d.brand === brand).map((d) => [d.property.id, d]),
      );
      const turns = session.turns.map((t) => {
        const cards = t.ids.flatMap((id) =>
          map.has(id) ? [toCard(map.get(id)!, config.whatsapp)] : [],
        );
        return {
          requestId: t.requestId,
          answer: t.ids.length
            ? cards.length
              ? "Opções desta resposta anterior, atualizadas com os anúncios disponíveis agora."
              : "Os imóveis desta resposta anterior não estão mais disponíveis neste site."
            : t.answer,
          cards,
        };
      });
      const suggestions = await publicSuggestions(repo, brand, request.signal).catch(() => []);
      return Response.json(
        {
          draft: session.draft,
          exhausted: session.exhausted ?? false,
          turns,
          voice: config.voice && voiceAvailable(),
          enabled: true,
          suggestions,
          contactHref: centralContact(brand, config.whatsapp),
        },
        { headers: { ...publicBotHeaders, "Set-Cookie": sessionCookie(brand, token) } },
      );
    }
    const hash = await sessionHash(request, brand);
    if (endpoint === "suggestions") {
      await repo.readSession(brand, hash, request.signal);
      return Response.json(
        { suggestions: await publicSuggestions(repo, brand, request.signal) },
        { headers: publicBotHeaders },
      );
    }
    if (endpoint === "events") {
      const event = normalizedEventSchema.parse(await jsonBody(request));
      await repo.event(brand, hash, event, request.signal);
      return new Response(null, { status: 204, headers: publicBotHeaders });
    }
    if (endpoint === "transcribe") {
      const config = await repo.configuration(brand, request.signal);
      if (!config.enabled || !config.voice || !voiceAvailable())
        throw new BotError("voice_unavailable");
      return Response.json(await transcribeRequest(request, brand, hash, identity, repo), {
        headers: publicBotHeaders,
      });
    }
    const input = chatInputSchema.parse(await jsonBody(request));
    const prepared = await prepareTurn(brand, hash, identity, input, request.signal, dependencies);
    const abort = new AbortController();
    const signal = AbortSignal.any([request.signal, abort.signal]);
    const encoder = new TextEncoder();
    let closed = false;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: BotEvent) => {
          if (closed) return;
          try {
            controller.enqueue(
              encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`),
            );
          } catch {
            closed = true;
            abort.abort();
          }
        };
        try {
          await runTurn(prepared, signal, send, dependencies);
        } catch {
          send({
            requestId: input.requestId,
            revision: prepared.acceptance.draft.revision,
            sequence: 999,
            type: "error",
            code: "service_unavailable",
            message: publicMessages.service_unavailable,
          });
        } finally {
          if (!closed) {
            closed = true;
            controller.close();
          }
        }
      },
      cancel() {
        closed = true;
        abort.abort();
      },
    });
    return new Response(stream, {
      headers: {
        ...publicBotHeaders,
        "Content-Type": "text/event-stream; charset=utf-8",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return publicBotError(error);
  }
}
