import type { ImobiProvider } from "@/lib/imobibrasil/providers";

export type OwnedBrandResult = {
  brand: ImobiProvider;
  ok: boolean;
  state?: string;
  active?: boolean;
  pendingReview?: boolean;
  conflict?: boolean;
  unchanged?: boolean;
  decision?: "publish" | "withdraw" | null;
  revision?: number | null;
  blockReason?: string | null;
  publicId?: string | null;
  error?: string;
};

type Rpc = { rpc: (fn: never, args: never) => PromiseLike<{ data: unknown; error: { message: string } | null }> };

/**
 * Decisão de publicar/retirar nos sites próprios (Cordial e Morar), uma marca
 * de cada vez. Cada RPC confere a permissão do usuário para a marca, a revisão
 * do imóvel e é idempotente. Nunca toca a ImobiBrasil.
 */
export async function requestOwnedPublication(
  admin: Rpc,
  input: { propertyId: string; userId: string; brands: ImobiProvider[]; publish: boolean; expectedRevision?: number | null },
): Promise<OwnedBrandResult[]> {
  const results: OwnedBrandResult[] = [];
  for (const brand of Array.from(new Set(input.brands))) {
    const fn = brand === "cordial" ? "cordial_site_request_publication" : "morar_site_request_publication";
    const args: Record<string, unknown> = {
      _property_id: input.propertyId,
      _requested_by: input.userId,
      _publish: input.publish,
      _expected_revision: input.expectedRevision ?? null,
    };
    if (brand === "morar") Object.assign(args, { _review_media: true, _areas_m2: false });
    try {
      const { data, error } = await admin.rpc(fn as never, args as never);
      if (error) throw new Error(error.message);
      const d = (data ?? {}) as Omit<OwnedBrandResult, "brand">;
      results.push({ brand, ...d, ok: d.ok === true });
    } catch (err) {
      results.push({ brand, ok: false, error: (err as Error)?.message ?? "erro" });
    }
  }
  return results;
}
