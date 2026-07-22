// SERVER ONLY. Never import from client-reachable modules at top level.
// Google OAuth + Drive v3 helpers used to sync rental attachments.
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

// Minimum scopes for creating / uploading / renaming / replacing / trashing
// files owned by the application. `drive.file` restricts access to files that
// were created or explicitly opened via this app — safest possible surface.
export const DRIVE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive.file",
].join(" ");

function clientId() {
  const v = process.env.GOOGLE_OAUTH_CLIENT_ID;
  if (!v) throw new Error("GOOGLE_OAUTH_CLIENT_ID não configurado");
  return v;
}
function clientSecret() {
  const v = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!v) throw new Error("GOOGLE_OAUTH_CLIENT_SECRET não configurado");
  return v;
}
function stateSecret() {
  const v = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!v) throw new Error("SUPABASE_SERVICE_ROLE_KEY ausente");
  return v;
}

export function getRedirectUri(origin: string) {
  return `${origin.replace(/\/$/, "")}/api/public/google-drive/callback`;
}

function b64url(buf: Buffer | string) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
function b64urlDecode(s: string) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Buffer.from(s, "base64");
}

export function signState(payload: { userId: string; origin: string }) {
  const body = { ...payload, exp: Date.now() + 10 * 60 * 1000, k: "gdrive" };
  const json = b64url(JSON.stringify(body));
  const sig = b64url(createHmac("sha256", stateSecret()).update(json).digest());
  return `${json}.${sig}`;
}
export function verifyState(token: string): { userId: string; origin: string } {
  const [json, sig] = token.split(".");
  if (!json || !sig) throw new Error("state inválido");
  const expected = b64url(createHmac("sha256", stateSecret()).update(json).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("state assinatura inválida");
  const data = JSON.parse(b64urlDecode(json).toString("utf8")) as {
    userId: string;
    origin: string;
    exp: number;
    k?: string;
  };
  if (data.k !== "gdrive") throw new Error("state kind inválido");
  if (Date.now() > data.exp) throw new Error("state expirado");
  return { userId: data.userId, origin: data.origin };
}

export function buildAuthUrl(state: string, origin: string) {
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", clientId());
  url.searchParams.set("redirect_uri", getRedirectUri(origin));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", DRIVE_SCOPES);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  return url.toString();
}

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
};

export async function exchangeCode(code: string, origin: string): Promise<TokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: getRedirectUri(origin),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange falhou: ${res.status} ${await res.text()}`);
  return res.json();
}

async function refreshAccessToken(refresh_token: string): Promise<TokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token,
      client_id: clientId(),
      client_secret: clientSecret(),
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Refresh token falhou: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function getUserinfo(accessToken: string): Promise<{ email: string }> {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Userinfo falhou: ${res.status}`);
  return res.json();
}

export async function revokeToken(token: string) {
  try {
    await fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: "POST" });
  } catch {
    // Ignore — we still delete the DB row.
  }
}

type ConnectionRow = {
  user_id: string;
  google_email: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  scope: string | null;
};

export async function getConnectionForUser(userId: string): Promise<ConnectionRow | null> {
  const { data, error } = await supabaseAdmin
    .from("google_drive_connections")
    .select("user_id,google_email,access_token,refresh_token,expires_at,scope")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ConnectionRow | null) ?? null;
}

export async function getValidAccessToken(conn: ConnectionRow): Promise<string> {
  const expires = new Date(conn.expires_at).getTime();
  if (expires - 60_000 > Date.now()) return conn.access_token;
  const refreshed = await refreshAccessToken(conn.refresh_token);
  const newExpires = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  await supabaseAdmin
    .from("google_drive_connections")
    .update({
      access_token: refreshed.access_token,
      expires_at: newExpires,
      last_error: null,
    })
    .eq("user_id", conn.user_id);
  return refreshed.access_token;
}

async function markConnError(userId: string, err: string) {
  await supabaseAdmin
    .from("google_drive_connections")
    .update({ last_error: err.slice(0, 500) })
    .eq("user_id", userId);
}

async function driveFetch(
  accessToken: string,
  url: string,
  init: RequestInit = {},
  attempt = 0,
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  const res = await fetch(url, { ...init, headers });
  if ((res.status === 429 || res.status >= 500) && attempt < 3) {
    const backoff = 400 * Math.pow(2, attempt);
    await new Promise((r) => setTimeout(r, backoff));
    return driveFetch(accessToken, url, init, attempt + 1);
  }
  return res;
}

