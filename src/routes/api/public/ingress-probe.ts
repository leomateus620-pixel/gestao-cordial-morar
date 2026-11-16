import { createFileRoute } from "@tanstack/react-router";

// TEMPORARY ingress diagnostic: returns only HMACs (keyed by the caller's nonce) of IP headers.
// Never returns raw IPs; the caller can only learn hashes of values it already knows. Remove after validation.
const CANDIDATES = ["cf-connecting-ip", "true-client-ip", "x-real-ip", "x-forwarded-for"] as const;

async function hmac(key: string, value: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const s = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(s), (x) => x.toString(16).padStart(2, "0")).join("");
}

export const Route = createFileRoute("/api/public/ingress-probe")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const nonce = request.headers.get("x-probe-nonce") ?? "";
        if (!/^[a-f0-9]{32,128}$/.test(nonce)) return new Response("Not found", { status: 404 });
        const out: Record<string, string | null> = {};
        for (const name of CANDIDATES) {
          const v = request.headers.get(name);
          out[name] = v === null ? null : await hmac(nonce, v.trim());
        }
        const xff = request.headers.get("x-forwarded-for");
        if (xff) {
          const parts = xff.split(",").map((p) => p.trim()).filter(Boolean);
          out["xff-first"] = await hmac(nonce, parts[0] ?? "");
          out["xff-last"] = await hmac(nonce, parts[parts.length - 1] ?? "");
          out["xff-count"] = String(parts.length);
        }
        return Response.json(
          { host: new URL(request.url).host, headers: out },
          { headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } },
        );
      },
    },
  },
});
