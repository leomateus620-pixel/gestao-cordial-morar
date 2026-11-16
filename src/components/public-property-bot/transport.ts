import { z } from "zod";
import {
  cardSchema,
  draftSchema,
  eventSchema,
  suggestionSchema,
  turnResultSchema,
  type BotBrand,
  type BotEvent,
  type ChatInput,
} from "@/lib/public-property-bot/contracts";
import { botBrand } from "@/lib/public-property-bot/brand-config";
export const sessionViewSchema = z.object({
  draft: draftSchema,
  turns: z
    .array(
      z.object({
        requestId: z.string().uuid(),
        answer: z.string().max(800),
        cards: z.array(cardSchema).max(5),
      }),
    )
    .max(25),
  voice: z.boolean(),
  enabled: z.boolean(),
  exhausted: z.boolean().optional().default(false),
  suggestions: z.array(suggestionSchema).max(4),
  contactHref: z.string().max(2000),
});
export type SessionView = z.infer<typeof sessionViewSchema>;
export class TransportError extends Error {
  constructor(
    public code: string,
    public retryAfter = 0,
  ) {
    super(code);
  }
}
async function checked(response: Response) {
  if (response.ok) return response;
  let code = "service_unavailable";
  try {
    const error = await response.json();
    if (typeof error?.code === "string") code = error.code;
  } catch {
    /* Public error copy never uses an infrastructure response. */
  }
  throw new TransportError(code, Number(response.headers.get("Retry-After")) || 0);
}
export async function openSession(brand: BotBrand, signal: AbortSignal): Promise<SessionView> {
  return sessionViewSchema.parse(
    await (
      await checked(
        await fetch(`${botBrand(brand).api}/session`, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: "{}",
          signal,
          cache: "no-store",
        }),
      )
    ).json(),
  );
}
export async function sendTurn(
  brand: BotBrand,
  input: ChatInput,
  signal: AbortSignal,
  receive: (event: BotEvent) => void,
) {
  const response = await checked(
    await fetch(`${botBrand(brand).api}/chat`, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify(input),
      signal,
    }),
  );
  if (response.headers.get("Content-Type")?.includes("application/json")) {
    const result = turnResultSchema.parse(await response.json());
    if (result.requestId !== input.requestId) throw new TransportError("invalid_response");
    receive({
      type: "done",
      sequence: 0,
      requestId: input.requestId,
      revision: result.draft.revision,
      result,
    });
    return;
  }
  if (!response.body || !response.headers.get("Content-Type")?.includes("text/event-stream"))
    throw new TransportError("invalid_response");
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffer = "",
    bytes = 0,
    sequence = -1,
    done = false;
  const frame = (value: string) => {
    const data = value
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data) return;
    const event = eventSchema.parse(JSON.parse(data));
    if (
      event.requestId !== input.requestId ||
      event.sequence <= sequence ||
      event.revision < input.revision
    )
      return;
    sequence = event.sequence;
    receive(event);
    if (event.type === "done") done = true;
  };
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 256_000) throw new TransportError("invalid_response");
      buffer += decoder.decode(chunk.value, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n");
      let end: number;
      while ((end = buffer.indexOf("\n\n")) >= 0) {
        frame(buffer.slice(0, end));
        buffer = buffer.slice(end + 2);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) frame(buffer);
    if (!done) throw new TransportError("interrupted");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export async function transcribe(
  brand: BotBrand,
  blob: Blob,
  requestId: string,
  signal: AbortSignal,
) {
  const response = await checked(
    await fetch(`${botBrand(brand).api}/transcribe`, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": blob.type, "X-Request-Id": requestId },
      body: blob,
      signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
    }),
  );
  return z.object({ text: z.string().trim().min(1).max(1800) }).parse(await response.json()).text;
}
export const publicErrorText = (code: string) =>
  ({
    burst: "Vamos com calma. Aguarde um instante e tente novamente.",
    busy: "Já há uma busca em andamento. Aguarde um instante e tente novamente.",
    stale: "Sua busca foi atualizada em outra aba. Recarregue a conversa para continuar.",
    stale_revision: "Sua busca foi atualizada em outra aba. Recarregue a conversa para continuar.",
    session_expired: "Sua conversa expirou. Reabra a busca para continuar.",
    interrupted: "A resposta foi interrompida. Você pode tentar recuperar este envio.",
    provider_unavailable:
      "Não consegui interpretar o pedido agora. Você pode usar os filtros ou falar com a equipe.",
    service_unavailable:
      "A busca por conversa está indisponível agora. Use a busca do site ou fale com a equipe.",
  })[code] ?? "Não foi possível concluir agora. Tente recuperar este envio ou fale com a equipe.";
