import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  createPropertyImageUploadUrl,
  deletePropertyImage,
  listPropertyImages,
  registerPropertyImage,
  reorderPropertyImages,
  setPropertyImageCover,
} from "@/lib/imoveis/media.functions";
import type { PropertyImage } from "@/types/property";

export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

async function sha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type UploadProgress = { name: string; status: "enviando" | "pronta" | "duplicada" | "erro"; error?: string };

export function usePropertyImages(propertyId: string | undefined) {
  const list = useServerFn(listPropertyImages);
  return useQuery<PropertyImage[]>({
    queryKey: ["property-images", propertyId],
    queryFn: () => list({ data: { propertyId: propertyId as string } }),
    enabled: !!propertyId,
  });
}

export function usePropertyMedia(propertyId: string | undefined) {
  const qc = useQueryClient();
  const createUrl = useServerFn(createPropertyImageUploadUrl);
  const register = useServerFn(registerPropertyImage);
  const setCoverFn = useServerFn(setPropertyImageCover);
  const reorderFn = useServerFn(reorderPropertyImages);
  const removeFn = useServerFn(deletePropertyImage);
  const [progress, setProgress] = useState<UploadProgress[]>([]);

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["property-images", propertyId] });
    qc.invalidateQueries({ queryKey: ["imovel-detalhe", propertyId] });
    qc.invalidateQueries({ queryKey: ["imoveis"] });
  }, [qc, propertyId]);

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      if (!propertyId) throw new Error("Salve o imóvel antes de enviar fotos.");
      for (const file of files) {
        setProgress((p) => [...p, { name: file.name, status: "enviando" }]);
        try {
          if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) throw new Error("Formato não suportado.");
          const hash = await sha256(file);
          const target = await createUrl({ data: { propertyId, fileName: file.name } });
          const { error } = await supabase.storage
            .from("property-images")
            .uploadToSignedUrl(target.path, target.token, file, { contentType: file.type });
          if (error) throw new Error(error.message);
          const result = await register({
            data: {
              propertyId,
              storagePath: target.path,
              fileName: file.name,
              mimeType: file.type,
              sizeBytes: file.size,
              contentHash: hash,
            },
          });
          setProgress((p) =>
            p.map((item) =>
              item.name === file.name && item.status === "enviando"
                ? { ...item, status: result.duplicated ? "duplicada" : "pronta" }
                : item,
            ),
          );
        } catch (err) {
          setProgress((p) =>
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

  const setCover = useMutation({
    mutationFn: (imageId: string) => setCoverFn({ data: { propertyId: propertyId as string, imageId } }),
    onSuccess: invalidate,
  });

  const reorder = useMutation({
    mutationFn: (orderedIds: string[]) =>
      reorderFn({ data: { propertyId: propertyId as string, orderedIds } }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (imageId: string) => removeFn({ data: { propertyId: propertyId as string, imageId } }),
    onSuccess: invalidate,
  });

  return { upload, setCover, reorder, remove, progress, clearProgress: () => setProgress([]) };
}
