import { isIP } from "node:net";
import { BotError } from "./errors";
export function saoPauloDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  return ["year", "month", "day"].map((k) => parts.find((p) => p.type === k)!.value).join("-");
}
export function secondsToRenewal(now = new Date()) {
  // Find the next date boundary in the named timezone, independent of browser/host timezone.
  const day = saoPauloDay(now);
  let lo = now.getTime(),
    hi = lo + 27 * 3600000;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (saoPauloDay(new Date(mid)) === day) lo = mid;
    else hi = mid;
  }
  return Math.max(1, Math.ceil((hi - now.getTime()) / 1000));
}
export function normalizeIp(raw: string) {
  if (!isIP(raw) || raw.includes("%")) throw new BotError("service_unavailable");
  if (isIP(raw) === 4) return raw;
  const normalized = new URL(`http://[${raw}]/`).hostname.slice(1, -1);
  const mapped = /^::ffff:([a-f0-9]+):([a-f0-9]+)$/.exec(normalized);
  if (mapped) {
    const a = parseInt(mapped[1], 16),
      b = parseInt(mapped[2], 16);
    return [a >> 8, a & 255, b >> 8, b & 255].join(".");
  }
  return normalized;
}
export async function sha256(value: string) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))),
    (x) => x.toString(16).padStart(2, "0"),
  ).join("");
}
export async function dailyIdentity(request: Request, env = process.env, now = new Date()) {
  const header = env.PUBLIC_BOT_TRUSTED_IP_HEADER;
  // This setting is a deployment attestation: the ingress MUST overwrite it and block direct origin access.
  if (
    env.PUBLIC_BOT_INGRESS_VERIFIED !== "true" ||
    !header ||
    !["cf-connecting-ip", "x-real-ip"].includes(header) ||
    !env.PUBLIC_BOT_IP_SECRET ||
    env.PUBLIC_BOT_IP_SECRET.length < 32
  )
    throw new BotError("service_unavailable");
  const ip = normalizeIp(request.headers.get(header) ?? "");
  // Cloudflare cross-zone Workers replace the visitor IP with this shared sentinel.
  // Pseudo IPv4's reserved Class E values likewise are not a stable real client address.
  // https://developers.cloudflare.com/fundamentals/reference/http-headers/
  if (ip === "2a06:98c0:3600::103" || (isIP(ip) === 4 && Number(ip.split(".")[0]) >= 240))
    throw new BotError("service_unavailable");
  const day = saoPauloDay(now);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.PUBLIC_BOT_IP_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${day}\n${ip}`),
  );
  return {
    day,
    key: Array.from(new Uint8Array(signature), (x) => x.toString(16).padStart(2, "0")).join(""),
  };
}
