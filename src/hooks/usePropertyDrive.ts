import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  ACCEPTED_VIDEO_MIME,
  createPropertyVideoUploadUrl,
  deletePropertyVideo,
  getPropertyDriveStatus,
  registerPropertyVideo,
  retryPropertyDriveFiles,
  setPropertyImageOrientation,
  syncPropertyDriveNow,
  type PropertyDriveStatus,
} from "@/lib/imoveis/drive/property-drive.functions";
import type { DriveCategory } from "@/lib/imoveis/drive/naming";

export { ACCEPTED_VIDEO_MIME };

export function usePropertyDriveStatus(propertyId: string | undefined) {
  const load = useServerFn(getPropertyDriveStatus);
  return useQuery<PropertyDriveStatus>({
    queryKey: ["property-drive", propertyId],
    queryFn: () => load({ data: { propertyId: propertyId as string } }),
    enabled: !!propertyId,
    // Acompanha o progresso em segundo plano sem manter requisição aberta.
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      const busy =
        data.queueActive ||
        data.categories.some((c) => c.status === "enviando" || c.status === "preparando");
      return busy ? 4000 : false;
    },
  });
}

export function usePropertyDrive(propertyId: string | undefined) {
  const qc = useQueryClient();
  const syncFn = useServerFn(syncPropertyDriveNow);
  const retryFn = useServerFn(retryPropertyDriveFiles);
  const orientationFn = useServerFn(setPropertyImageOrientation);
  const uploadUrlFn = useServerFn(createPropertyVideoUploadUrl);
  const registerFn = useServerFn(registerPropertyVideo);
  const deleteVideoFn = useServerFn(deletePropertyVideo);
  const [videoProgress, setVideoProgress] = useState<
    { name: string; status: "enviando" | "pronto" | "erro"; error?: string }[]
  >([]);

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["property-drive", propertyId] });
    qc.invalidateQueries({ queryKey: ["agenciamento-vinculado", propertyId] });
  }, [qc, propertyId]);

  const sync = useMutation({
    mutationFn: () => syncFn({ data: { propertyId: propertyId as string } }),
    onSuccess: invalidate,
  });

  const retry = useMutation({
    mutationFn: (input: { category?: DriveCategory; fileId?: string }) =>
      retryFn({ data: { propertyId: propertyId as string, ...input } }),
    onSuccess: invalidate,
  });

  const setOrientation = useMutation({
    mutationFn: (input: { imageId: string; orientation: "horizontal" | "vertical" | null }) =>
      orientationFn({ data: { propertyId: propertyId as string, ...input } }),
    onSuccess: invalidate,
  });

  const uploadVideos = useMutation({
    mutationFn: async (files: File[]) => {
      if (!propertyId) throw new Error("Salve o imóvel antes de enviar vídeos.");
      for (const file of files) {
        setVideoProgress((p) => [...p, { name: file.name, status: "enviando" }]);
        try {
          if (!ACCEPTED_VIDEO_MIME.includes(file.type)) throw new Error("Formato não suportado.");
          const target = await uploadUrlFn({
            data: { propertyId, fileName: file.name, mimeType: file.type, sizeBytes: file.size },
          });
          const { error } = await supabase.storage
            .from("property-videos")
            .uploadToSignedUrl(target.path, target.token, file, { contentType: file.type });
          if (error) throw new Error(error.message);
          await registerFn({
            data: {
              propertyId,
              storagePath: target.path,
              fileName: file.name,
              mimeType: file.type,
              sizeBytes: file.size,
            },
          });
          setVideoProgress((p) =>
            p.map((item) =>
              item.name === file.name && item.status === "enviando" ? { ...item, status: "pronto" } : item,
            ),
          );
        } catch (err) {
          setVideoProgress((p) =>
            p.map((item) =>
              item.name === file.name && item.status === "enviando"
                ? { ...item, status: "erro", error: (err as Error)?.message }
                : item,
            ),
          );
        }
      }
    },
    onSettled: invalidate,
  });

  const removeVideo = useMutation({
    mutationFn: (videoId: string) => deleteVideoFn({ data: { propertyId: propertyId as string, videoId } }),
    onSuccess: invalidate,
  });

  return { sync, retry, setOrientation, uploadVideos, removeVideo, videoProgress };
}
