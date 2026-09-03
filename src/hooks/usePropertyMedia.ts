import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  createPropertyImageUploadUrl,
  deletePropertyImage,
  listPropertyImages,
  registerPropertyImage,
  reorderPropertyImages,
  retryPropertyImageWatermark,
  setPropertyImageCover,
  setPropertyPublishTargets,
} from "@/lib/imoveis/media.functions";
import { enqueuePropertySync } from "@/lib/imoveis/publish.functions";
import { sha256Hex, uploadSignedWithProgress } from "@/lib/imoveis/image-client";
import { composeWatermarkedUpload } from "@/lib/imoveis/watermark-client";
import type { PropertyImage } from "@/types/property";

export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const BUCKET = "property-images";
/** Envios simultâneos: rápido sem saturar a conexão do corretor. */
const UPLOAD_CONCURRENCY = 3;

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

export function usePropertyImages(propertyId: string | undefined) {
  const list = useServerFn(listPropertyImages);
  return useQuery<PropertyImage[]>({
    queryKey: ["property-images", propertyId],
    queryFn: () => list({ data: { propertyId: propertyId as string } }),
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
  const retryFn = useServerFn(retryPropertyImageWatermark);
  const targetsFn = useServerFn(setPropertyPublishTargets);
  const [progress, setProgress] = useState<UploadItem[]>([]);
  const [uploading, setUploading] = useState(false);
  // Guarda o arquivo para permitir "tentar novamente" sem reselecionar.
  const filesByKey = useRef(new Map<string, File>());

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
    async (key: string, file: File) => {
      if (!propertyId) throw new Error("Salve o imóvel antes de enviar fotos.");
      // A marca é composta aqui no navegador: a foto já sobe pronta para publicar.
      patch(key, { status: "processando", progress: 0, error: undefined });
      const composed = await composeWatermarkedUpload(file);
      const hash = await sha256Hex(composed.original.blob);
      const target = await createUrl({ data: { propertyId, fileName: composed.original.fileName } });

      patch(key, { status: "enviando" });
      const totalBytes =
        composed.original.blob.size + composed.processed.blob.size + composed.thumbnail.blob.size;
      let sentBytes = 0;
      const sendPart = async (
        part: { path: string; token: string },
        blob: Blob,
        contentType: string,
      ) => {
        await uploadSignedWithProgress({
          bucket: BUCKET,
          path: part.path,
          token: part.token,
          blob,
          contentType,
          onProgress: (ratio) =>
            patch(key, {
              progress: Math.min(
                99,
                Math.round(((sentBytes + ratio * blob.size) / totalBytes) * 100),
              ),
            }),
        });
        sentBytes += blob.size;
      };

      await sendPart(
        { path: target.path, token: target.token },
        composed.original.blob,
        composed.original.mimeType,
      );
      await sendPart(target.processed, composed.processed.blob, "image/jpeg");
      await sendPart(target.thumbnail, composed.thumbnail.blob, "image/jpeg");

      const result = await register({
        data: {
          propertyId,
          storagePath: target.path,
          fileName: composed.original.fileName,
          mimeType: composed.original.mimeType,
          sizeBytes: composed.original.blob.size,
          contentHash: hash,
          processedPath: target.processed.path,
          thumbnailPath: target.thumbnail.path,
          processedChecksum: composed.processed.checksum,
          watermarkVariant: composed.variant,
          watermarkVersion: composed.version,
          destinationHash: composed.destinationHash,
          width: composed.processed.width,
          height: composed.processed.height,
        },
      });
      patch(key, {
        progress: 100,
        status: result.resumed ? "retomada" : result.duplicated ? "duplicada" : "pronta",
      });
    },
    [createUrl, patch, propertyId, register],
  );

  /** Fila com concorrência limitada — uma falha nunca interrompe as demais. */
  const runQueue = useCallback(
    async (entries: { key: string; file: File }[]) => {
      setUploading(true);
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
            }
            invalidate();
          }
        },
      );
      await Promise.all(workers);
      setUploading(false);
      invalidate();
    },
    [invalidate, patch, sendOne],
  );

  const upload = useCallback(
    (files: File[]) => {
      const entries = files.map((file) => {
        const key = `${file.name}-${file.size}-${crypto.randomUUID().slice(0, 8)}`;
        filesByKey.current.set(key, file);
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

  const retryUpload = useCallback(
    (key: string) => {
      const file = filesByKey.current.get(key);
      if (!file) return;
      void runQueue([{ key, file }]);
    },
    [runQueue],
  );

  const enqueueSync = useServerFn(enqueuePropertySync);
  /** Reenfileira apenas os sites em que o imóvel já está publicado. */
  const syncOrderToProviders = useCallback(
    async (id: string) => {
      try {
        const detail = qc.getQueryData<{
          archivedAt: string | null;
          isDraft?: boolean;
          publications?: Array<{ provider: string; status: string }>;
        }>(["imovel-detalhe", id]);
        if (!detail || detail.archivedAt || detail.isDraft) return;
        const providers = (detail.publications ?? [])
          .filter((p) => p.status === "published" || p.status === "partial")
          .map((p) => p.provider);
        if (!providers.length) return;
        await enqueueSync({ data: { propertyId: id, providers, action: "update" } });
        qc.invalidateQueries({ queryKey: ["property-sync", id] });
      } catch {
        // A ordem já está salva; o painel de publicação permite reenviar.
      }
    },
    [qc, enqueueSync],
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
  const reorderPhotos = useCallback(
    (orderedIds: string[]) => {
      if (!propertyId) return;
      const key = ["property-images", propertyId];
      const previous = qc.getQueryData<PropertyImage[]>(key);
      if (previous) {
        const byId = new Map(previous.map((image) => [image.id, image]));
        const next = orderedIds
          .map((id) => byId.get(id))
          .filter(Boolean)
          .map((image, index) => ({ ...(image as PropertyImage), position: index }));
        if (next.length === previous.length) qc.setQueryData(key, next);
      }

      if (reorderTimer.current) clearTimeout(reorderTimer.current);
      reorderTimer.current = setTimeout(() => {
        void (async () => {
          try {
            await reorderFn({ data: { propertyId, orderedIds } });
            invalidate();
            await syncOrderToProviders(propertyId);
          } catch (err) {
            if (previous) qc.setQueryData(key, previous);
            toast.error(
              (err as Error)?.message ?? "Não foi possível salvar a nova ordem das fotos.",
            );
          }
        })();
      }, 800);
    },
    [propertyId, qc, reorderFn, invalidate, syncOrderToProviders],
  );

  const remove = useMutation({
    mutationFn: (imageId: string) =>
      removeFn({ data: { propertyId: propertyId as string, imageId } }),
    onSuccess: invalidate,
  });

  const retryWatermark = useMutation({
    mutationFn: (imageId?: string) =>
      retryFn({ data: { propertyId: propertyId as string, ...(imageId ? { imageId } : {}) } }),
    onSuccess: invalidate,
  });

  const updateTargets = useMutation({
    mutationFn: (targets: string[]) =>
      targetsFn({ data: { propertyId: propertyId as string, targets } }),
    onSuccess: invalidate,
  });

  const clearProgress = useCallback(() => {
    setProgress((items) => {
      for (const item of items) URL.revokeObjectURL(item.previewUrl);
      filesByKey.current.clear();
      return [];
    });
  }, []);

  return {
    upload: { mutate: upload, isPending: uploading },
    retryUpload,
    setCover,
    reorder,
    reorderPhotos,
    remove,
    retryWatermark,
    updateTargets,
    progress,
    clearProgress,
  };
}
