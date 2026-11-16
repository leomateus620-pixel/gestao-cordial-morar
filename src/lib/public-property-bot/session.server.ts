import type { BotBrand } from "./contracts";
import { sha256 } from "./quota.server";
import { BotError } from "./errors";
export const cookieName = (brand: BotBrand) => `__Host-${brand}-property-bot`;
export function readToken(request: Request, brand: BotBrand): string | null {
  const values = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((p) => p.trim())
    .filter((p) => p.startsWith(`${cookieName(brand)}=`));
  if (values.length !== 1) return null;
  const token = values[0].slice(cookieName(brand).length + 1);
  return /^[a-f0-9]{64}$/.test(token) ? token : null;
}
export async function sessionHash(request: Request, brand: BotBrand) {
  const token = readToken(request, brand);
  if (!token) throw new BotError("session_expired", 401);
  return sha256(token);
}
export function newToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
}
export function sessionCookie(brand: BotBrand, token: string) {
  return `${cookieName(brand)}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400`;
}
