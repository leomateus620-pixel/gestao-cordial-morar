import { useEffect, useRef, useState, type MouseEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  GripVertical,
  ImageIcon,
  ImagePlus,
  Loader2,
  MoreHorizontal,
  Replace,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  ACCEPTED_IMAGE_TYPES,
  type GalleryPhoto,
  type PropertyMedia,
} from "@/hooks/usePropertyMedia";
import { WATERMARK_COMBINED_LABEL } from "@/lib/imoveis/watermark-config";
import { usePhotoSorting } from "@/components/imoveis/PhotoSortableGrid";
import { usePropertySyncStatus } from "@/hooks/usePropertySync";
import type { PublicationStatusView } from "@/lib/imoveis/publish.functions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const SITE_LABELS: Record<string, string> = { cordial: "Cordial", morar: "Morar" };
const ORDER_LABEL = {
  idle: "",
  saving: "Salvando ordem…",
  saved: "Ordem salva",
  error: "Não foi possível salvar a ordem.",
};
const TOOL_BUTTON =
  "flex h-11 min-w-0 flex-1 items-center justify-center rounded-lg text-foreground/70 hover:bg-accent hover:text-foreground focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-ring aria-disabled:text-muted-foreground/45";

function galleryStatusText(row: PublicationStatusView) {
  const expected = row.media.expectedCount ?? 0;
  const synced = row.media.syncedCount ?? 0;
  if (row.rateLimitedUntil && new Date(row.rateLimitedUntil).getTime() > Date.now()) {
    return `Aguardando limite do site até ${new Date(row.rateLimitedUntil).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  }
  if (row.media.status === "delivery_unknown") return "Conferindo envio sem repetir a foto";
  if (
    row.media.status === "synced" &&
    expected === synced &&
    row.media.orderGuarantee === "ordem_confirmada_por_leitura"
  ) {
    return `Galeria confirmada · ${synced} de ${expected}`;
  }
  if (row.activeJob?.status === "processing") return `Enviando ${synced} de ${expected}`;
  if (expected > synced) return `Aguardando envio · ${synced} de ${expected} confirmadas`;
  return "Aguardando envio";
}

function processingLabel({ image, upload, recovering }: GalleryPhoto) {
  if (image) {
    switch (image.processingStatus) {
      case "pending":
        return "Na fila da marca-d’água";
      case "processing":
        return "Aplicando marca";
      case "failed_permanent":
        return "Arquivo indisponível. Substitua a foto.";
      case "failed":
      case "failed_retryable":
        return "Processamento será retomado";
      default:
        return null;
    }
  }
  if (recovering || upload?.status === "processando") return "Conferindo no servidor";
  if (upload?.status === "enviando") return `Enviando ${upload.progress}%`;
  return "Aguardando envio";
}

type ArrowClick = { key: string; delta: -1 | 1; x: number; y: number; time: number };

export function PropertyPhotosStep({
  propertyId,
  destinos = [],
  onRequestSave,
  media,
}: {
  propertyId?: string | null;
  destinos?: string[];
  onRequestSave?: () => Promise<string | null>;
  media: PropertyMedia;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const replacementRef = useRef<HTMLInputElement>(null);
  const replacing = useRef<string | null>(null);
  const arrowClick = useRef<ArrowClick | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [direct, setDirect] = useState<{ key: string; position: number } | null>(null);
  const gallerySync = usePropertySyncStatus(propertyId ?? undefined);
  const photos = media.photos;
  const linkedPhotos = photos.filter(({ image }) => image);
  const ready = linkedPhotos.filter(
    ({ image }) => image?.processingStatus === "ready" || image?.processingStatus === "legacy",
  ).length;
  const uploads = photos.length - linkedPhotos.length;
  const failed =
    linkedPhotos.length -
    ready -
    linkedPhotos.filter(
      ({ image }) =>
        image?.processingStatus === "pending" || image?.processingStatus === "processing",
    ).length;
  const notices = media.progress.filter(
    (item) =>
      ["erro", "duplicada", "retomada"].includes(item.status) ||
      (item.replacement && ["enviando", "preparando", "processando"].includes(item.status)),
  );

  const targetsKey = [...destinos].sort().join(",");
  const lastTargets = useRef<string | null>(null);
  useEffect(() => {
    if (!propertyId) return;
    const key = `${propertyId}:${targetsKey}`;
    if (lastTargets.current === key) return;
    lastTargets.current = key;
    media.updateTargets.mutate(targetsKey ? targetsKey.split(",") : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, targetsKey]);

  async function pickFiles() {
    if (!propertyId && onRequestSave) {
      setPreparing(true);
      try {
        if (!(await onRequestSave())) return;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Salve o imóvel antes de enviar fotos.");
        return;
      } finally {
        setPreparing(false);
      }
    }
    inputRef.current?.click();
  }

  function announce(key: string, destination: number) {
    const photo = photos.find((item) => item.key === key);
    const name = photo?.name ?? "Foto do imóvel";
    setAnnouncement(`${name} movida para a posição ${destination + 1} de ${photos.length}.`);
  }

  const sorting = usePhotoSorting({
    ids: photos.map(({ key }) => key),
    onMove: (key, destination) => {
      const moved = media.movePhoto(key, destination);
      if (moved) announce(key, destination);
      return moved;
    },
  });

  function stepPhoto(key: string, delta: -1 | 1, showFocus = false) {
    const moved = sorting.animateMove(
      key,
      delta < 0 ? "previous" : "next",
      () => media.moveRelative(key, delta),
      showFocus,
    );
    if (moved) announce(key, photos.findIndex((photo) => photo.key === key) + delta);
  }

  function clickArrow(event: MouseEvent, key: string, delta: -1 | 1) {
    if (event.detail > 0) {
      arrowClick.current = {
        key,
        delta,
        x: event.clientX,
        y: event.clientY,
        time: event.timeStamp,
      };
    }
    stepPhoto(key, delta, event.detail === 0);
  }

  function repeatArrow(event: MouseEvent) {
    const previous = arrowClick.current;
    if (!event.detail || !previous) return;
    const samePoint = Math.hypot(event.clientX - previous.x, event.clientY - previous.y) < 12;
    if (!samePoint || event.timeStamp - previous.time > 450) {
      arrowClick.current = null;
      return;
    }
    // O controle pode ter deslizado para outra célula desde o clique anterior.
    event.stopPropagation();
    event.preventDefault();
    arrowClick.current = { ...previous, time: event.timeStamp };
    stepPhoto(previous.key, previous.delta);
  }

  const directPhoto = direct && photos.find((photo) => photo.key === direct.key);
  const directPosition = Math.min(direct?.position ?? 0, Math.max(photos.length - 1, 0));

  return (
    <section className="@container/photos space-y-3" aria-labelledby="property-photos-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="property-photos-heading" className="text-sm font-bold">
            Fotos do imóvel
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            A primeira foto é a capa. Use a alça ou as setas para organizar.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          className="rounded-full px-4"
          onClick={() => void pickFiles()}
          disabled={preparing || (!propertyId && !onRequestSave)}
        >
          {preparing ? (
            <Loader2 className="size-4 motion-safe:animate-spin" />
          ) : (
            <ImagePlus className="size-4" />
          )}
          Adicionar fotos
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_IMAGE_TYPES.join(",")}
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = "";
            media.upload(files);
          }}
        />
        <input
          ref={replacementRef}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES.join(",")}
          className="hidden"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            const imageId = replacing.current;
            event.currentTarget.value = "";
            replacing.current = null;
            if (file && imageId) media.replace.mutate({ imageId, file });
          }}
        />
      </div>

      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>
      {media.orderState !== "idle" && (
        <div className="flex flex-wrap items-center gap-x-2 text-xs">
          <p
            role="status"
            className={
              media.orderState === "error"
                ? "font-semibold text-destructive"
                : "text-muted-foreground"
            }
          >
            {ORDER_LABEL[media.orderState]}
          </p>
          {media.orderState === "error" && (
            <button
              type="button"
              className="min-h-9 font-semibold text-primary underline underline-offset-2"
              onClick={() => void media.flushReorder().catch(() => undefined)}
            >
              Tentar novamente
            </button>
          )}
        </div>
      )}

      {!propertyId && (
        <p className="rounded-xl bg-muted p-3 text-xs text-muted-foreground">
          O Gestão salva um rascunho ao adicionar as primeiras fotos.
        </p>
      )}
      {propertyId && media.gallery.isError && (
        <p className="rounded-xl bg-destructive/10 p-3 text-xs text-destructive">
          Não foi possível carregar as fotos.{" "}
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => void media.gallery.refetch()}
          >
            Recarregar fotos
          </button>
        </p>
      )}
      {propertyId && media.gallery.isPending && !photos.length && (
        <p className="flex items-center gap-2 rounded-xl bg-muted p-3 text-xs text-muted-foreground">
          <Loader2 className="size-4 motion-safe:animate-spin" /> Carregando fotos…
        </p>
      )}
      {propertyId && media.gallery.isSuccess && !photos.length && (
        <p className="rounded-xl bg-muted p-3 text-center text-xs text-muted-foreground">
          Nenhuma foto anexada ainda.
        </p>
      )}

      {photos.length > 0 && (
        <>
          <div className="space-y-2 rounded-xl bg-muted/70 px-3 py-2 text-xs text-muted-foreground">
            <p>
              {ready} de {photos.length} {photos.length === 1 ? "foto pronta" : "fotos prontas"} com
              a marca {WATERMARK_COMBINED_LABEL}.
              {uploads > 0 && ` ${uploads} ${uploads === 1 ? "aguarda" : "aguardam"} confirmação.`}
              {failed > 0 && ` ${failed} ${failed === 1 ? "precisa" : "precisam"} de atenção.`}
            </p>
            {(gallerySync.data ?? [])
              .filter((row) => destinos.includes(row.provider) && row.enabled)
              .map((row) => (
                <div
                  key={row.provider}
                  className="flex justify-between gap-3 border-t border-border pt-2"
                >
                  <span className="font-semibold text-foreground">
                    {SITE_LABELS[row.provider] ?? row.provider}
                  </span>
                  <span className="text-right">{galleryStatusText(row)}</span>
                </div>
              ))}
          </div>

          <ul
            aria-label="Ordem das fotos"
            onClickCapture={repeatArrow}
            className="grid grid-cols-2 gap-2 @min-[660px]/photos:grid-cols-4"
          >
            {photos.map((photo, index) => {
              const { key, image, upload, name } = photo;
              const cover = index === 0;
              const dragged = sorting.draggingId === key;
              const destination = !dragged && sorting.targetId === key;
              const src = image?.thumbUrl || image?.url || upload?.previewUrl;
              const label = processingLabel(photo);
              return (
                <li
                  key={key}
                  {...sorting.getItemProps(key)}
                  aria-label={`Foto ${index + 1}${cover ? ", capa" : ""}${name ? ` · ${name}` : ""}`}
                  className={`relative min-w-0 rounded-2xl ${dragged ? "z-30" : ""} ${destination ? "outline-2 outline-offset-1 outline-primary" : ""}`}
                >
                  <div
                    data-photo-card
                    className={`overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-inset ${cover ? "ring-primary/70" : "ring-border"} ${dragged ? "opacity-90 shadow-xl" : ""}`}
                  >
                    <div className="relative aspect-square bg-muted">
                      {src ? (
                        <img
                          src={src}
                          alt={name ?? `Foto ${index + 1} do imóvel`}
                          draggable={false}
                          loading="lazy"
                          decoding="async"
                          className="size-full object-cover"
                        />
                      ) : (
                        <div className="grid size-full place-items-center text-muted-foreground">
                          <ImageIcon aria-hidden="true" className="size-7" />
                        </div>
                      )}
                      <span
                        className={`absolute left-1.5 top-1.5 rounded-full px-2 py-1 text-[11px] leading-none font-bold tabular-nums ${cover ? "bg-primary text-primary-foreground" : "bg-black/75 text-white"}`}
                      >
                        {index + 1}
                        {cover && " · Capa"}
                      </span>
                      {image?.processingStatus === "ready" && image.watermarkLabel && (
                        <span className="absolute bottom-1.5 right-1.5 rounded-full bg-black/70 px-2 py-1 text-[10px] leading-none font-semibold text-white">
                          {image.watermarkLabel}
                        </span>
                      )}
                      {label && (
                        <span className="absolute inset-x-1.5 bottom-1.5 rounded-lg bg-black/75 px-2 py-1.5 text-[11px] font-semibold text-white">
                          {label}
                        </span>
                      )}
                    </div>

                    <div className="flex gap-0.5 border-t border-border px-0.5">
                      <button
                        type="button"
                        className={TOOL_BUTTON}
                        data-photo-control="previous"
                        aria-label="Mover uma posição antes"
                        title="Mover uma posição antes"
                        aria-disabled={cover}
                        onClick={(event) => clickArrow(event, key, -1)}
                      >
                        <ArrowLeft className="size-4" />
                      </button>
                      <button
                        type="button"
                        className={`${TOOL_BUTTON} cursor-grab select-none active:cursor-grabbing`}
                        {...sorting.getHandleProps(key)}
                        aria-label={`Arrastar foto ${index + 1}. Use as setas para mover pelo teclado.`}
                        title="Arrastar"
                      >
                        <GripVertical className="size-4" />
                      </button>
                      <button
                        type="button"
                        className={TOOL_BUTTON}
                        data-photo-control="next"
                        aria-label="Mover uma posição depois"
                        title="Mover uma posição depois"
                        aria-disabled={index === photos.length - 1}
                        onClick={(event) => clickArrow(event, key, 1)}
                      >
                        <ArrowRight className="size-4" />
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          type="button"
                          className={TOOL_BUTTON}
                          data-photo-control="menu"
                          aria-label={`Ações da foto ${index + 1}`}
                          title="Ações da foto"
                        >
                          <MoreHorizontal className="size-5" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-48">
                          <DropdownMenuItem
                            onSelect={() => setDirect({ key, position: index })}
                            disabled={photos.length < 2}
                          >
                            Mover para posição…
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={cover}
                            onSelect={() => sorting.move(key, 0, "menu", true)}
                          >
                            <Star /> Definir como capa
                          </DropdownMenuItem>
                          {image && (
                            <>
                              <DropdownMenuItem
                                onSelect={() => {
                                  replacing.current = image.id;
                                  replacementRef.current?.click();
                                }}
                              >
                                <Replace /> Substituir foto
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive"
                                onSelect={() => media.remove.mutate(image.id)}
                              >
                                <Trash2 /> Remover foto
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {notices.length > 0 && (
        <div className="space-y-1 rounded-xl bg-muted p-3 text-xs text-muted-foreground">
          {notices.some(({ status }) => ["erro", "duplicada", "retomada"].includes(status)) && (
            <button
              type="button"
              className="min-h-8 font-semibold text-primary"
              onClick={media.clearNotices}
            >
              Limpar avisos
            </button>
          )}
          <ul className="space-y-1" aria-label="Avisos de envio">
            {notices.map((item) => (
              <li key={item.key} className="wrap-anywhere">
                <strong>{item.name}</strong>
                {" · "}
                {item.status === "duplicada"
                  ? "Esta foto já está na galeria."
                  : item.status === "retomada"
                    ? "Processamento retomado."
                    : item.status === "erro"
                      ? `${item.error ?? "Arquivo não confirmado."} Selecione este arquivo novamente.`
                      : "Substituição em andamento."}
              </li>
            ))}
          </ul>
        </div>
      )}

      {media.uploadIssues.length > 0 && (
        <div className="rounded-xl bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
          <p className="font-semibold">Arquivos que precisam de atenção</p>
          <ul className="mt-1 space-y-1">
            {media.uploadIssues.map((issue, index) => (
              <li key={`${issue.createdAt}-${index}`} className="wrap-anywhere">
                <strong>{issue.fileName}</strong>
                {" · "}
                {issue.reason === "original_nao_chegou"
                  ? "O original não chegou ao servidor. Selecione este arquivo novamente."
                  : issue.reason === "foto_substituida_foi_removida"
                    ? "A foto substituída foi removida durante o envio. O original foi preservado."
                    : "O imóvel deixou de aceitar esta foto durante o envio."}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Dialog
        open={Boolean(directPhoto)}
        onOpenChange={(open) => {
          if (!open) setDirect(null);
        }}
      >
        <DialogContent className="w-[calc(100%_-_2rem)] max-w-sm rounded-2xl bg-card">
          <DialogTitle>Mover para posição</DialogTitle>
          <DialogDescription>
            {directPhoto?.name ?? "Foto do imóvel"}. Escolha uma posição na galeria. A posição 1
            define a capa.
          </DialogDescription>
          <label className="grid gap-1.5 text-sm font-medium">
            Nova posição
            <select
              value={directPosition}
              className="h-11 rounded-lg border border-input bg-background px-3"
              onChange={(event) =>
                setDirect((value) => value && { ...value, position: Number(event.target.value) })
              }
            >
              {photos.map((_, index) => (
                <option key={index} value={index}>
                  {index + 1}
                  {index === 0 ? " · Capa" : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setDirect(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (directPhoto) sorting.move(directPhoto.key, directPosition, "menu", true);
                setDirect(null);
              }}
            >
              Mover foto
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
