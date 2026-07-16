import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  deleteRentalContractDocument,
  listRentalContractDocuments,
  uploadRentalContractDocument,
} from "@/lib/rentals/rentals.functions";
import type { RentalContractDocument } from "@/types/rental";

const MAX_BYTES = 10 * 1024 * 1024;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = String(reader.result ?? "");
      resolve(r.includes(",") ? r.split(",")[1] : r);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function useRentalDocuments(contractId: string | null) {
  const qc = useQueryClient();
  const list = useServerFn(listRentalContractDocuments);
  const upload = useServerFn(uploadRentalContractDocument);
  const remove = useServerFn(deleteRentalContractDocument);

  const query = useQuery<RentalContractDocument[]>({
    queryKey: ["rentals", "documents", contractId],
    queryFn: () => list({ data: { contractId: contractId! } }),
    enabled: !!contractId,
    staleTime: 30_000,
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!contractId) throw new Error("Contrato inválido.");
      if (file.size > MAX_BYTES) throw new Error("Arquivo excede 10 MB.");
      const base64 = await fileToBase64(file);
      return upload({
        data: {
          contractId,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          base64,
        },
      });
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
    uploadFile: (file: File) => uploadMutation.mutateAsync(file),
    deleteFile: (id: string) => deleteMutation.mutateAsync(id),
    isUploading: uploadMutation.isPending,
    isDeleting: deleteMutation.isPending,
    uploadError: uploadMutation.error as Error | null,
  };
}
