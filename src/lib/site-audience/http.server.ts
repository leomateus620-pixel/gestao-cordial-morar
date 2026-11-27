import type { SiteBrand } from "@/lib/cordial-site/brand";
import { siteDb } from "@/lib/cordial-site/service.server";
import { AUDIENCE_MAX_BATCH_BYTES, audienceBatchSchema, type AudienceEvent } from "./contract";
import {
  audienceEnvironment,
  audienceRequestIp,
  audienceRateKey,
  classifyAudienceAttribution,
  isAudienceHost,
  resolveAudienceSettings,
  verifyAudienceFormProof,
  type AudienceSettings,
} from "./privacy.server";

const headers = {
  "Cache-Control": "no-store, private",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
};
const disabled = () => Response.json({ enabled: false }, { headers });
const empty = (status: number) => new Response(null, { status, headers });

async function readBody(request: Request): Promise<Uint8Array | null> {
  if (Number(request.headers.get("content-length") ?? 0) > AUDIENCE_MAX_BATCH_BYTES) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const buffer = new Uint8Array(AUDIENCE_MAX_BATCH_BYTES);
  let length = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) return buffer.subarray(0, length);
      if (length + chunk.value.length > buffer.length) {
        void reader.cancel().catch(() => {});
        return null;
      }
      buffer.set(chunk.value, length);
      length += chunk.value.length;
    }
  } finally {
    reader.releaseLock();
  }
}

function audienceCollectionArgs(settings: AudienceSettings) {
  return {
    p_brand: settings.brand,
    p_environment: settings.environment,
    p_policy_version: settings.config.policyVersion,
  };
}

export async function publicSiteAudience(request: Request, brand: SiteBrand) {
  const isGet = request.method === "GET";
  const fetchSite = request.headers.get("sec-fetch-site");
  if (
    !isAudienceHost(request, brand, "audience") ||
    (fetchSite !== null && fetchSite !== "same-origin" && fetchSite !== "none")
  )
    return isGet ? disabled() : empty(404);

  const ip = audienceRequestIp(request, audienceEnvironment());
  if (!ip) return isGet ? disabled() : empty(403);
  if (!isGet) {
    if (request.method !== "POST") return empty(405);
    if (request.headers.get("origin") !== new URL(request.url).origin) return empty(403);
    if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json")
      return empty(415);
  }
  try {
    const settings = await resolveAudienceSettings(brand);
    if (!settings) return isGet ? disabled() : empty(404);
    const args = audienceCollectionArgs(settings);
    if (isGet) {
      if (settings.environment === "qa") {
        const { data, error } = await siteDb(request.signal).rpc(
          "site_audience_collection_status",
          args,
        );
        if (error || data !== true) return disabled();
      }
      return Response.json(settings.config, { headers });
    }

    if (request.headers.get("X-Site-Audience-Policy") !== settings.config.policyVersion)
      return empty(403);

    const body = await readBody(request);
    if (!body) return empty(413);
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
    } catch {
      return empty(400);
    }
    const input = audienceBatchSchema.safeParse(parsed);
    if (!input.success) return empty(400);

    const attribution = classifyAudienceAttribution(
      input.data.events[0].kind === "session_start" ? input.data.events[0].attribution : undefined,
      settings,
    );
    const events: (
      | AudienceEvent
      | Omit<Extract<AudienceEvent, { kind: "form_received" }>, "proof">
    )[] = [];
    for (const event of input.data.events) {
      if (event.kind === "form_received") {
        const { proof, ...confirmed } = event;
        const id = await verifyAudienceFormProof(settings, proof, event.propertyId);
        // A bad/expired proof may be dropped without discarding independent valid measurements.
        if (id) events.push({ ...confirmed, id });
      } else if (event.kind === "session_start") {
        // The original referrer or any unapproved campaign labels never enter the database.
        const { attribution: _discarded, ...clean } = event;
        events.push(clean);
      } else {
        events.push(event);
      }
    }
    if (!events.length) return empty(204);

    // Do not attach the site document's request signal to accepted keepalive POSTs.
    const { data, error } = await siteDb().rpc("site_audience_ingest", {
      ...args,
      p_bucket: await audienceRateKey(settings, ip),
      p_session_id: input.data.sessionId,
      p_visitor_id: input.data.visitorId,
      p_events: events,
      p_channel: attribution.channel,
      p_source: attribution.source,
      p_medium: attribution.medium,
      p_campaign: attribution.campaign,
    });
    if (error) return empty(503);
    switch (data) {
      case "ok":
        return empty(204);
      case "disabled":
        return empty(404);
      case "limited":
        return empty(429);
      case "missing_session":
      case "expired_session":
        return empty(409);
      default:
        return empty(400);
    }
  } catch {
    // Avoid retaining visitor payloads, IPs, headers, proofs or database diagnostics in logs.
    return isGet ? disabled() : empty(503);
  }
}
