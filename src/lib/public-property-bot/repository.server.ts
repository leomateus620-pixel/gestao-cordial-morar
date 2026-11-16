import { z } from "zod";
import {
  documentSchema,
  draftSchema,
  type BotBrand,
  type ChatInput,
  type SearchDraft,
  type SearchFilters,
  type TurnResult,
} from "./contracts";
import { BotError } from "./errors";
import { publicPlainText } from "./privacy";
import { readBoundedBody } from "./transport";
// Dedicated restricted credential. Never fall back to service_role or the internal assistant client.
async function rpc(
  name:
    | "configuration"
    | "open_session"
    | "read_session"
    | "suggestion_set"
    | "accept_turn"
    | "complete_turn"
    | "candidates"
    | "resolve"
    | "facets"
    | "take_voice"
    | "finish_voice"
    | "event"
    | "reserve_cost"
    | "insight_open"
    | "insight_turn"
    | "insight_whatsapp"
    | "usage",
  args: object,
  signal?: AbortSignal,
) {
  const base = process.env.PUBLIC_BOT_DATABASE_REST_URL;
  const credential = process.env.PUBLIC_BOT_GATEWAY_SECRET;
  const apiKey = process.env.PUBLIC_BOT_GATEWAY_KEY;
  if (!base || !credential || !apiKey) throw new BotError("service_unavailable");
  const url = new URL(base);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/rest/v1/"
  )
    throw new BotError("service_unavailable");
  const deadline = AbortSignal.any([AbortSignal.timeout(8000), ...(signal ? [signal] : [])]);
  const response = await fetch(new URL("rpc/public_bot_gateway", url), {
    method: "POST",
    signal: deadline,
    headers: {
      "Content-Type": "application/json",
      "Content-Profile": "public",
      "Accept-Profile": "public",
      apikey: apiKey,
      "X-Public-Bot-Key": credential,
    },
    body: JSON.stringify({ op: name, payload: args }),
  });
  if (!response.ok) throw new BotError("service_unavailable");
  const bytes = await readBoundedBody({ body: response.body, signal: deadline }, 2_000_000).catch(
    () => {
      throw new BotError("service_unavailable");
    },
  );
  const body = new TextDecoder().decode(bytes);
  try {
    return JSON.parse(body);
  } catch {
    throw new BotError("service_unavailable");
  }
}
const configSchema = z
  .object({
    enabled: z.boolean(),
    voice: z.boolean(),
    trends: z.boolean(),
    whatsapp: z.string().max(30),
  })
  .strict();