async function driveJson<T = unknown>(
  accessToken: string,
  url: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await driveFetch(accessToken, url, init);
  if (!res.ok) {
    throw new Error(`Drive API ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

// ================= Public helpers =================

export function sanitizeSegment(s: string, max = 80) {
  return (s || "")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function buildFolderName(opts: {
  address: string;
  tenantName: string;
  contractId: string;
}) {
  const short = opts.contractId.split("-")[0] ?? opts.contractId.slice(0, 8);
  return `Aluguel - ${sanitizeSegment(opts.address, 80)} - ${sanitizeSegment(
    opts.tenantName,
    60,
  )} - ${short}`.slice(0, 240);
}

export async function ensureFolder(
  accessToken: string,
  folderName: string,
): Promise<{ id: string; webViewLink: string; name: string }> {
  // Try to find a folder we created with the same name first (drive.file scope
  // hides other folders anyway, so this stays isolated to our app's own files).
  const q = `mimeType='application/vnd.google-apps.folder' and name='${folderName.replace(/'/g, "\\'")}' and trashed=false`;
  const list = await driveJson<{
    files: { id: string; name: string; webViewLink: string }[];
  }>(
    accessToken,
    `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name,webViewLink)&pageSize=1`,
  );
  if (list.files.length > 0) return list.files[0];

  const created = await driveJson<{ id: string; name: string; webViewLink: string }>(
    accessToken,
    `${DRIVE_API}/files?fields=id,name,webViewLink`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: folderName,
        mimeType: "application/vnd.google-apps.folder",
      }),
    },
  );
  return created;
}

export async function uploadFile(
  accessToken: string,
  args: {
    folderId: string;
    name: string;
    mimeType: string;
    bytes: Uint8Array;
  },
): Promise<{ id: string; webViewLink: string; mimeType: string }> {
  const boundary = `----lovable-${crypto.randomUUID()}`;
  const meta = {
    name: args.name,
    mimeType: args.mimeType,
    parents: [args.folderId],
  };
  const enc = new TextEncoder();
  const pre = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
      `--${boundary}\r\nContent-Type: ${args.mimeType}\r\n\r\n`,
  );
  const post = enc.encode(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(pre.length + args.bytes.length + post.length);
  body.set(pre, 0);
  body.set(args.bytes, pre.length);
  body.set(post, pre.length + args.bytes.length);

  const res = await driveFetch(
    accessToken,
    `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,webViewLink,mimeType`,
    {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    },
  );
  if (!res.ok) throw new Error(`Drive upload ${res.status}: ${await res.text()}`);
  return (await res.json()) as { id: string; webViewLink: string; mimeType: string };
}

export async function renameFile(accessToken: string, fileId: string, newName: string) {
  return driveJson<{ id: string; name: string }>(
    accessToken,
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=id,name`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName }),
    },
  );
}

export async function replaceFileContent(
  accessToken: string,
  fileId: string,
  args: { name: string; mimeType: string; bytes: Uint8Array },
) {
  // Metadata patch first (rename), then media update.
  await renameFile(accessToken, fileId, args.name);
  const res = await driveFetch(
    accessToken,
    `${DRIVE_UPLOAD_API}/files/${encodeURIComponent(fileId)}?uploadType=media&fields=id,webViewLink,mimeType`,
    {
      method: "PATCH",
      headers: { "Content-Type": args.mimeType },
      body: args.bytes as unknown as BodyInit,
    },
  );
  if (!res.ok) throw new Error(`Drive replace ${res.status}: ${await res.text()}`);
  return (await res.json()) as { id: string; webViewLink: string; mimeType: string };
}

export async function moveToTrash(accessToken: string, fileId: string) {
  const res = await driveFetch(
    accessToken,
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=id,trashed`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trashed: true }),
    },
  );
  if (!res.ok && res.status !== 404) {
    throw new Error(`Drive trash ${res.status}: ${await res.text()}`);
  }
}

// ============ helper: audit + connection resolution ============

export async function logAudit(entry: {
  contractId?: string | null;
  documentId?: string | null;
  userId?: string | null;
  action: string;
  result: "ok" | "error";
  destination?: string | null;
  error?: string | null;
}) {
  try {
    await supabaseAdmin.from("rental_drive_audit_log").insert({
      contract_id: entry.contractId ?? null,
      document_id: entry.documentId ?? null,
      user_id: entry.userId ?? null,
      action: entry.action,
      result: entry.result,
      destination: entry.destination ?? null,
      error: entry.error ? entry.error.slice(0, 500) : null,
    });
  } catch {
    // audit is best-effort
  }
}

export async function withAccessToken<T>(
  userId: string,
  fn: (token: string, conn: ConnectionRow) => Promise<T>,
): Promise<T> {
  const conn = await getConnectionForUser(userId);
  if (!conn) throw new Error("Conta Google Drive não conectada.");
  try {
    const token = await getValidAccessToken(conn);
    return await fn(token, conn);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await markConnError(userId, msg);
    throw e;
  }
}
