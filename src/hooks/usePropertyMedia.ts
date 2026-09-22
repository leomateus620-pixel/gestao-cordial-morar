import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  createPropertyImageUploadUrl,
  deletePropertyImage,
  getPropertyImageBatch,
  getPropertyGallerySnapshot,
  openPropertyImageBatch,
  registerPropertyImage,
  reorderPropertyImages,
  replacePropertyImage,
  reportPropertyImageBatchFailure,
  setPropertyImageCover,
  setPropertyPublishTargets,
} from "@/lib/imoveis/media.functions";
import { sha256Hex, uploadSignedWithProgress } from "@/lib/imoveis/image-client";
import { describeGalleryMove, type GalleryMove } from "@/lib/imoveis/gallery-move";
import type { PropertyImage } from "@/types/property";

export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const BUCKET = "property-images";
/** Envios simultâneos: rápido sem saturar a conexão do corretor. */
const UPLOAD_CONCURRENCY = 3;

/** Estado do salvamento da ordem, mostrado discretamente no organizador. */
export type OrderSaveState = "idle" | "saving" | "saved" | "syncing";

export type UploadItemStatus =
  | "preparando"
  | "enviando"
  | "processando"
  | "pronta"
  | "duplicada"
  | "retomada"
  | "erro";

export type UploadItem = {
  key: string;
  name: string;
  previewUrl: string;
  status: UploadItemStatus;
  progress: number;
  error?: string;
};

/**
 * Ordem escolhida pelo usuário que ainda não foi confirmada pelo servidor.
 * Enquanto existir, qualquer recarregamento respeita essa ordem — é o que
 * impede a foto de "voltar para o lugar" durante a organização.
 */
const pendingOrder = new Map<string, string[]>();
const galleryRevisionByProperty = new Map<string, number>();

export function applyPendingOrder(propertyId: string, images: PropertyImage[]): PropertyImage[] {
  const order = pendingOrder.get(propertyId);
  if (!order) return images;
  const byId = new Map(images.map((image) => [image.id, image]));
  const sorted = order.map((id) => byId.get(id)).filter(Boolean) as PropertyImage[];
  if (sorted.length !== images.length) return images;
  return sorted.map((image, index) => ({ ...image, position: index, isCover: index === 0 }));
}


export function usePropertyImages(propertyId: string | undefined) {
  const list = useServerFn(getPropertyGallerySnapshot);
  return useQuery<PropertyImage[]>({
    queryKey: ["property-images", propertyId],
    queryFn: async () => {
      const snapshot = await list({ data: { propertyId: propertyId as string } });
      galleryRevisionByProperty.set(propertyId as string, snapshot.revision);
      return applyPendingOrder(propertyId as string, snapshot.images);
    },
    enabled: !!propertyId,
    // Enquanto houver foto na fila, acompanhamos a marca sendo aplicada.
    refetchInterval: (query) =>
      (query.state.data ?? []).some(
        (image) =>
          image.processingStatus === "pending" ||
          image.processingStatus === "processing" ||
          image.processingStatus === "failed_retryable",
      )
        ? 3000
        : false,
  });
}

