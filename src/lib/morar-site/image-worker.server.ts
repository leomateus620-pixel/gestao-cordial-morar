type ImageWorkerDispatcher = {
  rpc(
    name: "property_worker_dispatch",
    args: { _hook: "property-image-worker"; _body: { limit: 2 } },
  ): PromiseLike<{ data: unknown; error: unknown }>;
};

/**
 * Uses the established vault-configured dispatcher, never a request-derived URL.
 * The persisted image intent and cron remain the guarantee if dispatch fails.
 */
export async function kickOwnedMorarImageWorker(dispatcher?: ImageWorkerDispatcher): Promise<void> {
  try {
    if (!dispatcher) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      // This existing service-only RPC is absent from the generated schema types.
      dispatcher = supabaseAdmin as unknown as ImageWorkerDispatcher;
    }
    await dispatcher.rpc("property_worker_dispatch", {
      _hook: "property-image-worker",
      _body: { limit: 2 },
    });
  } catch {
    // No fallback using Host, forwarded headers or the public site origin.
    // The existing cron retries through the same private vault dispatcher.
  }
}
