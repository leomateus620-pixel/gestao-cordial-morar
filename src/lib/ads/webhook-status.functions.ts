import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";

export const META_LEADGEN_CALLBACK = "https://cordialgestao.com/api/public/meta/leadgen";

export type MetaWebhookStatus = {
  callbackUrl: string;
  backend: { ready: boolean; missing: string[] };
  verification: boolean | null;
  appSubscribed: boolean | null;
  pageSubscribed: boolean | null;
  workerActive: boolean | null;
  lastProcessedAt: string | null;
  recoverableFailures: number;
  queued: number;
  checkedAt: string;
};

const REQUIRED = [
  "META_APP_ID",
  "META_APP_SECRET",
  "META_ACCESS_TOKEN",
  "META_PAGE_ID",
  "META_AD_ACCOUNT_ID",
  "META_WEBHOOK_VERIFY_TOKEN",
  "META_GRAPH_API_VERSION",
] as const;

// Short runtime cache prevents diagnostics from becoming a request-per-render probe.
let cachedStatus: MetaWebhookStatus | undefined;
let statusPromise: Promise<MetaWebhookStatus> | undefined;

/** Read-only status for the admin panel. Never returns token values. */
export const getMetaWebhookStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MetaWebhookStatus> => {
    const { marketingAccess } = await import("./authorization.server");
    const access = await marketingAccess(context);
    // Reviewers see a sanitized snapshot; a read never grants live diagnostic commands.
    if (access.isReviewer)
      return cachedStatus
        ? { ...cachedStatus, backend: { ready: cachedStatus.backend.ready, missing: [] } }
        : {
            callbackUrl: META_LEADGEN_CALLBACK,
            backend: { ready: false, missing: [] },
            verification: null,
            appSubscribed: null,
            pageSubscribed: null,
            workerActive: null,
            lastProcessedAt: null,
            recoverableFailures: 0,
            queued: 0,
            checkedAt: new Date().toISOString(),
          };
    if (!access.isAdmin) throw new Error("Somente o administrador pode ver esta integração.");
    if (cachedStatus && Date.now() - Date.parse(cachedStatus.checkedAt) < 60_000)
      return cachedStatus;
    if (statusPromise) return statusPromise;
    statusPromise = readWebhookStatus();
    try {
      cachedStatus = await statusPromise;
      return cachedStatus;
    } finally {
      statusPromise = undefined;
    }
  });
async function readWebhookStatus(): Promise<MetaWebhookStatus> {
  const { metaGraph, externalId } = await import("./meta.graph.server");
  const env = process.env;
  const missing = REQUIRED.filter((k) => !env[k]);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as SupabaseClient;

  const [last, failures, queued, worker] = await Promise.all([
    db
      .from("meta_lead_submissions")
      .select("completed_at")
      .not("completed_at", "is", null)
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("meta_lead_submissions")
      .select("id", { count: "exact", head: true })
      .in("status", ["failed", "review", "quarantined"]),
    db
      .from("meta_lead_submissions")
      .select("id", { count: "exact", head: true })
      .in("status", ["queued", "processing"]),
    db.rpc("meta_ads_worker_active" as never),
  ]);
  const backendReady = !missing.length && !last.error;

  let verification: boolean | null = null;
  let appSubscribed: boolean | null = null;
  let pageSubscribed: boolean | null = null;
  if (!missing.length) {
    const challenge = String(Math.floor(Math.random() * 1e9));
    try {
      const u = new URL(META_LEADGEN_CALLBACK);
      u.searchParams.set("hub.mode", "subscribe");
      u.searchParams.set("hub.verify_token", env.META_WEBHOOK_VERIFY_TOKEN!);
      u.searchParams.set("hub.challenge", challenge);
      const r = await fetch(u, {
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
      });
      verification = r.status === 200 && (await r.text()) === challenge;
    } catch {
      verification = false;
    }
    const appToken = `${env.META_APP_ID}|${env.META_APP_SECRET}`;
    const subs = await metaGraph<Record<string, unknown>>(
      `/${externalId(env.META_APP_ID!)}/subscriptions`,
      appToken,
    ).catch(() => null);
    if (subs) {
      const list =
        (subs.data as Array<{
          object: string;
          callback_url: string;
          active: boolean;
          fields: Array<{ name: string }>;
        }>) ?? [];
      appSubscribed = list.some(
        (s) =>
          s.object === "page" &&
          s.active &&
          s.callback_url === META_LEADGEN_CALLBACK &&
          s.fields?.some((f) => f.name === "leadgen"),
      );
    }
    const page = await metaGraph<Record<string, unknown>>(
      `/${externalId(env.META_PAGE_ID!)}`,
      env.META_ACCESS_TOKEN!,
      { fields: "access_token" },
    ).catch(() => null);
    const pageToken = typeof page?.access_token === "string" ? page.access_token : null;
    if (pageToken) {
      const apps = await metaGraph<Record<string, unknown>>(
        `/${externalId(env.META_PAGE_ID!)}/subscribed_apps`,
        pageToken,
        { fields: "id,subscribed_fields" },
      ).catch(() => null);
      if (apps) {
        const list = (apps.data as Array<{ id: string; subscribed_fields?: string[] }>) ?? [];
        pageSubscribed = list.some(
          (a) => a.id === env.META_APP_ID && a.subscribed_fields?.includes("leadgen"),
        );
      }
    }
  }
  return {
    callbackUrl: META_LEADGEN_CALLBACK,
    backend: { ready: backendReady, missing: [...missing] },
    verification,
    appSubscribed,
    pageSubscribed,
    workerActive: worker.error ? null : Boolean(worker.data),
    lastProcessedAt: (last.data?.completed_at as string | undefined) ?? null,
    recoverableFailures: failures.count ?? 0,
    queued: queued.count ?? 0,
    checkedAt: new Date().toISOString(),
  };
}
