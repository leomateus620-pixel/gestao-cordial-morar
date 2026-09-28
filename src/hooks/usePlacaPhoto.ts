import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { prepareImageForUpload } from "@/lib/imoveis/image-client";
import {
  PLACA_PHOTO_BUCKET,
  registerPlacaPhoto,
  removePlacaPhoto,
  signPlacaPhotoUrls,
} from "@/lib/agenciamentos/placa-photo.functions";

/** Alteração pendente da foto da placa, aplicada depois que o agenciamento tem id. */
export type PlacaPhotoChange = { kind: "upload"; file: File } | { kind: "remove" } | null;

function safeName(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .slice(-80) || "placa.jpg"
  );
}

export function usePlacaPhotoActions() {
  const qc = useQueryClient();
  const register = useServerFn(registerPlacaPhoto);
  const remove = useServerFn(removePlacaPhoto);

  const upload = useCallback(
    async (agenciamentoId: string, file: File) => {
      if (!file.type.startsWith("image/")) throw new Error("Envie apenas uma imagem.");
      const prepared = await prepareImageForUpload(file);
      const path = `${agenciamentoId}/${crypto.randomUUID()}-${safeName(prepared.fileName)}`;
      const { error } = await supabase.storage
        .from(PLACA_PHOTO_BUCKET)
        .upload(path, prepared.blob, { contentType: prepared.mimeType || file.type, upsert: false });
      if (error) throw new Error(`Não foi possível enviar a foto da placa: ${error.message}`);
      try {
        return await register({
          data: { agenciamentoId, filePath: path, mimeType: prepared.mimeType || file.type },
        });
      } catch (err) {
        await supabase.storage.from(PLACA_PHOTO_BUCKET).remove([path]);
        throw err;
      }
    },
    [register],
  );

  const apply = useCallback(
    async (agenciamentoId: string, change: PlacaPhotoChange) => {
      if (!change) return;
      if (change.kind === "upload") await upload(agenciamentoId, change.file);
      else await remove({ data: { agenciamentoId } });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["agenciamentos"] }),
        qc.invalidateQueries({ queryKey: ["agenciamento-vinculado"] }),
        qc.invalidateQueries({ queryKey: ["agenciamento-bonuses"] }),
        qc.invalidateQueries({ queryKey: ["placa-photo-urls"] }),
      ]);
    },
    [qc, remove, upload],
  );

  return { apply };
}

/** Links assinados das fotos de placa (lote único para a lista). */
export function usePlacaPhotoUrls(paths: Array<string | null | undefined>) {
  const sign = useServerFn(signPlacaPhotoUrls);
  const list = Array.from(new Set(paths.filter((p): p is string => Boolean(p)))).sort();
  return useQuery({
    queryKey: ["placa-photo-urls", list],
    queryFn: () => sign({ data: { paths: list } }),
    enabled: list.length > 0,
    staleTime: 45 * 60_000,
  });
}