export function usePropertyMedia(propertyId: string | undefined) {
  const qc = useQueryClient();
  const createUrl = useServerFn(createPropertyImageUploadUrl);
  const register = useServerFn(registerPropertyImage);
  const setCoverFn = useServerFn(setPropertyImageCover);
  const reorderFn = useServerFn(reorderPropertyImages);
  const removeFn = useServerFn(deletePropertyImage);
  const replaceFn = useServerFn(replacePropertyImage);
  const targetsFn = useServerFn(setPropertyPublishTargets);
  const openBatchFn = useServerFn(openPropertyImageBatch);
  const batchFailureFn = useServerFn(reportPropertyImageBatchFailure);
  const batchStateFn = useServerFn(getPropertyImageBatch);
  const [progress, setProgress] = useState<UploadItem[]>([]);
  const [uploading, setUploading] = useState(false);
  // "Salvando ordem…" / "Ordem salva" / "Sincronizando com os sites".
  const [orderState, setOrderState] = useState<OrderSaveState>("idle");
  const activeBatch = useRef<string | null>(null);

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["property-images", propertyId] });
    qc.invalidateQueries({ queryKey: ["imovel-detalhe", propertyId] });
    qc.invalidateQueries({ queryKey: ["property-drive", propertyId] });
    qc.invalidateQueries({ queryKey: ["imoveis"] });
  }, [qc, propertyId]);

  const patch = useCallback((key: string, next: Partial<UploadItem>) => {
    setProgress((items) => items.map((item) => (item.key === key ? { ...item, ...next } : item)));
  }, []);

  const sendOne = useCallback(
    async (key: string, file: File, replacementFor?: string) => {
      if (!propertyId) throw new Error("Salve o imóvel antes de enviar fotos.");
      // O original entra primeiro no armazenamento durável. O worker aplica a
      // marca depois, inclusive se o navegador for fechado imediatamente.
      patch(key, { status: "preparando", progress: 0, error: undefined });
      const hash = await sha256Hex(file);
      const target = await createUrl({ data: { propertyId, fileName: file.name } });
      patch(key, { status: "enviando" });
      await uploadSignedWithProgress({
        bucket: BUCKET, path: target.path, token: target.token, blob: file,
        contentType: file.type || "application/octet-stream",
        onProgress: (ratio) => patch(key, { progress: Math.min(99, Math.round(ratio * 100)) }),
      });

      const result = await register({
        data: {
          propertyId,
          storagePath: target.path,
          fileName: file.name,
          mimeType: file.type || null,
          sizeBytes: file.size,
          contentHash: hash,
          replacementFor: replacementFor ?? null,
          batchId: activeBatch.current,
        },
      });
      patch(key, {
        progress: 100,
        status: result.resumed ? "retomada" : result.duplicated ? "duplicada" : "pronta",
      });
      return result.imageId;
    },
    [createUrl, patch, propertyId, register],
  );

  /**
   * Fila com concorrência limitada — uma falha nunca interrompe as demais.
   * O lote é transacional: só é considerado concluído quando registradas +
   * duplicadas + com falha alcançam a quantidade selecionada.
   */
  const runQueue = useCallback(
    async (entries: { key: string; file: File }[]) => {
      setUploading(true);
      let batchId: string | null = null;
      if (propertyId) {
        try {
          const opened = await openBatchFn({
            data: { propertyId, expectedCount: entries.length },
          });
          batchId = opened.batchId;
        } catch {
          // Sem lote o envio continua; a conferência acontece pela lista.
        }
      }
      activeBatch.current = batchId;

      let cursor = 0;
      const workers = Array.from(
        { length: Math.min(UPLOAD_CONCURRENCY, entries.length) },
        async () => {
          while (cursor < entries.length) {
            const entry = entries[cursor++]!;
            try {
              await sendOne(entry.key, entry.file);
            } catch (err) {
              patch(entry.key, {
                status: "erro",
                error: (err as Error)?.message ?? "Não foi possível enviar esta foto.",
              });
              if (batchId) {
                try {
                  await batchFailureFn({ data: { batchId } });
                } catch {
                  /* o lote fica aberto e a lista mostra a foto com erro */
                }
              }
            }
            invalidate();
          }
        },
      );
      await Promise.all(workers);
      activeBatch.current = null;
      setUploading(false);
      invalidate();

      // Lote registrado por completo: as fotos vão para os sites publicados.
      if (batchId && propertyId) {
        try {
          const state = await batchStateFn({ data: { batchId } });
           if (state && state.failed > 0)
             toast.warning(
               `${state.registered + state.duplicated} de ${state.expected} fotos chegaram ao servidor. Se alguma não aparecer na galeria, selecione o arquivo faltante novamente.`,
             );
        } catch {
          /* a fila do servidor recupera */
        }
      }
      return batchId;
    },
    [
      batchFailureFn,
      batchStateFn,
      invalidate,
      openBatchFn,
      patch,
      propertyId,
      sendOne,
    ],
  );

  const upload = useCallback(
    (files: File[]) => {
      const entries = files.map((file) => {
        const key = `${file.name}-${file.size}-${crypto.randomUUID().slice(0, 8)}`;
        return { key, file };
      });
      setProgress((items) => [
        ...items,
        ...entries.map(({ key, file }) => ({
          key,
          name: file.name,
          // Prévia local imediata: aparece antes de qualquer envio.
          previewUrl: URL.createObjectURL(file),
          status: "preparando" as UploadItemStatus,
          progress: 0,
        })),
      ]);
      void runQueue(entries);
    },
    [runQueue],
  );

  const setCover = useMutation({
    mutationFn: (imageId: string) =>
      setCoverFn({ data: { propertyId: propertyId as string, imageId } }),
    onSuccess: invalidate,
  });

  const reorder = useMutation({
    mutationFn: (orderedIds: string[]) =>
      reorderFn({ data: { propertyId: propertyId as string, orderedIds } }),
    onSuccess: invalidate,
  });

  /**
   * Reordenação com salvamento automático: aplica na hora na tela, agrupa
   * trocas seguidas e, ao gravar, reenvia as fotos para os sites publicados.
   */
  const reorderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingOrder = useRef<Promise<void> | null>(null);
  // Última ordem escolhida ainda não confirmada — usada pelo "Concluir".
  const latestOrder = useRef<string[] | null>(null);

  const pendingMove = useRef<GalleryMove | null>(null);
  const pendingRevision = useRef<number | null>(null);
  const persistOrder = useCallback(
    async (orderedIds: string[], previous: PropertyImage[] | undefined, move: GalleryMove | null, expectedRevision: number | null) => {
      if (!propertyId) return;
      const key = ["property-images", propertyId];
      try {
        await savingOrder.current;
      } catch {
        /* ignora falha anterior */
      }
      setOrderState("saving");
      const run = (async () => {
        try {
          await reorderFn({ data: {
            propertyId, orderedIds,
            ...(expectedRevision != null ? { expectedGalleryRevision: expectedRevision } : {}),
            move,
          } });
          if (pendingOrder.get(propertyId) === orderedIds) pendingOrder.delete(propertyId);
          if (latestOrder.current === orderedIds) latestOrder.current = null;
          setOrderState("saved");
          invalidate();
        } catch (err) {
          if (pendingOrder.get(propertyId) === orderedIds) pendingOrder.delete(propertyId);
          if (latestOrder.current === orderedIds) latestOrder.current = null;
          if (previous) qc.setQueryData(key, previous);
          setOrderState("idle");
          const message = (err as Error)?.message ?? "";
          if (/galeria_desatualizada|conflito_ordenacao|incompleta|outro imóvel|aguardando exclusão/i.test(message)) {
            // Lista desatualizada: recarrega a galeria atual e pede para repetir.
            invalidate();
            toast.warning(
              "A foto movida ou sua referência mudou durante a organização. A galeria foi atualizada.",
            );
          } else {
            toast.error(message || "Não foi possível salvar a nova ordem das fotos.");
          }
          throw err;
        }
      })();
      savingOrder.current = run.catch(() => undefined);
      await run;
    },
     [propertyId, qc, reorderFn, invalidate],
  );

  const previousOrder = useRef<PropertyImage[] | undefined>(undefined);

  const reorderPhotos = useCallback(
    (orderedIds: string[], movedId: string | null = null) => {
      if (!propertyId) return;
      const key = ["property-images", propertyId];
      const detailKey = ["imovel-detalhe", propertyId];
      const previous = qc.getQueryData<PropertyImage[]>(key);
      const baseOrderedIds = (previous ?? []).map((image) => image.id);
      const move = movedId ? describeGalleryMove(baseOrderedIds, orderedIds, movedId) : null;
      pendingMove.current = move;
      pendingRevision.current = galleryRevisionByProperty.get(propertyId) ?? null;
      if (!previousOrder.current) previousOrder.current = previous;

      // A ordem escolhida passa a valer para qualquer recarregamento até o
      // servidor confirmar — assim nenhuma atualização em segundo plano
      // devolve a foto para a posição antiga.
      pendingOrder.set(propertyId, orderedIds);
      latestOrder.current = orderedIds;
      void qc.cancelQueries({ queryKey: key });

      const applyLocal = (images: PropertyImage[] | undefined) => {
        if (!images?.length) return undefined;
        const byId = new Map(images.map((image) => [image.id, image]));
        const next = orderedIds
          .map((id) => byId.get(id))
          .filter(Boolean)
          // Posição 0 é sempre a capa — a tela mostra isso na hora.
          .map((image, index) => ({
            ...(image as PropertyImage),
            position: index,
            isCover: index === 0,
          }));
        return next.length === images.length ? next : undefined;
      };

      const nextList = applyLocal(previous);
      if (nextList) qc.setQueryData(key, nextList);
      const detail = qc.getQueryData<{ images?: PropertyImage[] }>(detailKey);
      const nextDetail = applyLocal(detail?.images);
      if (detail && nextDetail) qc.setQueryData(detailKey, { ...detail, images: nextDetail });

      if (reorderTimer.current) clearTimeout(reorderTimer.current);
      const rollback = previousOrder.current;
      reorderTimer.current = setTimeout(() => {
        reorderTimer.current = null;
        previousOrder.current = undefined;
        void persistOrder(orderedIds, rollback, pendingMove.current, pendingRevision.current).catch(() => undefined);
      }, 120);
    },
    [propertyId, qc, persistOrder],
  );

  /**
   * "Concluir": grava agora a ordem pendente e só devolve o controle quando o
   * servidor confirmar — nada se perde se o usuário sair logo em seguida.
   */
  const flushReorder = useCallback(async () => {
    if (reorderTimer.current) {
      clearTimeout(reorderTimer.current);
      reorderTimer.current = null;
    }
    const pending = latestOrder.current;
    const rollback = previousOrder.current;
    previousOrder.current = undefined;
    if (pending) await persistOrder(pending, rollback, pendingMove.current, pendingRevision.current);
    else await savingOrder.current;
  }, [persistOrder]);



  const remove = useMutation({
    mutationFn: (imageId: string) =>
      removeFn({ data: { propertyId: propertyId as string, imageId } }),
    onSuccess: invalidate,
  });

  /**
   * Substitui uma foto: a nova sobe, assume a posição da antiga e a antiga entra
   * em exclusão pendente nos sites (a original é preservada até a confirmação).
   */
  const replace = useMutation({
    mutationFn: async ({ imageId, file }: { imageId: string; file: File }) => {
      if (!propertyId) throw new Error("Salve o imóvel antes de trocar fotos.");
      const key = `replace-${imageId}-${crypto.randomUUID().slice(0, 8)}`;
      setProgress((items) => [
        ...items,
        {
          key,
          name: file.name,
          previewUrl: URL.createObjectURL(file),
          status: "preparando" as UploadItemStatus,
          progress: 0,
        },
      ]);
      const expectedGalleryRevision = galleryRevisionByProperty.get(propertyId);
      const newImageId = await sendOne(key, file, imageId);
      if (!newImageId) throw new Error("A nova foto não pôde ser registrada.");
      await replaceFn({
        data: { propertyId, oldImageId: imageId, newImageId, expectedGalleryRevision },
      });
    },
    onSuccess: () => {
      invalidate();
      toast.success("Foto substituída. A troca nos sites acontece em seguida.");
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Não foi possível substituir a foto."),
  });

  const updateTargets = useMutation({
    mutationFn: (targets: string[]) =>
      targetsFn({ data: { propertyId: propertyId as string, targets } }),
    onSuccess: invalidate,
  });

  const clearProgress = useCallback(() => {
    setProgress((items) => {
      for (const item of items) URL.revokeObjectURL(item.previewUrl);
      return [];
    });
  }, []);

  return {
    upload: { mutate: upload, isPending: uploading },
    setCover,
    reorder,
    reorderPhotos,
    flushReorder,
    orderState,


    remove,
    replace,
    updateTargets,
    progress,
    clearProgress,
  };
}