export type BotConfiguration = z.infer<typeof configSchema>;
export type Session = {
  id: string;
  draft: SearchDraft;
  exhausted?: boolean;
  turns: Array<{ requestId: string; answer: string; ids: string[] }>;
};
export type Acceptance = {
  state: "accepted" | "replay" | "busy" | "exhausted" | "burst" | "stale" | "interrupted";
  draft: SearchDraft;
  exhausted: boolean;
  result?: Omit<TurnResult, "cards"> & { ids: string[] };
};
const sessionSchema = z.object({
  id: z.string().uuid(),
  draft: draftSchema,
  exhausted: z.boolean().optional().default(false),
  turns: z
    .array(
      z.object({
        requestId: z.string().uuid(),
        answer: z.string().max(800),
        ids: z.array(z.string().uuid()).max(5),
      }),
    )
    .max(25),
});
function documents(raw: unknown) {
  return z
    .array(documentSchema)
    .max(200)
    .parse(raw)
    .map((d) => ({
      ...d,
      property: {
        ...d.property,
        description: publicPlainText(d.property.description),
        features: d.property.features.map(publicPlainText),
      },
    }));
}
export const repository = {
  async insightOpen(brand: BotBrand, tokenHash: string, eventId: string, signal?: AbortSignal) {
    return rpc("insight_open", { b: brand, token_hash: tokenHash, event_id: eventId }, signal);
  },
  async insightTurn(
    brand: BotBrand,
    tokenHash: string,
    requestId: string,
    question: string,
    signal?: AbortSignal,
  ) {
    return rpc(
      "insight_turn",
      {
        b: brand,
        token_hash: tokenHash,
        request_id: requestId,
        question: publicPlainText(question).slice(0, 1000),
      },
      signal,
    );
  },
  async insightWhatsapp(
    brand: BotBrand,
    tokenHash: string,
    event: {
      eventId: string;
      publicId: string | null;
      source: "header" | "card" | "quota" | "unavailable";
    },
    signal?: AbortSignal,
  ) {
    return rpc(
      "insight_whatsapp",
      {
        b: brand,
        token_hash: tokenHash,
        event_id: event.eventId,
        public_id: event.publicId,
        source: event.source,
      },
      signal,
    );
  },
  async configuration(brand: BotBrand, signal?: AbortSignal) {
    return configSchema.parse(await rpc("configuration", { b: brand }, signal));
  },
  async session(
    brand: BotBrand,
    tokenHash: string,
    identity: { key: string; day: string },
    signal?: AbortSignal,
  ): Promise<Session> {
    const data = await rpc(
      "open_session",
      { b: brand, token_hash: tokenHash, ip_key: identity.key },
      signal,
    );
    if (data?.code) throw new BotError(data.code, data.code === "burst" ? 429 : 503);
    return sessionSchema.parse(data);
  },
  async readSession(brand: BotBrand, tokenHash: string, signal?: AbortSignal): Promise<Session> {
    const data = await rpc("read_session", { b: brand, token_hash: tokenHash }, signal);
    if (!data) throw new BotError("session_expired", 401);
    return sessionSchema.parse(data);
  },
  async suggestions(brand: BotBrand, signal?: AbortSignal) {
    const { suggestionSchema } = await import("./contracts");
    return z
      .object({ version: z.string().max(80), suggestions: z.array(suggestionSchema).max(4) })
      .parse(await rpc("suggestion_set", { b: brand }, signal));
  },
  async accept(
    brand: BotBrand,
    hash: string,
    identity: { key: string; day: string },
    input: ChatInput,
    fingerprint: string,
    signal?: AbortSignal,
  ): Promise<Acceptance> {
    const data = await rpc(
      "accept_turn",
      {
        b: brand,
        token_hash: hash,
        ip_key: identity.key,
        local_day: identity.day,
        request_id: input.requestId,
        expected_revision: input.revision,
        fingerprint,
      },
      signal,
    );
    if (
      !data ||
      !["accepted", "replay", "busy", "exhausted", "burst", "stale", "interrupted"].includes(
        data.state,
      )
    )
      throw new BotError("service_unavailable");
    return { ...data, draft: draftSchema.parse(data.draft) };
  },
  async complete(brand: BotBrand, hash: string, result: TurnResult) {
    if (
      (await rpc("complete_turn", {
        b: brand,
        token_hash: hash,
        request_id: result.requestId,
        result,
      })) !== true
    )
      throw new BotError("stale_revision", 409);
  },
  async candidates(brand: BotBrand, filters: SearchFilters, signal?: AbortSignal) {
    return documents(await rpc("candidates", { b: brand, f: filters }, signal));
  },
  async resolve(brand: BotBrand, ids: string[], signal?: AbortSignal) {
    return documents(await rpc("resolve", { b: brand, ids }, signal));
  },
  async facets(brand: BotBrand, signal?: AbortSignal) {
    return z
      .object({
        types: z.array(z.string()).max(200),
        cities: z.array(z.string()).max(500),
        districts: z.array(z.object({ city: z.string(), district: z.string() })).max(5000),
        version: z.string().max(40),
      })
      .parse(await rpc("facets", { b: brand }, signal));
  },
  async reserveCost(brand: BotBrand, hash: string, requestId: string, signal?: AbortSignal) {
    if (
      (await rpc("reserve_cost", { b: brand, token_hash: hash, request_id: requestId }, signal)) !==
      true
    )
      throw new BotError("provider_unavailable");
  },
  async takeVoice(
    brand: BotBrand,
    hash: string,
    identity: { key: string; day: string },
    requestId: string,
    bytes: number,
    seconds: number,
    signal?: AbortSignal,
  ) {
    return rpc(
      "take_voice",
      {
        b: brand,
        token_hash: hash,
        ip_key: identity.key,
        local_day: identity.day,
        request_id: requestId,
        bytes,
        seconds,
      },
      signal,
    );
  },
  async finishVoice(brand: BotBrand, hash: string, requestId: string, ok: boolean) {
    return rpc("finish_voice", { b: brand, token_hash: hash, request_id: requestId, ok });
  },
  async event(brand: BotBrand, hash: string, event: object, signal?: AbortSignal) {
    return rpc("event", { b: brand, token_hash: hash, event }, signal);
  },
  async usage(
    brand: BotBrand,
    requestId: string,
    model: string,
    latency: number,
    inputTokens: number,
    outputTokens: number,
    code: string,
  ) {
    return rpc("usage", {
      b: brand,
      request_id: requestId,
      model,
      latency,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      code,
    });
  },
};
export type PublicRepository = typeof repository;
