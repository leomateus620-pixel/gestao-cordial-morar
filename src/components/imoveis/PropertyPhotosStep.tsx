import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ImagePlus, Loader2, RefreshCw, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  ACCEPTED_IMAGE_TYPES,
  usePropertyImages,
  usePropertyMedia,
} from "@/hooks/usePropertyMedia";
import { WATERMARK_COMBINED_LABEL } from "@/lib/imoveis/watermark-config";

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

  function move(index: number, delta: number) {
    const next = [...rows];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item!);
    media.reorder.mutate(next.map((image) => image.id));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">Fotos do imóvel</p>
          <p className="text-[11px] text-foreground/55">
            A primeira foto é a capa. Todas recebem a marca {marcaAtual} antes de ir para os sites.
          </p>
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
                    <button
                      type="button"
                      onClick={() => media.retryUpload(item.key)}
                      className="inline-flex items-center gap-1 font-semibold text-rose-600"
                    >
                      <RefreshCw className="size-3" /> Tentar novamente
                    </button>
                  ) : item.status === "duplicada" ? (
                    "Já estava pronta"
                  ) : item.status === "retomada" ? (
                    "Processamento retomado"
                  ) : item.status === "pronta" ? (
                    "Enviada"
                  ) : item.status === "processando" ? (
                    "Aplicando marca"
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

      {!propertyId && (
        <p className="rounded-2xl bg-amber-500/10 p-3 text-[11px] font-medium text-amber-700">
          Salvamos um rascunho automaticamente ao adicionar a primeira foto.
        </p>
      )}

      {rows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-foreground/[0.04] px-3 py-2 text-[11px]">
          <span className="font-medium text-foreground/70">
            {pendentes > 0
              ? `Atualizando marcas nas fotos… ${prontas} de ${rows.length} prontas.`
              : `${prontas} de ${rows.length} fotos prontas com a marca ${marcaAtual}.`}
            {falhas > 0 ? ` ${falhas} precisam de nova tentativa.` : ""}
          </span>
          {(falhas > 0 || pendentes > 0) && (
            <button
              type="button"
              onClick={() => media.retryWatermark.mutate(undefined)}
              disabled={media.retryWatermark.isPending}
              className="inline-flex items-center gap-1 font-semibold text-primary disabled:opacity-50"
            >
              <RefreshCw
                className={`size-3 ${media.retryWatermark.isPending ? "animate-spin" : ""}`}
              />
              Tentar novamente todas
            </button>
          )}
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
          {rows.map((image, index) => (
            <li
              key={image.id}
              className="group relative overflow-hidden rounded-2xl bg-foreground/[0.05]"
            >
              <img
                src={image.url}
                alt={`Foto ${index + 1} do imóvel`}
                loading="lazy"
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
                <button
                  type="button"
                  onClick={() => media.remove.mutate(image.id)}
                  className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-rose-900/60 px-2 text-center text-[10px] font-bold text-white"
                >
                  <Trash2 className="size-3.5" />
                  Marca não aplicada — remover e enviar de novo
                </button>
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
