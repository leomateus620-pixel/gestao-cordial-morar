import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { publicPropertySchema, type PublicProperty } from "@/lib/cordial-site/contract";
import { VISITOR_SELECTION_LIMIT } from "./visitor-rules";

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const resultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), expiresAt: z.string() }),
  z.object({
    ok: z.literal(false),
    error: z.enum(["limit", "request_reused", "expired", "unavailable"]),
  }),
]);
export type VisitorSaveResult =
  | { ok: true; token: string; expiresAt: string }
  | { ok: false; error: "limit" | "request_reused" | "expired" | "unavailable" | "rate_limited" };
export type VisitorPublicSelection =
  | { state: "invalid" | "expired" | "unavailable" | "rate_limited" }
  | {
      state: "ok";
      expiresAt: string;
      items: Array<
        | { key: number; available: false }
        | { key: number; available: true; property: PublicProperty }
      >;
    };

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join(
    "",
  );
}
async function tokenForRequest(requestId: string) {
  const secret = process.env.CORDIAL_SITE_RATE_SECRET;
  if (!secret) throw new Error("Selection configuration unavailable");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`visitor-selection:v1:${requestId}`),
  );
  return Array.from(new Uint8Array(signature), (value) => value.toString(16).padStart(2, "0")).join(
    "",
  );
}
async function publicReadHeaders() {
  const { setResponseHeader } = await import("@tanstack/react-start/server");
  setResponseHeader("Cache-Control", "no-store, private");
  setResponseHeader("X-Robots-Tag", "noindex, nofollow");
}

/** Separate entry point: it cannot call the authenticated save/close RPCs or choose a broker. */
export const createVisitorSelection = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) =>
    z
      .object({
        requestId: z.string().uuid(),
        ids: z.array(z.string().uuid()).min(1).max(VISITOR_SELECTION_LIMIT),
      })
      .strict()
      .parse(value),
  )
  .handler(async ({ data }): Promise<VisitorSaveResult> => {
    await publicReadHeaders();
    try {
      const [{ getRequest }, { limit }, { siteDb }] = await Promise.all([
        import("@tanstack/react-start/server"),
        import("@/lib/cordial-site/http.server"),
        import("@/lib/cordial-site/service.server"),
      ]);
      const request = getRequest();
      // Start's server function checks remain in force; also reject a foreign Origin explicitly.
      const origin = request.headers.get("origin");
      if (origin && origin !== new URL(request.url).origin)
        return { ok: false, error: "unavailable" };
      if (!(await limit(request, "visitor-selection-create", 8)))
        return { ok: false, error: "rate_limited" };
      const token = await tokenForRequest(data.requestId);
      const requestHash = await sha256(`visitor-request:${token}`),
        tokenHash = await sha256(token);
      const { data: raw, error } = await siteDb().rpc("shared_selection_visitor_create", {
        p_request_hash: requestHash,
        p_token_hash: tokenHash,
        p_public_ids: [...new Set(data.ids)],
      });
      if (error) return { ok: false, error: "unavailable" };
      const result = resultSchema.parse(raw);
      return result.ok ? { ok: true, token, expiresAt: result.expiresAt } : result;
    } catch {
      return { ok: false, error: "unavailable" };
    }
  });

/** Every read projects the current eligible Cordial documents, including after withdrawal. */
export const getVisitorSelection = createServerFn({ method: "GET" })
  .inputValidator((value: unknown) =>
    z
      .object({ token: z.string().max(128) })
      .strict()
      .parse(value),
  )
  .handler(async ({ data }): Promise<VisitorPublicSelection> => {
    await publicReadHeaders();
    if (!hashSchema.safeParse(data.token).success) return { state: "invalid" };
    try {
      const [{ getRequest }, { limit }, { siteDb }] = await Promise.all([
        import("@tanstack/react-start/server"),
        import("@/lib/cordial-site/http.server"),
        import("@/lib/cordial-site/service.server"),
      ]);
      if (!(await limit(getRequest(), "visitor-selection-read", 60)))
        return { state: "rate_limited" };
      const { data: raw, error } = await siteDb().rpc("shared_selection_visitor_public", {
        p_token_hash: await sha256(data.token),
      });
      if (error) return { state: "unavailable" };
      const result = z
        .discriminatedUnion("state", [
          z.object({ state: z.enum(["invalid", "expired"]) }),
          z.object({
            state: z.literal("ok"),
            expiresAt: z.string(),
            items: z
              .array(
                z.discriminatedUnion("available", [
                  z.object({ available: z.literal(false), key: z.number() }),
                  z.object({
                    available: z.literal(true),
                    key: z.number(),
                    property: publicPropertySchema,
                  }),
                ]),
              )
              .max(VISITOR_SELECTION_LIMIT),
          }),
        ])
        .parse(raw);
      if (result.state !== "ok") return result;
      return {
        ...result,
        items: result.items.map((item) =>
          item.available
            ? {
                ...item,
                property: { ...item.property, address: null, description: "", features: [] },
              }
            : item,
        ),
      };
    } catch {
      return { state: "unavailable" };
    }
  });
