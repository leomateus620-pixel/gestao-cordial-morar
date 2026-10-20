import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useSession } from "@/lib/auth-mock";
import { useDraftRow, useDrafts } from "@/lib/vistoria/drafts";
import { type PendingEntry } from "@/lib/vistoria/local-store";
import type { ItemRow, MediaRow } from "@/lib/vistoria/types";
import {
  inspectionKey,
  useLocalQueue,
  useObjectUrls,
  useSaver,
} from "@/lib/vistoria/use-inspection";
import {
  deleteMedia,
  getInspection,
  reorderMedia,
  signInspectionFiles,
  updateMedia,
} from "@/lib/vistoria/vistoria.functions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { fmtInspectionTime as fmt } from "@/lib/vistoria/ui";
type Saver = ReturnType<typeof useSaver>;
type Queue = ReturnType<typeof useLocalQueue>;
export function PhotosBlock(props: {
  inspectionId: string;
  media: MediaRow[];
  pending: PendingEntry[];
  readOnly: boolean;
  saver: Saver;
  onRetry: (k: string) => void;
  items: ItemRow[];
}) {
  const sign = useServerFn(signInspectionFiles);
  const userId = useSession()?.id;
  const paths = props.media.map((m) => m.storage_path);
  const urls = useQuery({
    queryKey: ["inspection-urls", userId, props.inspectionId, paths.join("|")],
    queryFn: () => sign({ data: { inspectionId: props.inspectionId, paths } }),
    enabled: paths.length > 0,
    staleTime: 50 * 60_000,
  });
  const localUrls = useObjectUrls(props.pending);
  const [viewId, setViewId] = useState<string | null>(null);
  const view = props.media.find((m) => m.id === viewId) ?? null;
  const photos = props.pending.filter((p) => p.kind === "photo");
  if (!props.media.length && !photos.length)
    return (
      <p className="rounded-2xl border border-dashed border-input p-4 text-center text-sm text-foreground/55">
        Nenhuma foto neste ambiente. Use Câmera ou Galeria abaixo.
      </p>
    );
  return (
    <>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label="Fotos do ambiente">
        {props.media.map((m, i) => (
          <li key={m.id}>
            <button
              type="button"
              onClick={() => setViewId(m.id)}
              className="relative block aspect-square w-full overflow-hidden rounded-xl bg-foreground/8"
              aria-label={`Abrir foto ${i + 1}${m.caption ? `: ${m.caption}` : ""}`}
            >
              <InspectionImage
                url={urls.data?.[m.storage_path]}
                alt={m.caption ?? `Foto ${i + 1}`}
                renew={() => urls.refetch()}
                loading={urls.isPending}
              />
              <span className="absolute left-1 top-1 rounded-md bg-background/85 px-1 text-[10px] font-bold">
                {i + 1}
              </span>
            </button>
          </li>
        ))}
        {photos.map((p) => (
          <li key={p.key}>
            <div className="relative aspect-square overflow-hidden rounded-xl bg-foreground/8">
              {localUrls[p.key] && (
                <img
                  src={localUrls[p.key]}
                  alt="Foto aguardando envio"
                  className="size-full object-cover opacity-70"
                />
              )}
              <div className="absolute inset-x-0 bottom-0 bg-background/90 p-1 text-center text-[10px] font-semibold">
                {p.status === "erro" ? (
                  <button
                    type="button"
                    onClick={() => props.onRetry(p.key)}
                    className="inline-flex min-h-11 items-center gap-1 text-destructive"
                  >
                    <RotateCcw className="size-3" />
                    Tentar de novo
                  </button>
                ) : p.status === "enviando" ? (
                  <span>
                    <Loader2 className="mr-1 inline size-3 animate-spin" />
                    Enviando
                  </span>
                ) : (
                  <span>Só no aparelho</span>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {view && (
        <PhotoViewer
          key={view.id}
          media={view}
          url={view ? urls.data?.[view.storage_path] : undefined}
          items={props.items}
          onClose={() => setViewId(null)}
          onNavigate={setViewId}
          renew={() => urls.refetch()}
          readOnly={props.readOnly}
          saver={props.saver}
          all={props.media}
        />
      )}
    </>
  );
}

function PhotoViewer({
  media,
  url,
  onClose,
  readOnly,
  saver,
  items,
  all,
  onNavigate,
  renew,
}: {
  media: MediaRow;
  url?: string;
  onClose: () => void;
  readOnly: boolean;
  saver: Saver;
  items: ItemRow[];
  all: MediaRow[];
  onNavigate: (id: string) => void;
  renew: () => Promise<unknown>;
}) {
  const upd = useServerFn(updateMedia);
  const del = useServerFn(deleteMedia);
  const draft = useDraftRow("media", media, media.id, media.room_id);
  const { controller } = useDrafts();
  const reorder = useServerFn(reorderMedia),
    get = useServerFn(getInspection);
  const qc = useQueryClient(),
    userId = useSession()?.id;
  const [confirm, setConfirm] = useState(false);

  const idx = all.findIndex((m) => m.id === media.id);
  const move = async (dir: -1 | 1) => {
    const other = all[idx + dir];
    if (!other) return;
    try {
      const fresh = await get({ data: { id: media.inspection_id } });
      const current = fresh.media.filter((m) => m.room_id === media.room_id);
      if (current.map((m) => m.id).join("|") !== all.map((m) => m.id).join("|"))
        throw new Error("A ordem mudou em outra tela. Atualize antes de reordenar.");
      const order = all.map((m) => m.id);
      [order[idx], order[idx + dir]] = [order[idx + dir], order[idx]];
      await saver.run(() =>
        reorder({
          data: {
            inspectionId: media.inspection_id,
            roomId: media.room_id,
            expectedRevision: fresh.inspection.revision,
            order,
          },
        }),
      );
      await qc.invalidateQueries({ queryKey: inspectionKey(media.inspection_id, userId) });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao ordenar");
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="inspection-workspace max-h-[92dvh] w-[calc(100vw-1rem)] max-w-xl overflow-y-auto p-3">
        <DialogTitle className="text-sm">
          Foto {idx + 1} ·{" "}
          {items.find((i) => i.id === draft.value.item_id)?.name || "Foto geral do ambiente"}
        </DialogTitle>
        <button
          type="button"
          className="min-h-11 text-sm text-primary"
          onClick={() => void renew()}
        >
          Renovar acesso à foto
        </button>
        <InspectionImage url={url} alt={media.caption ?? `Foto ${idx + 1}`} renew={renew} large />
        <div className="flex justify-between">
          <button
            type="button"
            disabled={idx === 0}
            className="min-h-11 px-3 text-sm disabled:opacity-40"
            onClick={() => onNavigate(all[idx - 1].id)}
          >
            Foto anterior
          </button>
          <button
            type="button"
            disabled={idx === all.length - 1}
            className="min-h-11 px-3 text-sm disabled:opacity-40"
            onClick={() => onNavigate(all[idx + 1].id)}
          >
            Próxima foto
          </button>
        </div>
        <p className="text-xs text-foreground/60">
          {media.time_source === "captura" ? "Capturada pela câmera" : "Importada da galeria"} ·
          registrada em {fmt(media.taken_at)} (horário do envio, não do arquivo)
        </p>
        <label className="block text-sm font-medium">
          Legenda
          <Input
            disabled={readOnly}
            value={draft.value.caption ?? ""}
            onChange={(e) => draft.set({ caption: e.target.value })}
            className="mt-1 h-11"
          />
        </label>
        <select
          disabled={readOnly}
          aria-label="Vincular a um item"
          value={draft.value.item_id ?? ""}
          onChange={(e) => draft.set({ item_id: e.target.value || null })}
          className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">Foto ampla do ambiente</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              Item: {i.name}
            </option>
          ))}
        </select>
        {!readOnly && (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={idx <= 0}
              onClick={() => void move(-1)}
              className="min-h-11 flex-1 rounded-xl border border-input text-sm disabled:opacity-30"
            >
              Mover antes
            </button>
            <button
              type="button"
              disabled={idx >= all.length - 1}
              onClick={() => void move(1)}
              className="min-h-11 flex-1 rounded-xl border border-input text-sm disabled:opacity-30"
            >
              Mover depois
            </button>
            <button
              type="button"
              onClick={() => setConfirm(true)}
              className="min-h-11 rounded-xl px-3 text-sm font-semibold text-destructive"
              aria-label="Excluir foto"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        )}
        <AlertDialog open={confirm} onOpenChange={setConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir esta foto?</AlertDialogTitle>
              <AlertDialogDescription>
                Ela será removida da vistoria e do armazenamento.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() =>
                  void saver
                    .run(
                      () => del({ data: { id: media.id, confirmed: true } }),
                      (f) => ({ ...f, media: f.media.filter((m) => m.id !== media.id) }),
                    )
                    .then(() => controller.discard(draft.key))
                    .then(onClose)
                }
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Relatos ---------------- */

function InspectionImage({
  url,
  alt,
  renew,
  loading = false,
  large = false,
}: {
  url?: string;
  alt: string;
  renew: () => Promise<unknown>;
  loading?: boolean;
  large?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const retried = useRef(false);
  useEffect(() => {
    setFailed(false);
  }, [url]);
  if (!url || failed)
    return (
      <span className="flex min-h-16 items-center justify-center p-2 text-center text-xs">
        {loading
          ? "Carregando foto…"
          : "Foto indisponível. Abra novamente para tentar renovar o acesso."}
      </span>
    );
  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={
        large ? "max-h-[55dvh] w-full rounded-xl object-contain" : "size-full object-cover"
      }
      onError={() => {
        setFailed(true);
        if (!retried.current) {
          retried.current = true;
          void renew();
        }
      }}
    />
  );
}
