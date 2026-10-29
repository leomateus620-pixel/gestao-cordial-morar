import type { SupabaseClient } from "@supabase/supabase-js";
import process from "node:process";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { AdProviderError, type AdPlatform } from "./types";
import { normalizeAccountId } from "./meta.graph.server";

export type AdConnection = {
  id: string;
  user_id: string;
  platform: AdPlatform;
  imobiliaria: string | null;
  credential_mode: "oauth" | "system_user" | "legacy";
  credential_ref: string | null;
  app_secret_ref?: string | null;
  page_credential_ref?: string | null;
  encrypted_access_token?: string | null;
  encrypted_refresh_token?: string | null;
  access_token?: string | null;
  refresh_token?: string | null;
  expires_at: string | null;
  external_account_id: string | null;
  app_id: string | null;
  page_id: string | null;
  capabilities?: { token_valid?: boolean | null };
};
export function credentialReference(ref: string): string {
  if (!/^META_(?:[A-Z0-9]+_)*ACCESS_TOKEN$/.test(ref))
    throw new AdProviderError("not_configured", "Referência de credencial inválida.");
  return ref;
}
function encryptionKey(): Buffer {
  const raw = process.env.ADS_CREDENTIAL_ENCRYPTION_KEY;
  const key = Buffer.from(raw ?? "", "base64");
  if (key.length !== 32)
    throw new AdProviderError(
      "not_configured",
      "Configure a chave de criptografia pelo formulário seguro de secrets.",
    );
  return key;
}
export function encryptCredential(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    encrypted.toString("base64"),
  ].join(".");
}
export function decryptCredential(value: string): string {
  try {
    const [version, iv, tag, encrypted] = value.split(".");
    if (version !== "v1" || !iv || !tag || !encrypted) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(encrypted, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new AdProviderError(
      "not_configured",
      "Credencial protegida indisponível. Revise a configuração segura.",
    );
  }
}
export async function resolveConnectionCredential(
  connectionId: string,
  expected: {
    platform?: AdPlatform;
    imobiliaria?: string;
    accountId?: string;
    allowExpired?: boolean;
  } = {},
  refreshRetries = 0,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as SupabaseClient;
  const { data: connection, error } = (await db
    .from("ad_platform_connections")
    .select("*")
    .eq("id", connectionId)
    .maybeSingle()) as { data: AdConnection | null; error: unknown };
  if (error || !connection) throw new AdProviderError("not_connected", "Conexão não encontrada.");
  assertConnectionContext(connection, expected);
  let token =
    connection.credential_mode === "system_user"
      ? process.env[credentialReference(connection.credential_ref ?? "")]
      : connection.encrypted_access_token
        ? decryptCredential(connection.encrypted_access_token)
        : connection.access_token;
  if (!token) throw new AdProviderError("not_configured", "Credencial pendente no backend.");
  if (!expected.allowExpired && connection.capabilities?.token_valid === false)
    throw new AdProviderError(
      "token_expired",
      "Conexão comprovadamente inválida. Execute novo diagnóstico após corrigir a credencial.",
    );
  const expired =
    !expected.allowExpired &&
    connection.expires_at &&
    Date.parse(connection.expires_at) < Date.now() + 60_000;
  // System-user tokens never enter a personal OAuth exchange/refresh flow.
  if (expired && connection.credential_mode !== "system_user" && connection.platform === "google") {
    const refresh = connection.encrypted_refresh_token
      ? decryptCredential(connection.encrypted_refresh_token)
      : connection.refresh_token;
    if (refresh) {
      const { refreshGoogle } = await import("./oauth.server");
      const fresh = await refreshGoogle(refresh);
      const encrypted = encryptCredential(fresh.accessToken);
      const encryptedRefresh = encryptCredential(fresh.refreshToken ?? refresh);
      let update = db
        .from("ad_platform_connections")
        .update({
          encrypted_access_token: encrypted,
          encrypted_refresh_token: encryptedRefresh,
          credential_mode: "oauth",
          access_token: null,
          refresh_token: null,
          expires_at: fresh.expiresAt,
        })
        .eq("id", connectionId);
      update = connection.encrypted_access_token
        ? update.eq("encrypted_access_token", connection.encrypted_access_token)
        : update.is("encrypted_access_token", null);
      update = connection.access_token
        ? update.eq("access_token", connection.access_token)
        : update.is("access_token", null);
      update = connection.encrypted_refresh_token
        ? update.eq("encrypted_refresh_token", connection.encrypted_refresh_token)
        : update.is("encrypted_refresh_token", null);
      update = connection.refresh_token
        ? update.eq("refresh_token", connection.refresh_token)
        : update.is("refresh_token", null);
      const { data: updated, error: saveError } = await update.select("id").maybeSingle();
      if (saveError)
        throw new AdProviderError(
          "provider_error",
          "Não foi possível preservar a renovação da conexão.",
        );
      if (!updated) {
        // Another request renewed or replaced this connection. Never use the
        // stale result; re-resolve its current authorized credential.
        if (refreshRetries >= 2)
          throw new AdProviderError(
            "provider_error",
            "Conexão alterada durante a renovação. Tente novamente.",
          );
        return resolveConnectionCredential(connectionId, expected, refreshRetries + 1);
      }
      connection.encrypted_access_token = encrypted;
      connection.encrypted_refresh_token = encryptedRefresh;
      connection.access_token = null;
      connection.refresh_token = null;
      token = fresh.accessToken;
    } else throw new AdProviderError("token_expired", "Conexão expirada.");
  } else if (expired) throw new AdProviderError("token_expired", "Conexão expirada.");
  return { token, connection };
}
export function assertConnectionContext(
  connection: Pick<AdConnection, "platform" | "imobiliaria" | "external_account_id">,
  expected: { platform?: AdPlatform; imobiliaria?: string; accountId?: string },
) {
  if (
    (expected.platform && connection.platform !== expected.platform) ||
    (expected.imobiliaria && connection.imobiliaria !== expected.imobiliaria) ||
    (expected.accountId && !connection.external_account_id) ||
    (expected.accountId &&
      connection.external_account_id &&
      (connection.platform === "google"
        ? expected.accountId.replace(/-/g, "") !== connection.external_account_id.replace(/-/g, "")
        : normalizeAccountId(expected.accountId) !==
          normalizeAccountId(connection.external_account_id)))
  )
    throw new AdProviderError("no_permission", "Conexão não pertence ao contexto selecionado.");
}
export async function resolvePageCredential(connectionId: string, allowExpired = false) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as SupabaseClient;
  const { data, error } = await db
    .from("ad_platform_connections")
    .select("*")
    .eq("id", connectionId)
    .maybeSingle();
  if (error || !data) throw new AdProviderError("not_connected", "Conexão não encontrada.");
  const connection = data as AdConnection;
  assertConnectionContext(connection, { platform: "meta" });
  if (connection.page_credential_ref) {
    const token = process.env[credentialReference(connection.page_credential_ref)];
    if (!token) throw new AdProviderError("not_configured", "Token de Página pendente no backend.");
    return { connection, token };
  }
  // The endpoint itself must prove this token type is accepted; no exchange is assumed.
  return resolveConnectionCredential(connectionId, { platform: "meta", allowExpired });
}
