// SERVER ONLY. Never import from client-reachable modules at top level.
// Google Drive helpers backed by the workspace connector (ricardodrive).
// All operations happen inside a single fixed root folder in Drive:
//   "Gestão Cordial — Aluguéis"
// Root folder id is persisted in public.app_settings.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GATEWAY_BASE = "https://connector-gateway.lovable.dev/google_drive";
const DRIVE_API = `${GATEWAY_BASE}/drive/v3`;
const DRIVE_UPLOAD_API = `${GATEWAY_BASE}/upload/drive/v3`;
const ABOUT_API = `${DRIVE_API}/about?fields=user(emailAddress,displayName),storageQuota(limit,usage)`;

const ROOT_FOLDER_NAME = "Gestão Cordial — Aluguéis";
const APP_SETTINGS_KEY = "google_drive_root_folder_id";

function lovableApiKey() {
  const v = process.env.LOVABLE_API_KEY;
  if (!v) throw new Error("LOVABLE_API_KEY não configurada");
  return v;
}
function connectorKey() {
  const v = process.env.GOOGLE_DRIVE_API_KEY;
  if (!v) throw new Error("GOOGLE_DRIVE_API_KEY não configurada — conecte o Google Drive nos Connectors");
  return v;
}

function driveHeaders(extra?: HeadersInit): Headers {
  const h = new Headers(extra);
  h.set("Authorization", `Bearer ${lovableApiKey()}`);
  h.set("X-Connection-Api-Key", connectorKey());
  return h;
}

async function driveFetch(
  url: string,
  init: RequestInit = {},
  attempt = 0,
): Promise<Response> {
  const headers = driveHeaders(init.headers);
  const res = await fetch(url, { ...init, headers });
  if ((res.status === 429 || res.status >= 500) && attempt < 3) {
    const backoff = 400 * Math.pow(2, attempt);
    await new Promise((r) => setTimeout(r, backoff));
    return driveFetch(url, init, attempt + 1);
  }
  return res;
}

async function driveJson<T = unknown>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await driveFetch(url, init);
  if (!res.ok) {
    throw new Error(`Drive API ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

// ============ Connection ping ============

export async function pingDrive(): Promise<{ email: string; displayName?: string }> {
  const info = await driveJson<{
    user?: { emailAddress?: string; displayName?: string };
  }>(ABOUT_API);
  return {
    email: info.user?.emailAddress ?? "",
    displayName: info.user?.displayName,
  };
}

// ============ Root folder ============

async function readAppSetting(key: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const raw = (data as { value?: unknown } | null)?.value;
  if (!raw) return null;
  if (typeof raw === "string") return raw;
  if (typeof raw === "object" && raw !== null && "id" in raw) {
    const id = (raw as { id?: unknown }).id;
    return typeof id === "string" ? id : null;
  }
  return null;
}

async function writeAppSetting(key: string, value: unknown) {
  const { error } = await supabaseAdmin
    .from("app_settings")
    .upsert({ key, value: value as never, updated_at: new Date().toISOString() } as never, {
      onConflict: "key",
    });
  if (error) throw new Error(error.message);
}

async function driveFolderExists(folderId: string): Promise<boolean> {
  const res = await driveFetch(
    `${DRIVE_API}/files/${encodeURIComponent(folderId)}?fields=id,trashed,mimeType`,
  );
  if (res.status === 404) return false;
  if (!res.ok) return false;
  const body = (await res.json()) as { trashed?: boolean; mimeType?: string };
  return !body.trashed && body.mimeType === "application/vnd.google-apps.folder";
}

export async function getRootFolder(): Promise<{ id: string; url: string; name: string }> {
  const existing = await readAppSetting(APP_SETTINGS_KEY);
  if (existing && (await driveFolderExists(existing))) {
    const meta = await driveJson<{ id: string; name: string; webViewLink: string }>(
      `${DRIVE_API}/files/${encodeURIComponent(existing)}?fields=id,name,webViewLink`,
    );
    return { id: meta.id, url: meta.webViewLink, name: meta.name };
  }

  // Try to find an existing folder with the canonical name at the Drive root
  // (only among files this app can see via drive.file scope).
  const q = `mimeType='application/vnd.google-apps.folder' and name='${ROOT_FOLDER_NAME.replace(
    /'/g,
    "\\'",
  )}' and trashed=false`;
  const list = await driveJson<{ files: { id: string; name: string; webViewLink: string }[] }>(
    `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name,webViewLink)&pageSize=1`,
  );
  if (list.files.length > 0) {
    const f = list.files[0];
    await writeAppSetting(APP_SETTINGS_KEY, { id: f.id, name: f.name });
    return { id: f.id, url: f.webViewLink, name: f.name };
  }

  const created = await driveJson<{ id: string; name: string; webViewLink: string }>(
    `${DRIVE_API}/files?fields=id,name,webViewLink`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: ROOT_FOLDER_NAME,
        mimeType: "application/vnd.google-apps.folder",
      }),
    },
  );
  await writeAppSetting(APP_SETTINGS_KEY, { id: created.id, name: created.name });
  return { id: created.id, url: created.webViewLink, name: created.name };
}

// ============ Guards ============

/**
 * Confirm the given fileId lives somewhere under the rental root folder.
 * Walks the parents chain (Drive files have at most one parent under drive.file).
 */
export async function assertInsideRentalTree(fileId: string): Promise<void> {
  const root = await getRootFolder();
  let current = fileId;
  for (let hop = 0; hop < 6; hop++) {
    if (current === root.id) return;
    const meta = await driveJson<{ parents?: string[] }>(
      `${DRIVE_API}/files/${encodeURIComponent(current)}?fields=parents`,
    );
    const parents = meta.parents ?? [];
    if (parents.length === 0) break;
    if (parents.includes(root.id)) return;
    current = parents[0];
  }
  throw new Error("Operação bloqueada: arquivo fora da pasta de Aluguéis.");
}

// ============ Naming ============

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

// ============ File operations (all scoped under root) ============

export async function ensureContractFolder(
  folderName: string,
): Promise<{ id: string; webViewLink: string; name: string }> {
  const root = await getRootFolder();
  const q =
    `mimeType='application/vnd.google-apps.folder' and name='${folderName.replace(/'/g, "\\'")}' ` +
    `and '${root.id}' in parents and trashed=false`;
  const list = await driveJson<{
    files: { id: string; name: string; webViewLink: string }[];
  }>(
    `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name,webViewLink)&pageSize=1`,
  );
  if (list.files.length > 0) return list.files[0];
  const created = await driveJson<{ id: string; name: string; webViewLink: string }>(
    `${DRIVE_API}/files?fields=id,name,webViewLink`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: folderName,
        mimeType: "application/vnd.google-apps.folder",
        parents: [root.id],
      }),
    },
  );
  return created;
}

export async function uploadFileToFolder(args: {
  folderId: string;
  name: string;
  mimeType: string;
  bytes: Uint8Array;
}): Promise<{ id: string; webViewLink: string; mimeType: string }> {
  // Verify target folder is inside our tree before uploading.
  await assertInsideRentalTree(args.folderId);

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
    `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,webViewLink,mimeType`,
    {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body: body as unknown as BodyInit,
    },
  );
  if (!res.ok) throw new Error(`Drive upload ${res.status}: ${await res.text()}`);
  return (await res.json()) as { id: string; webViewLink: string; mimeType: string };
}

export async function moveToTrash(fileId: string) {
  await assertInsideRentalTree(fileId);
  const res = await driveFetch(
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

// ============ Audit log ============

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
    // best effort
  }
}
