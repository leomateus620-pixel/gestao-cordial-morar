import { createHmac, timingSafeEqual } from "node:crypto";

export const MAX_META_WEBHOOK_BYTES = 1_048_576;
export type MetaWebhookEvent = {
  page_id: string;
  leadgen_id: string;
  form_id?: string;
  ad_id?: string;
  adset_id?: string;
  campaign_id?: string;
  created_time?: string;
};
export type MetaWebhookApp = { appId: string; appSecret: string; verifyToken: string };
const id = (v: unknown) => (typeof v === "string" && /^\d{1,80}$/.test(v) ? v : undefined);
const object = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

export function validateMetaSignature(
  bytes: Uint8Array,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature || !/^sha256=[a-fA-F0-9]{64}$/.test(signature) || !secret) return false;
  const expected = createHmac("sha256", secret).update(bytes).digest();
  return timingSafeEqual(expected, Buffer.from(signature.slice(7), "hex"));
}
export function parseMetaLeadgen(body: unknown): MetaWebhookEvent[] {
  const root = object(body);
  if (!root || root.object !== "page" || !Array.isArray(root.entry) || root.entry.length > 1000)
    throw new Error("invalid_envelope");
  const result: MetaWebhookEvent[] = [];
  for (const entryValue of root.entry) {
    const entry = object(entryValue);
    if (!entry || !id(entry.id) || !Array.isArray(entry.changes)) throw new Error("invalid_entry");
    for (const changeValue of entry.changes) {
      const change = object(changeValue);
      if (!change || change.field !== "leadgen") continue;
      const value = object(change.value);
      if (
        !value ||
        !id(value.leadgen_id) ||
        (value.page_id !== undefined && value.page_id !== entry.id)
      )
        throw new Error("invalid_leadgen");
      const seconds =
        typeof value.created_time === "number"
          ? value.created_time
          : typeof value.created_time === "string" && /^\d+$/.test(value.created_time)
            ? Number(value.created_time)
            : null;
      const date = seconds === null ? null : new Date(seconds * 1000);
      result.push({
        page_id: entry.id as string,
        leadgen_id: value.leadgen_id as string,
        form_id: id(value.form_id),
        ad_id: id(value.ad_id),
        adset_id: id(value.adset_id),
        campaign_id: id(value.campaign_id),
        created_time: date && Number.isFinite(date.getTime()) ? date.toISOString() : undefined,
      });
      if (result.length > 1000) throw new Error("too_many_events");
    }
  }
  return result;
}
export function metaWebhookChallenge(request: Request, apps: MetaWebhookApp[]): Response {
  const query = new URL(request.url).searchParams;
  if (!apps.length) return new Response("Webhook not configured", { status: 503 });
  const supplied = query.get("hub.verify_token") ?? "";
  const accepted = apps.some((app) => {
    const expected = Buffer.from(app.verifyToken);
    const actual = Buffer.from(supplied);
    return (
      expected.length > 0 && expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  });
  const challenge = query.get("hub.challenge");
  if (
    query.get("hub.mode") !== "subscribe" ||
    !accepted ||
    challenge === null ||
    challenge.length > 2000
  )
    return new Response("Forbidden", { status: 403 });
  return new Response(challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
async function readBounded(request: Request): Promise<Uint8Array> {
  const declared = request.headers.get("content-length");
  if (declared && Number(declared) > MAX_META_WEBHOOK_BYTES) throw new Error("body_too_large");
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > MAX_META_WEBHOOK_BYTES) {
      await reader.cancel();
      throw new Error("body_too_large");
    }
    chunks.push(chunk.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
export async function receiveMetaWebhook(
  request: Request,
  apps: MetaWebhookApp[],
  persist: (appId: string, events: MetaWebhookEvent[]) => Promise<void>,
): Promise<Response> {
  if (!apps.length) return new Response("Webhook not configured", { status: 503 });
  let bytes: Uint8Array;
  try {
    bytes = await readBounded(request);
  } catch {
    return new Response("Payload too large", { status: 413 });
  }
  const matches = apps.filter((app) =>
    validateMetaSignature(bytes, request.headers.get("x-hub-signature-256"), app.appSecret),
  );
  const appIds = new Set(matches.map((app) => app.appId));
  if (!matches.length) return new Response("Forbidden", { status: 403 });
  if (appIds.size !== 1) return new Response("Ambiguous app configuration", { status: 503 });
  let events: MetaWebhookEvent[];
  try {
    events = parseMetaLeadgen(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
  } catch {
    return new Response("Invalid event envelope", { status: 400 });
  }
  try {
    await persist(matches[0].appId, events);
  } catch {
    return new Response("Persistence unavailable", { status: 503 });
  }
  return new Response("EVENT_RECEIVED", { status: 200, headers: { "Cache-Control": "no-store" } });
}
