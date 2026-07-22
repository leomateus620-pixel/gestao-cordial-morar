import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  deleteRentalContractDocument,
  listRentalContractDocuments,
  registerRentalContractDocument,
} from "@/lib/rentals/rentals.functions";
import type { RentalContractDocument, RentalDocumentCategory } from "@/types/rental";

const MAX_BYTES = 50 * 1024 * 1024; // 50 MB
const DOCS_BUCKET = "rental-documents";

function sanitize(name: string) {
  return name.replace(/[^\w.\-]+/g, "_").slice(0, 120);
}

export function useRentalDocuments(contractId: string | null) {
  const qc = useQueryClient();
  const list = useServerFn(listRentalContractDocuments);
  const register = useServerFn(registerRentalContractDocument);
  const remove = useServerFn(deleteRentalContractDocument);

  const query = useQuery<RentalContractDocument[]>({
    queryKey: ["rentals", "documents", contractId],
    queryFn: () => list({ data: { contractId: contractId! } }),
    enabled: !!contractId,
    staleTime: 30_000,
  });

  const uploadMutation = useMutation({
    mutationFn: async (args: { file: File; category?: RentalDocumentCategory }) => {
      const { file, category } = args;
      if (!contractId) throw new Error("Contrato inválido.");
      if (file.size <= 0) throw new Error("Arquivo vazio.");
      if (file.size > MAX_BYTES) throw new Error("Arquivo excede 50 MB.");

      const safeName = sanitize(file.name);
      const filePath = `${contractId}/${crypto.randomUUID()}-${safeName}`;
      const contentType = file.type || "application/octet-stream";

      // Direct upload to Storage (bypasses server-function payload limits).
      const { error: upErr } = await supabase.storage
        .from(DOCS_BUCKET)
        .upload(filePath, file, { contentType, upsert: false });
      if (upErr) throw new Error(upErr.message);

      try {
        return await register({
          data: {
            contractId,
            fileName: file.name,
            filePath,
            mimeType: contentType,
            sizeBytes: file.size,
            category,
          },
        });
      } catch (e) {
        // Rollback the storage object if metadata insert fails.
        await supabase.storage.from(DOCS_BUCKET).remove([filePath]);
        throw e;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rentals", "documents", contractId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rentals", "documents", contractId] });
    },
  });

  return {
    documents: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    uploadFile: (file: File, category?: RentalDocumentCategory) =>
      uploadMutation.mutateAsync({ file, category }),
    deleteFile: (id: string) => deleteMutation.mutateAsync(id),
    isUploading: uploadMutation.isPending,
    isDeleting: deleteMutation.isPending,
    uploadError: uploadMutation.error as Error | null,
  };
}
