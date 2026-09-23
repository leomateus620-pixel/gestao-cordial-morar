/**
 * Alinhamento pontual da galeria de UM anúncio em UM site (23/09/2026).
 *
 * Uso restrito a imóveis aprovados pelo usuário. Lê uma vez as fotos do
 * anúncio (somente GET), mantém apenas o começo da galeria remota que já está
 * idêntico ao Gestão (mesmas fotos, com código, na mesma ordem, capa na
 * primeira), retira do site o restante e devolve as demais fotos do Gestão para
 * a fila, que as envia na ordem certa. Nunca apaga anúncio nem cadastro.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ImobiProvider } from "./config";
import { fetchRemoteGallery, deleteRemoteImage } from "./image-ops.server";
import { queueMediaSync } from "./media-sync.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>;

export type AlignReport = {
  propertyId: string;
  provider: ImobiProvider;
  externalId: string | null;
  gestaoCount: number;
  remoteCount: number | null;
  remoteReliable: boolean;
  keep: string[];
  remove: string[];
  resend: Array<{ imageId: string; position: number }>;
  applied: boolean;
  deleted: string[];
  deleteFailed: string[];
  blocked?: string;
};

export async function alignGallery(
  admin: Admin,
  propertyId: string,
  provider: ImobiProvider,
  options: { apply: boolean },
): Promise<AlignReport> {
  const { data: publication, error: pubError } = await admin
    .from("property_provider_publications")
    .select("id, external_property_id, enabled")
    .eq("property_id", propertyId)
    .eq("provider", provider)
    .maybeSingle();
  if (pubError) throw new Error(pubError.message);
  const externalId = (publication?.external_property_id as string | null) ?? null;
  const base: AlignReport = {
    propertyId, provider, externalId, gestaoCount: 0, remoteCount: null, remoteReliable: false,
    keep: [], remove: [], resend: [], applied: false, deleted: [], deleteFailed: [],
  };
  if (!publication || !externalId || publication.enabled === false) {
    return { ...base, blocked: "anuncio_nao_publicado" };
  }

  const { data: images, error: imgError } = await admin
    .from("property_images")
    .select("id, position, pending_remote_delete")
    .eq("property_id", propertyId)
    .order("position", { ascending: true });
  if (imgError) throw new Error(imgError.message);
  const desired = (images ?? []).filter((row) => !row.pending_remote_delete) as Array<{ id: string; position: number }>;
  base.gestaoCount = desired.length;

  const { data: links, error: linkError } = await admin
    .from("property_image_provider_publications")
    .select("image_id, external_image_id, desired_state")
    .eq("publication_id", publication.id);
  if (linkError) throw new Error(linkError.message);
  const codeToImage = new Map<string, string>();
  for (const link of links ?? []) {
    if (link.external_image_id && link.desired_state !== "absent") {
      codeToImage.set(String(link.external_image_id), String(link.image_id));
    }
  }

  const gallery = await fetchRemoteGallery(provider, externalId);
  base.remoteReliable = gallery.reliable;
  base.remoteCount = gallery.items.length;
  if (!gallery.reliable) return { ...base, blocked: gallery.reason ?? "leitura_inconclusiva" };

  // Maior começo idêntico: foto i do site = foto i do Gestão; só a 1ª é capa.
  let k = 0;
  while (k < gallery.items.length && k < desired.length) {
    const item = gallery.items[k]!;
    const imageId = item.codigoImagem ? codeToImage.get(item.codigoImagem) : undefined;
    const coverOk = k === 0 ? Boolean(item.destaque) : !item.destaque;
    if (imageId !== desired[k]!.id || !coverOk) break;
    k += 1;
  }
  base.keep = gallery.items.slice(0, k).map((item) => String(item.codigoImagem));
  base.remove = gallery.items.slice(k).map((item) => String(item.codigoImagem)).filter(Boolean);
  base.resend = desired.slice(k).map((image) => ({ imageId: image.id, position: image.position }));
  if (!options.apply) return base;

  const { data: running } = await admin
    .from("property_sync_jobs")
    .select("id")
    .eq("property_id", propertyId)
    .eq("provider", provider)
    .eq("action", "media_sync")
    .eq("status", "processing");
  if ((running ?? []).length) return { ...base, blocked: "envio_em_andamento" };

  for (const code of base.remove) {
    const result = await deleteRemoteImage(provider, externalId, code);
    if (result.confirmed || result.alreadyAbsent) base.deleted.push(code);
    else base.deleteFailed.push(code);
  }
  if (base.deleteFailed.length) return { ...base, applied: false, blocked: "exclusao_nao_confirmada" };

  const now = new Date().toISOString();
  for (const code of base.remove) {
    const imageId = codeToImage.get(code);
    if (!imageId) continue;
    await admin.from("property_image_provider_publications")
      .update({ status: "deleted", deleted_at: now, last_op: "align_delete", last_op_state: "confirmed" })
      .eq("publication_id", publication.id).eq("image_id", imageId).eq("desired_state", "absent");
  }
  const resendIds = base.resend.map((row) => row.imageId);
  if (resendIds.length) {
    const { error } = await admin.from("property_image_provider_publications")
      .update({
        status: "pending", external_image_id: null, remote_url: null, is_cover: false,
        synced_position: null, last_op: "align_reset", last_op_state: null,
        attempts: 0, next_retry_at: null, error_class: null, last_error_message: null,
      })
      .eq("publication_id", publication.id)
      .in("image_id", resendIds);
    if (error) throw new Error(error.message);
  }
  await admin.from("property_provider_publications")
    .update({ media_rebuild_state: null, media_status: "pending", media_order_guarantee: "alinhamento_manual" })
    .eq("id", publication.id);
  await queueMediaSync(admin, propertyId, { providers: [provider] });
  return { ...base, applied: true };
}
