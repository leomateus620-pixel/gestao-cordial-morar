import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  createPropertyImageUploadUrl,
  deletePropertyImage,
  getPropertyImageBatch,
  getPropertyGallerySnapshot,
  listPropertyImageUploadIssues,
  type PropertyGallerySnapshot,
  type PropertyImageUploadIssue,
  openPropertyImageBatch,
  registerPropertyImage,
  reorderPropertyImages,
  reportPropertyImageBatchFailure,
  setPropertyPublishTargets,
} from "@/lib/imoveis/media.functions";
import {
  prepareImageForUpload,
  sha256Hex,
  uploadSignedWithProgress,
} from "@/lib/imoveis/image-client";
import { describeGalleryMove } from "@/lib/imoveis/gallery-move";
import { createGalleryOrderQueue } from "@/lib/imoveis/gallery-order";
import { orderByDatabase, resolveGalleryMode } from "@/lib/imoveis/gallery-fallback";
import type { PropertyImage } from "@/types/property";

export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const BUCKET = "property-images";
const UPLOAD_CONCURRENCY = 3;

type UploadItemStatus =
  | "preparando"
  | "enviando"
  | "processando"
  | "pronta"
  | "duplicada"
  | "retomada"
  | "erro";

type UploadItem = {
  key: string;
  name: string;
  previewUrl: string;
  status: UploadItemStatus;
  progress: number;
  replacement: boolean;
  image?: PropertyImage;
  error?: string;
};

export type GalleryPhoto = {
  key: string;
  image?: PropertyImage;
  upload?: UploadItem;
  name?: string;
  recovering?: boolean;
};

type UploadEntry = { key: string; file: File };

class UploadRecoveryPendingError extends Error {}

function imageKey(image: PropertyImage) {
  return image.uploadKey ?? image.id;
}

function unsignedUrl(url: string) {
  const [path, query] = url.split("?");
  if (!query) return path;
  const params = new URLSearchParams(query);
  params.delete("token");
  return params.size ? `${path}?${params}` : path;
}

function reuseSignedImages(previous: PropertyImage[], next: PropertyImage[]) {
  const byId = new Map(previous.map((image) => [image.id, image]));
  return next.map((image) => {
    const old = byId.get(image.id);
    if (
      !old?.url ||
      !old.signedAt ||
      Date.now() - old.signedAt > 50 * 60_000 ||
      old.assetVersion !== image.assetVersion ||
      unsignedUrl(old.url) !== unsignedUrl(image.url) ||
      unsignedUrl(old.thumbUrl) !== unsignedUrl(image.thumbUrl)
    )
      return image;
    return { ...image, url: old.url, thumbUrl: old.thumbUrl, signedAt: old.signedAt };
  });
}

const galleryQueryKey = (propertyId: string | undefined) =>
  ["property-images", propertyId] as const;

function useGallerySnapshot<T = PropertyGallerySnapshot>(
  propertyId: string | undefined,
  select?: (snapshot: PropertyGallerySnapshot) => T,
) {
  const list = useServerFn(getPropertyGallerySnapshot);
  const qc = useQueryClient();
  const key = galleryQueryKey(propertyId);
  return useQuery({
    queryKey: key,
    queryFn: async () => {
      const snapshot = await list({ data: { propertyId: propertyId as string } });
      const previous = qc.getQueryData<PropertyGallerySnapshot>(key);
      if (!previous) return snapshot;
      if (previous.revision > snapshot.revision) return previous;
      return { ...snapshot, images: reuseSignedImages(previous.images, snapshot.images) };
    },
    enabled: !!propertyId,
    select,
    refetchInterval: (query) => {
      const snapshot = query.state.data;
      if (
        snapshot?.recovering.some(({ status }) => status === "reserved") ||
        snapshot?.images.some((image) =>
          ["pending", "processing", "failed_retryable"].includes(image.processingStatus),
        )
      )
        return 3000;
      return snapshot?.recovering.length ? 60_000 : false;
    },
  });
}

const selectImages = (snapshot: PropertyGallerySnapshot) => snapshot.images;
export function usePropertyImages(propertyId: string | undefined) {
  return useGallerySnapshot(propertyId, selectImages);
}

