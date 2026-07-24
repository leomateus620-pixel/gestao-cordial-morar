import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  deleteRentalContractDocument,
  listRentalContractDocuments,
  registerRentalContractDocument,
} from "@/lib/rentals/rentals.functions";
import {
  enableRentalDriveSync,
  disableRentalDriveSync,
  getRentalDriveFolder,
  syncRentalContractToDrive,
  syncRentalDocumentToDrive,
  trashRentalDocumentOnDrive,
} from "@/lib/google-drive/google-drive.functions";
import type { RentalContractDocument, RentalDocumentCategory } from "@/types/rental";

const MAX_BYTES = 50 * 1024 * 1024; // 50 MB
const DOCS_BUCKET = "rental-documents";

function sanitize(name: string) {
  return name.replace(/[^\w.-]+/g, "_").slice(0, 120);
}

export function useRentalDocuments(contractId: string | null) {
  const qc = useQueryClient();
  const list = useServerFn(listRentalContractDocuments);
  const register = useServerFn(registerRentalContractDocument);
  const remove = useServerFn(deleteRentalContractDocument);
  const getFolder = useServerFn(getRentalDriveFolder);
  const enableSync = useServerFn(enableRentalDriveSync);
  const disableSync = useServerFn(disableRentalDriveSync);
  const syncOne = useServerFn(syncRentalDocumentToDrive);
  const syncAll = useServerFn(syncRentalContractToDrive);
  const trashOne = useServerFn(trashRentalDocumentOnDrive);

  const query = useQuery<RentalContractDocument[]>({
    queryKey: ["rentals", "documents", contractId],
    queryFn: () => list({ data: { contractId: contractId! } }),
    enabled: !!contractId,
    staleTime: 30_000,
  });

  const folderQuery = useQuery({
    queryKey: ["rentals", "drive-folder", contractId],
    queryFn: () => getFolder({ data: { contractId: contractId! } }),
    enabled: !!contractId,
    staleTime: 30_000,
  });

  const invalidateAll = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["rentals", "documents", contractId] }),
      qc.invalidateQueries({ queryKey: ["rentals", "drive-folder", contractId] }),
    ]);

  const uploadMutation = useMutation({
    mutationFn: async (args: { file: File; category?: RentalDocumentCategory }) => {
      const { file, category } = args;
      if (!contractId) throw new Error("Contrato inválido.");
      if (file.size <= 0) throw new Error("Arquivo vazio.");
      if (file.size > MAX_BYTES) throw new Error("Arquivo excede 50 MB.");

      const safeName = sanitize(file.name);
      const filePath = `${contractId}/${crypto.randomUUID()}-${safeName}`;
      const contentType = file.type || "application/octet-stream";

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
        await supabase.storage.from(DOCS_BUCKET).remove([filePath]);
        throw e;
      }
    },
    onSuccess: invalidateAll,
  });

  const deleteMutation = useMutation({
    mutationFn: (args: { id: string; scope?: "both" | "cloud" | "drive" }) =>
      remove({ data: { id: args.id, scope: args.scope ?? "both" } }),
    onSuccess: invalidateAll,
  });

  const enableSyncMutation = useMutation({
    mutationFn: () => enableSync({ data: { contractId: contractId! } }),
    onSuccess: invalidateAll,
  });
  const disableSyncMutation = useMutation({
    mutationFn: (trash: boolean) => disableSync({ data: { contractId: contractId!, trash } }),
    onSuccess: invalidateAll,
  });
  const syncOneMutation = useMutation({
    mutationFn: (documentId: string) => syncOne({ data: { documentId } }),
    onSuccess: invalidateAll,
  });
  const syncAllMutation = useMutation({
    mutationFn: () => syncAll({ data: { contractId: contractId! } }),
    onSuccess: invalidateAll,
  });
  const trashDriveOnlyMutation = useMutation({
    mutationFn: (documentId: string) => trashOne({ data: { documentId } }),
    onSuccess: invalidateAll,
  });

  return {
    documents: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    driveFolder: folderQuery.data ?? null,
    isFolderLoading: folderQuery.isLoading,
    uploadFile: (file: File, category?: RentalDocumentCategory) =>
      uploadMutation.mutateAsync({ file, category }),
    deleteFile: (id: string, scope: "both" | "cloud" | "drive" = "both") =>
      deleteMutation.mutateAsync({ id, scope }),
    enableDriveSync: () => enableSyncMutation.mutateAsync(),
    disableDriveSync: (trash: boolean) => disableSyncMutation.mutateAsync(trash),
    syncDocumentToDrive: (documentId: string) => syncOneMutation.mutateAsync(documentId),
    syncAllToDrive: () => syncAllMutation.mutateAsync(),
    trashDriveCopy: (documentId: string) => trashDriveOnlyMutation.mutateAsync(documentId),
    isUploading: uploadMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isEnablingSync: enableSyncMutation.isPending,
    isDisablingSync: disableSyncMutation.isPending,
    isSyncing:
      syncOneMutation.isPending || syncAllMutation.isPending || trashDriveOnlyMutation.isPending,
    uploadError: uploadMutation.error as Error | null,
    driveError:
      (folderQuery.error as Error | null) ||
      (enableSyncMutation.error as Error | null) ||
      (disableSyncMutation.error as Error | null) ||
      (syncOneMutation.error as Error | null) ||
      (syncAllMutation.error as Error | null) ||
      (trashDriveOnlyMutation.error as Error | null) ||
      null,
  };
}
