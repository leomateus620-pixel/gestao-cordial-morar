import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ImagePlus, Loader2, RefreshCw, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ACCEPTED_IMAGE_TYPES, usePropertyImages, usePropertyMedia } from "@/hooks/usePropertyMedia";
import { variantForTargets, watermarkLabel } from "@/lib/imoveis/watermark-config";

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
  const marcaAtual = watermarkLabel(variantForTargets(destinos));
  const pendentes = rows.filter((image) => image.processingStatus === "pending").length;
  const falhas = rows.filter((image) => image.processingStatus === "failed").length;
  const prontas = rows.length - pendentes - falhas;

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
            A primeira foto é a capa. A ordem definida aqui é a ordem enviada aos sites.
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

      {media.progress.length > 0 && (
        <ul className="space-y-1 rounded-2xl bg-foreground/[0.04] p-3 text-[11px]">
          {media.progress.map((item, i) => (
            <li key={`${item.name}-${i}`} className="flex items-center justify-between gap-2">
              <span className="truncate text-foreground/70">{item.name}</span>
              <span
                className={
                  item.status === "erro"
                    ? "text-rose-600"
                    : item.status === "duplicada"
                      ? "text-amber-600"
                      : "text-foreground/55"
                }
              >
                {item.status === "erro" ? item.error ?? "Falhou" : item.status}
              </span>
            </li>
          ))}
          <li className="pt-1 text-right">
            <button type="button" onClick={media.clearProgress} className="font-semibold text-primary">
              Limpar
            </button>
          </li>
        </ul>
      )}

      {!propertyId && (
        <p className="rounded-2xl bg-amber-500/10 p-3 text-[11px] font-medium text-amber-700">
          Salvamos um rascunho automaticamente ao adicionar a primeira foto.
        </p>
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
            <li key={image.id} className="group relative overflow-hidden rounded-2xl bg-foreground/[0.05]">
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
              <div className="absolute inset-x-1 bottom-1 flex items-center justify-between gap-1 rounded-full bg-white/85 px-1.5 py-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                <button type="button" onClick={() => move(index, -1)} aria-label="Mover para trás">
                  <ArrowLeft className="size-3.5 text-foreground/60" />
                </button>
                <button
                  type="button"
                  onClick={() => media.setCover.mutate(image.id)}
                  aria-label="Definir como capa"
                >
                  <Star className={`size-3.5 ${image.isCover ? "text-primary" : "text-foreground/60"}`} />
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
