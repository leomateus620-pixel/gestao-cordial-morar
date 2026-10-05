import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { canonicalJson } from "./fiscal-profile";

export function snapshotHash(snapshot: unknown): string {
  return createHash("sha256").update(canonicalJson(snapshot)).digest("hex");
}

export function signPreview(hash: string, actor: string, secret: string, now = Date.now()): string {
  const expires = now + 15 * 60_000;
  const signature = createHmac("sha256", secret)
    .update(`nfse-preview-v1:${actor}:${expires}:${hash}`)
    .digest("hex");
  return `${expires}.${signature}`;
}

export function verifyPreview(
  token: string,
  hash: string,
  actor: string,
  secret: string,
  now = Date.now(),
): boolean {
  if (token.split(".").length !== 2) return false;
  const [expires, signature] = token.split(".");
  if (!expires || !signature || !/^\d+$/.test(expires) || !/^[a-f0-9]{64}$/.test(signature))
    return false;
  if (Number(expires) < now || Number(expires) > now + 15 * 60_000) return false;
  const expected = createHmac("sha256", secret)
    .update(`nfse-preview-v1:${actor}:${expires}:${hash}`)
    .digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}