export function usePropertyMedia(propertyId: string | undefined) {
  const qc = useQueryClient();
  const gallery = useGallerySnapshot(propertyId);
  const createUrl = useServerFn(createPropertyImageUploadUrl);
  const register = useServerFn(registerPropertyImage);
  const loadUploadIssues = useServerFn(listPropertyImageUploadIssues);
  const reorderFn = useServerFn(reorderPropertyImages);
  const removeFn = useServerFn(deletePropertyImage);
  const targetsFn = useServerFn(setPropertyPublishTargets);
  const openBatchFn = useServerFn(openPropertyImageBatch);
  const batchFailureFn = useServerFn(reportPropertyImageBatchFailure);
  const batchStateFn = useServerFn(getPropertyImageBatch);
  const [progress, setProgress] = useState<UploadItem[]>([]);
  const previews = useRef(new Set<string>());
  const batches = useRef<UploadEntry[][]>([]);
  const uploading = useRef(false);

  const uploadIssues = useQuery<PropertyImageUploadIssue[]>({
    queryKey: ["property-image-upload-issues", propertyId],
    queryFn: () => loadUploadIssues({ data: { propertyId: propertyId as string } }),
    enabled: !!propertyId,
    refetchInterval: 60_000,
  });

  const invalidateRelated = useCallback(
    (refetchDetail = true) => {
      void qc.invalidateQueries({
        queryKey: ["imovel-detalhe", propertyId],
        refetchType: refetchDetail ? "active" : "none",
      });
      void qc.invalidateQueries({ queryKey: ["property-drive", propertyId] });
      void qc.invalidateQueries({ queryKey: ["imoveis"] });
      void qc.invalidateQueries({ queryKey: ["property-sync", propertyId] });
    },
    [qc, propertyId],
  );

  const invalidate = useCallback(() => {
    void qc.invalidateQueries({ queryKey: galleryQueryKey(propertyId) });
    void qc.invalidateQueries({ queryKey: ["property-image-upload-issues", propertyId] });
    invalidateRelated();
  }, [qc, propertyId, invalidateRelated]);

  const order = useMemo(
    () =>
      createGalleryOrderQueue(async (edits, retry) => {
        if (!propertyId) throw new Error("Salve o imóvel antes de organizar as fotos.");
        const result = await reorderFn({ data: { propertyId, edits, retry } });
        if (!("order" in result)) throw new Error("A ordem da galeria não foi confirmada.");
        // Atualiza a ordem na cache sem trocar as miniaturas ou repetir assinaturas.
        const known = new Set(
          qc
            .getQueryData<PropertyGallerySnapshot>(galleryQueryKey(propertyId))
            ?.images.map(imageKey),
        );
        qc.setQueryData<PropertyGallerySnapshot>(galleryQueryKey(propertyId), (previous) => {
          if (!previous || previous.revision > result.order.revision) return previous;
          const positions = new Map(result.order.activeKeys.map((key, index) => [key, index]));
          const images = previous.images
            .flatMap((image) => {
              const position = positions.get(imageKey(image));
              return position == null ? [] : [{ ...image, position, isCover: position === 0 }];
            })
            .sort((a, b) => a.position - b.position);
          return { ...previous, ...result.order, images };
        });
        if (result.order.activeKeys.some((key) => !known.has(key))) {
          void qc.invalidateQueries({ queryKey: galleryQueryKey(propertyId) });
        }
        invalidateRelated(false);
        return result.order;
      }),
    [propertyId, reorderFn, qc, invalidateRelated],
  );

  const orderView = useSyncExternalStore(order.subscribe, order.getSnapshot, order.getSnapshot);
  useLayoutEffect(() => {
    if (gallery.data) order.receive(gallery.data);
  }, [gallery.data, order]);

  const patch = useCallback((key: string, next: Partial<UploadItem>) => {
    setProgress((items) => items.map((item) => (item.key === key ? { ...item, ...next } : item)));
  }, []);

  function preview(key: string, file: File, replacement = false): UploadItem {
    const previewUrl = URL.createObjectURL(file);
    previews.current.add(previewUrl);
    return { key, name: file.name, previewUrl, status: "preparando", progress: 0, replacement };
  }

  useEffect(() => {
    const urls = previews.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  const sendOne = useCallback(
    async ({ key, file }: UploadEntry, batchId: string | null, replacementFor?: string) => {
      if (!propertyId) throw new Error("Salve o imóvel antes de enviar fotos.");
      const prepared = await prepareImageForUpload(file);
      const hash = await sha256Hex(prepared.blob);
      const target = await createUrl({
        data: {
          propertyId,
          fileName: prepared.fileName,
          contentHash: hash,
          sizeBytes: prepared.sizeBytes,
          mimeType: prepared.mimeType || null,
          replacementFor: replacementFor ?? null,
          batchId,
          uploadKey: replacementFor ? undefined : key,
        },
      });
      if (!target.reservationId) throw new Error("A intenção de upload não foi persistida.");
      try {
        patch(key, { status: "enviando" });
        await uploadSignedWithProgress({
          bucket: BUCKET,
          path: target.path,
          token: target.token,
          blob: prepared.blob,
          contentType: prepared.mimeType || "application/octet-stream",
          onProgress: (ratio) => patch(key, { progress: Math.min(99, Math.round(ratio * 100)) }),
        });
      } catch (error) {
        // O PUT pode ter chegado. O worker deve reaproveitar a mesma reserva.
        throw new UploadRecoveryPendingError(error instanceof Error ? error.message : undefined);
      }
      let result: Awaited<ReturnType<typeof register>>;
      try {
        result = await register({
          data: {
            propertyId,
            storagePath: target.path,
            fileName: prepared.fileName,
            mimeType: prepared.mimeType || null,
            sizeBytes: prepared.sizeBytes,
            contentHash: hash,
            reservationId: target.reservationId,
            replacementFor: replacementFor ?? null,
            batchId,
            width: prepared.width,
            height: prepared.height,
            onlyRegisteredImage: true,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Confirmação do arquivo pendente.";
        if (/permiss|Reserva de upload|indispon|inválid|invalid|removida/i.test(message))
          throw new Error(message);
        throw new UploadRecoveryPendingError(message);
      }
      patch(key, {
        progress: 100,
        status: result.resumed ? "retomada" : result.duplicated ? "duplicada" : "pronta",
        image: result.duplicated
          ? undefined
          : result.images.find((image) => image.id === result.imageId),
      });
      return result.imageId;
    },
    [createUrl, patch, propertyId, register],
  );

  const runBatch = useCallback(
    async (entries: UploadEntry[]) => {
      if (!propertyId) return;
      let batchId: string | null = null;
      try {
        batchId = (await openBatchFn({ data: { propertyId, expectedCount: entries.length } }))
          .batchId;
      } catch {
        // O slot já é durável. O envio pode seguir mesmo sem o contador do lote.
      }

      let cursor = 0;
      await Promise.all(
        Array.from({ length: Math.min(entries.length, UPLOAD_CONCURRENCY) }, async () => {
          while (cursor < entries.length) {
            const entry = entries[cursor++]!;
            try {
              await sendOne(entry, batchId);
            } catch (error) {
              if (error instanceof UploadRecoveryPendingError) {
                patch(entry.key, { status: "processando" });
              } else {
                patch(entry.key, {
                  status: "erro",
                  error:
                    error instanceof Error ? error.message : "Não foi possível enviar esta foto.",
                });
                order.enqueue({ type: "discard", key: entry.key });
                if (batchId) await batchFailureFn({ data: { batchId } }).catch(() => undefined);
              }
            }
            invalidate();
          }
        }),
      );
      if (batchId) {
        const state = await batchStateFn({ data: { batchId } }).catch(() => null);
        if (state && state.failed > 0) {
          toast.warning(
            `${state.registered + state.duplicated} de ${state.expected} fotos confirmadas. Selecione novamente os arquivos com erro.`,
          );
        }
      }
    },
    [batchFailureFn, batchStateFn, invalidate, openBatchFn, order, patch, propertyId, sendOne],
  );

  const startUploads = useCallback(async () => {
    if (uploading.current) return;
    uploading.current = true;
    try {
      while (batches.current.length) {
        await order.flush();
        await runBatch(batches.current.shift()!);
      }
    } catch {
      // Os arquivos continuam na fila para quando a ordem puder ser gravada.
    } finally {
      uploading.current = false;
    }
  }, [order, runBatch]);

  const upload = (files: File[]) => {
    if (!propertyId || !files.length) return;
    const entries = files.map((file) => ({ key: crypto.randomUUID(), file }));
    const items = entries.map(({ key, file }) => preview(key, file));
    setProgress((previous) => [...previous, ...items]);
    batches.current.push(entries);
    order.enqueue({ type: "append", keys: entries.map(({ key }) => key) });
    void startUploads();
  };

  const photos = useMemo(() => {
    const images = new Map(gallery.data?.images.map((image) => [imageKey(image), image]));
    const recovering = new Map(gallery.data?.recovering.map((item) => [item.key, item]));
    const uploads = new Map(
      progress.filter(({ replacement }) => !replacement).map((item) => [item.key, item]),
    );
    // Modo de segurança: a lista carregada não cobre todas as fotos ativas.
    // Vale a ordem inteira do banco, e nenhuma foto ativa some da tela.
    if (gallery.data && resolveGalleryMode(gallery.data.images, orderView.keys) === "safe") {
      const shown = orderByDatabase(gallery.data.images).map(
        (image): GalleryPhoto => ({ key: imageKey(image), image, name: image.fileName }),
      );
      const known = new Set(shown.map((photo) => photo.key));
      const pending = [...uploads.values()].flatMap((upload): GalleryPhoto[] =>
        !known.has(upload.key) && upload.status !== "erro" && upload.status !== "duplicada"
          ? [{ key: upload.key, upload, name: upload.name }]
          : [],
      );
      return [...shown, ...pending];
    }
    return orderView.keys.flatMap((key): GalleryPhoto[] => {
      const upload = uploads.get(key);
      const image = images.get(key) ?? upload?.image;
      const recovery = recovering.get(key);
      const name = upload?.name ?? recovery?.name ?? image?.fileName;
      if (image) return [{ key, image, upload, name }];
      if (recovery?.status === "missing") return [];
      if (upload && upload.status !== "erro" && upload.status !== "duplicada")
        return [{ key, upload, name }];
      if (recovering.has(key)) return [{ key, name, recovering: true }];
      return [];
    });
  }, [gallery.data, orderView.keys, progress]);

  const photosRef = useRef(photos);
  photosRef.current = photos;
  const movePhoto = useCallback(
    (key: string, destination: number) => {
      const keys = order.getSnapshot().keys;
      const visible = new Set(photosRef.current.map((photo) => photo.key));
      // Usa a fila síncrona também quando vários cliques chegam no mesmo quadro.
      const shown = keys.filter((id) => visible.has(id));
      const from = shown.indexOf(key);
      const target = shown[destination];
      if (from < 0 || !target || from === destination) return false;
      const next = keys.filter((id) => id !== key);
      const index = destination === 0 ? 0 : next.indexOf(target) + Number(from < destination);
      next.splice(index, 0, key);
      const move = describeGalleryMove(keys, next, key);
      if (move) order.enqueue({ type: "move", move });
      return Boolean(move);
    },
    [order],
  );

  const moveRelative = useCallback(
    (key: string, delta: number) => {
      const visible = new Set(photosRef.current.map((photo) => photo.key));
      const index = order
        .getSnapshot()
        .keys.filter((id) => visible.has(id))
        .indexOf(key);
      return index >= 0 && movePhoto(key, index + delta);
    },
    [movePhoto, order],
  );

  const flushReorder = useCallback(async () => {
    await order.flush();
    void startUploads();
  }, [order, startUploads]);

  const remove = useMutation({
    mutationFn: (imageId: string) =>
      removeFn({ data: { propertyId: propertyId as string, imageId } }),
    onSuccess: (_photos, imageId) => {
      const key = photosRef.current.find((photo) => photo.image?.id === imageId)?.key;
      invalidate();
      if (key) order.enqueue({ type: "discard", key });
    },
    onError: (error) => toast.error(error.message || "Não foi possível remover a foto."),
  });

  const replace = useMutation({
    mutationFn: async ({ imageId, file }: { imageId: string; file: File }) => {
      const key = crypto.randomUUID();
      const item = preview(key, file, true);
      setProgress((items) => [...items, item]);
      try {
        await sendOne({ key, file }, null, imageId);
      } catch (error) {
        if (error instanceof UploadRecoveryPendingError) {
          patch(key, { status: "processando" });
          return { pending: true };
        }
        patch(key, { status: "erro", error: error instanceof Error ? error.message : undefined });
        throw error;
      }
      return { pending: false };
    },
    onSuccess: (result) => {
      invalidate();
      if (!result.pending)
        toast.success("Foto substituída. A troca nos sites acontece em seguida.");
    },
    onError: (error) => toast.error(error.message || "Não foi possível substituir a foto."),
  });

  const updateTargets = useMutation({
    mutationFn: (targets: string[]) =>
      targetsFn({ data: { propertyId: propertyId as string, targets } }),
    onSuccess: invalidate,
  });

  const settledImages = useMemo(
    () =>
      new Set(gallery.data?.images.filter((image) => image.thumbUrl || image.url).map(imageKey)),
    [gallery.data?.images],
  );
  useEffect(() => {
    for (const item of progress) {
      if (
        settledImages.has(item.key) ||
        item.image?.thumbUrl ||
        item.image?.url ||
        item.status === "duplicada" ||
        item.status === "erro" ||
        (item.replacement && item.status === "pronta")
      ) {
        if (previews.current.delete(item.previewUrl)) URL.revokeObjectURL(item.previewUrl);
      }
    }
  }, [progress, settledImages]);

  const galleryMode = gallery.data
    ? resolveGalleryMode(gallery.data.images, orderView.keys)
    : ("safe" as const);

  return {
    gallery,
    photos,
    /** "safe" desativa organizar, arrastar e definir capa. */
    galleryMode,
    upload,
    movePhoto,
    moveRelative,
    flushReorder,
    hasPendingOrder: order.hasPending,
    orderState: orderView.status,
    remove,
    replace,
    updateTargets,
    progress,
    clearNotices: () =>
      setProgress((items) =>
        items.filter(
          ({ status }) => status !== "erro" && status !== "duplicada" && status !== "retomada",
        ),
      ),
    uploadIssues: uploadIssues.data ?? [],
  };
}

export type PropertyMedia = ReturnType<typeof usePropertyMedia>;
