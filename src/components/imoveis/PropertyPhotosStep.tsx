import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ImagePlus, Loader2, RefreshCw, Replace, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  ACCEPTED_IMAGE_TYPES,
  usePropertyImages,
  usePropertyMedia,
} from "@/hooks/usePropertyMedia";
import { WATERMARK_COMBINED_LABEL } from "@/lib/imoveis/watermark-config";
import { usePhotoSorting } from "@/components/imoveis/PhotoSortableGrid";
import { usePropertySyncStatus } from "@/hooks/usePropertySync";
import type { PublicationStatusView } from "@/lib/imoveis/publish.functions";

const SITE_LABELS: Record<string, string> = { cordial: "Cordial", morar: "Morar" };

function galleryStatusText(row: PublicationStatusView) {
  const expected = row.media.expectedCount ?? 0;
  const synced = row.media.syncedCount ?? 0;
  if (row.rateLimitedUntil && new Date(row.rateLimitedUntil).getTime() > Date.now()) {
    return `Aguardando limite do site até ${new Date(row.rateLimitedUntil).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  }
  if (row.media.status === "delivery_unknown") return "Conferindo envio sem repetir a foto";
  if (row.media.status === "synced" && expected === synced && row.media.orderGuarantee === "ordem_confirmada_por_leitura") {
    return `Galeria confirmada · ${synced} de ${expected}`;
  }
  if (row.activeJob?.status === "processing") return `Enviando ${synced} de ${expected}`;
  if (expected > synced) return `Aguardando envio · ${synced} de ${expected} confirmadas`;
  return "Aguardando envio";
}

/**
 * Etapa 6 — fotos. O upload só existe com imóvel salvo, porque cada arquivo
 * precisa de uma pasta própria no Storage e de um registro correspondente.
 * Toda foto recebe a marca da imobiliária no backend antes de ir para os sites.
 */
export function PropertyPhotosStep({
  propertyId,
  destinos = [],
  onRequestSave,
}: {
  propertyId?: string | null;
  destinos?: string[];
  onRequestSave?: () => Promise<string | null>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preparing, setPreparing] = useState(false);
  const images = usePropertyImages(propertyId ?? undefined);
  const media = usePropertyMedia(propertyId ?? undefined);
  const gallerySync = usePropertySyncStatus(propertyId ?? undefined);
  const rows = images.data ?? [];
  const marcaAtual = WATERMARK_COMBINED_LABEL;
  const pendentes = rows.filter(
    (image) => image.processingStatus === "pending" || image.processingStatus === "processing",
  ).length;
  const falhas = rows.filter((image) => image.processingStatus.startsWith("failed")).length;
  const prontas = rows.length - pendentes - falhas;
  const enviando = media.progress.filter(
    (item) =>
      item.status === "preparando" || item.status === "enviando" || item.status === "processando",
  ).length;
  const totalLote = media.progress.length;

  // Trocar o destino regenera as marcas a partir do original.
  const targetsKey = [...destinos].sort().join(",");
  const lastTargets = useRef<string | null>(null);
  useEffect(() => {
    if (!propertyId) return;
    if (lastTargets.current === targetsKey) return;
    lastTargets.current = targetsKey;
    media.updateTargets.mutate(targetsKey ? targetsKey.split(",") : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, targetsKey]);

  async function pickFiles() {
    if (!propertyId && onRequestSave) {
      setPreparing(true);
      try {
        const created = await onRequestSave();
        if (!created) return;
      } catch (err) {
        toast.error((err as Error)?.message ?? "Salve o imóvel antes de enviar fotos.");
        return;
      } finally {
        setPreparing(false);
      }
    }
    inputRef.current?.click();
  }

  const sorting = usePhotoSorting({
    items: rows,
    onReorder: (orderedIds, movedId) => media.reorderPhotos(orderedIds, movedId),
  });
  const sortedRows = sorting.ordered;

  // Ao sair da etapa, grava na hora qualquer ordem que ainda estava em espera.
  const flushRef = useRef(media.flushReorder);
  flushRef.current = media.flushReorder;
  useEffect(() => {
    return () => {
      void flushRef.current().catch(() => undefined);
    };
  }, []);

  function move(index: number, delta: number) {
    const movedId = sortedRows[index]?.id ?? null;
    sorting.moveTo(index, index + delta);
    setTimeout(() => sorting.commit(movedId), 0);
  }


  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">Fotos do imóvel</p>
          <p className="text-[11px] text-foreground/55">
            Arraste para reordenar — a primeira foto é a capa e a ordem salva sozinha. Todas
            recebem a marca {marcaAtual} antes de ir para os sites.
          </p>
          {media.orderState !== "idle" && (
            <p className="text-[11px] font-semibold text-foreground/60">
              {media.orderState === "saving"
                ? "Salvando ordem…"
                : media.orderState === "syncing"
                  ? "Ordem salva · enviando para os sites"
                  : "Ordem salva"}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={pickFiles}
          disabled={preparing || media.upload.isPending}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50"
        >
          {preparing || media.upload.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <ImagePlus className="size-3.5" />
          )}
          Adicionar fotos
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_IMAGE_TYPES.join(",")}
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length) media.upload.mutate(files);
          }}
        />
      </div>

      {totalLote > 0 && (
        <div className="space-y-2 rounded-2xl bg-foreground/[0.04] p-3 text-[11px]">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-foreground/70">
              {enviando > 0
                ? `Enviando ${totalLote - enviando + 1} de ${totalLote}…`
                : `${totalLote} ${totalLote === 1 ? "foto enviada" : "fotos enviadas"} neste lote`}
            </span>
            <button
              type="button"
              onClick={media.clearProgress}
              className="font-semibold text-primary"
            >
              Limpar
            </button>
          </div>
          <ul className="space-y-1.5">
            {media.progress.map((item) => (
              <li key={item.key} className="flex items-center gap-2">
                <img
                  src={item.previewUrl}
                  alt=""
                  className="size-8 shrink-0 rounded-lg object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-foreground/70">{item.name}</p>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-foreground/10">
                    <div
                      className={`h-full rounded-full transition-all ${
                        item.status === "erro" ? "bg-rose-500" : "bg-primary"
                      }`}
                      style={{
                        width:
                          item.status === "pronta" ||
                          item.status === "duplicada" ||
                          item.status === "retomada"
                            ? "100%"
                            : `${Math.max(6, item.progress)}%`,
                      }}
                    />
                  </div>
                </div>
                <span
                  className={`shrink-0 ${
                    item.status === "erro"
                      ? "text-rose-600"
                      : item.status === "duplicada" || item.status === "retomada"
                        ? "text-amber-600"
                        : "text-foreground/55"
                  }`}
                >
                  {item.status === "erro" ? (
                    "Arquivo não confirmado. Se não aparecer na galeria, selecione-o novamente."
                  ) : item.status === "duplicada" ? (
                    "Já estava pronta"
                  ) : item.status === "retomada" ? (
                    "Processamento retomado"
                  ) : item.status === "pronta" ? (
                    "Enviada"
                  ) : item.status === "processando" ? (
                    item.error ?? "Aplicando marca"
                  ) : item.status === "enviando" ? (
                    `${item.progress}%`
                  ) : (
                    "Preparando"
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {media.uploadIssues.length > 0 && (
        <div className="rounded-2xl bg-amber-500/10 p-3 text-[11px] text-amber-800">
          <p className="font-semibold">Arquivos que precisam de atenção</p>
          <ul className="mt-1 space-y-1">
            {media.uploadIssues.map((issue, index) => (
              <li key={`${issue.createdAt}-${index}`}>
                <strong>{issue.fileName}</strong>: {issue.reason === "original_nao_chegou"
                  ? "o original não chegou ao servidor. Selecione somente este arquivo novamente."
                  : issue.reason === "foto_substituida_foi_removida"
                    ? "a foto que seria substituída foi removida durante o envio. O original foi preservado."
                    : "o imóvel deixou de aceitar esta foto durante o envio."}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!propertyId && (
        <p className="rounded-2xl bg-amber-500/10 p-3 text-[11px] font-medium text-amber-700">
          Salvamos um rascunho automaticamente ao adicionar a primeira foto.
        </p>
      )}

      {rows.length > 0 && (
        <div className="space-y-2 rounded-2xl bg-foreground/[0.04] px-3 py-2 text-[11px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium text-foreground/70">
            {pendentes > 0
              ? `Processando ${prontas} de ${rows.length} fotos no Gestão.`
              : `${prontas} de ${rows.length} fotos prontas com a marca ${marcaAtual}.`}
            {falhas > 0 ? ` ${falhas} sendo ajustadas automaticamente.` : ""}
            </span>
            {(falhas > 0 || pendentes > 0) && (
              <span className="inline-flex items-center gap-1 font-semibold text-primary">
                <RefreshCw className="size-3 animate-spin" /> Ajuste automático em andamento
              </span>
            )}
          </div>
          {(gallerySync.data ?? [])
            .filter((row) => destinos.includes(row.provider) && row.enabled)
            .map((row) => (
              <div key={row.provider} className="flex items-center justify-between gap-3 border-t border-foreground/10 pt-2">
                <span className="font-semibold">{SITE_LABELS[row.provider] ?? row.provider}</span>
                <span className="text-right text-foreground/65">{galleryStatusText(row)}</span>
              </div>
            ))}
        </div>
      )}

      {images.isPending && propertyId && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="aspect-square animate-pulse rounded-2xl bg-white/50" />
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {sortedRows.map((image, index) => (
            <li
              key={image.id}
              {...sorting.getItemProps(index)}
              className={
                "group relative cursor-grab overflow-hidden rounded-2xl bg-foreground/[0.05] active:cursor-grabbing " +
                (sorting.draggingId === image.id
                  ? "z-30 opacity-90 shadow-2xl ring-2 ring-primary"
                  : sorting.draggingId
                    ? "opacity-80"
                    : "")
              }
            >
              <img
                src={image.thumbUrl || image.url}
                alt={`Foto ${index + 1} do imóvel`}
                loading="lazy"
                decoding="async"
                draggable={false}
                className="aspect-square w-full object-cover"
              />
              {image.isCover && (
                <span className="absolute left-1.5 top-1.5 rounded-full bg-primary px-2 py-0.5 text-[9px] font-bold text-primary-foreground">
                  Capa
                </span>
              )}
              {(image.processingStatus === "pending" ||
                image.processingStatus === "processing") && (
                <span className="absolute inset-0 flex items-center justify-center gap-1 bg-foreground/45 text-[10px] font-bold text-white">
                  <Loader2 className="size-3 animate-spin" />
                  {image.processingStatus === "processing" ? "Aplicando marca" : "Na fila"}
                </span>
              )}
              {image.processingStatus.startsWith("failed") && (
                <span className="absolute inset-0 flex items-center justify-center bg-foreground/55 px-2 text-center text-[10px] font-bold text-white">
                  {image.processingStatus === "failed_permanent"
                    ? "Arquivo indisponível para processamento; substitua esta foto."
                    : "Foto salva; processamento será retomado automaticamente."}
                </span>
              )}

              {image.processingStatus === "ready" && image.watermarkLabel && (
                <span className="absolute right-1.5 top-1.5 rounded-full bg-white/85 px-2 py-0.5 text-[9px] font-semibold text-foreground/70">
                  {image.watermarkLabel}
                </span>
              )}
              <div className="absolute inset-x-1 bottom-1 flex items-center justify-between gap-1 rounded-full bg-white/85 px-1.5 py-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                <button type="button" onClick={() => move(index, -1)} aria-label="Mover para trás">
                  <ArrowLeft className="size-3.5 text-foreground/60" />
                </button>
                <button
                  type="button"
                  onClick={() => media.setCover.mutate(image.id)}
                  aria-label="Definir como capa"
                >
                  <Star
                    className={`size-3.5 ${image.isCover ? "text-primary" : "text-foreground/60"}`}
                  />
                </button>
                <label className="cursor-pointer" aria-label="Substituir foto" title="Substituir foto">
                  <Replace className="size-3.5 text-foreground/60" />
                  <input
                    type="file"
                    accept={ACCEPTED_IMAGE_TYPES.join(",")}
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) media.replace.mutate({ imageId: image.id, file });
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => media.remove.mutate(image.id)}
                  aria-label="Remover foto"
                >
                  <Trash2 className="size-3.5 text-rose-600" />
                </button>
                <button type="button" onClick={() => move(index, 1)} aria-label="Mover para frente">
                  <ArrowRight className="size-3.5 text-foreground/60" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {propertyId && !images.isPending && rows.length === 0 && (
        <p className="rounded-2xl bg-foreground/[0.04] p-4 text-center text-[11px] text-foreground/55">
          Nenhuma foto anexada ainda.
        </p>
      )}
    </div>
  );
}
