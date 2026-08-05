import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  deleteInternalDocument,
  getInternalDocumentUrl,
  listInternalDocuments,
  registerInternalDocument,
  updateInternalDocument,
} from "@/lib/documentos/documentos.functions";
import {
  sanitizeInternalFileName,
  validateInternalDocumentFile,
  type InternalDocument,
} from "@/types/internal-document";

const BUCKET = "internal-documents";
const QUERY_KEY = ["internal-documents"] as const;

export function useInternalDocuments(enabled = true) {
  const qc = useQueryClient();
  const list = useServerFn(listInternalDocuments);
  const register = useServerFn(registerInternalDocument);
  const update = useServerFn(updateInternalDocument);
  const remove = useServerFn(deleteInternalDocument);
  const signUrl = useServerFn(getInternalDocumentUrl);

  const query = useQuery<InternalDocument[]>({
    queryKey: QUERY_KEY,
    queryFn: () => list(),
    enabled,
    staleTime: 30_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: QUERY_KEY });

  const uploadMutation = useMutation({
    mutationFn: async (args: { file: File; description?: string }) => {
      const { file, description } = args;
      const invalid = validateInternalDocumentFile(file);
      if (invalid) throw new Error(invalid);

      const filePath = `geral/${crypto.randomUUID()}-${sanitizeInternalFileName(file.name)}`;
      const contentType = file.type || "application/octet-stream";

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(filePath, file, { contentType, upsert: false });
      if (upErr) throw new Error(upErr.message);

      try {
        return await register({
          data: {
            title: file.name,
            description: description ?? null,
            category: "geral",
            filePath,
            fileName: file.name,
            mimeType: contentType,
            sizeBytes: file.size,
          },
        });
      } catch (e) {
        await supabase.storage.from(BUCKET).remove([filePath]);
        throw e;
      }
    },
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: (args: { id: string; title: string; description?: string | null }) =>
      update({ data: args }),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: invalidate,
  });

  async function openDocument(doc: InternalDocument, download = false) {
    const { url } = await signUrl({
      data: { path: doc.filePath, download, fileName: doc.fileName },
    });
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return {
    documents: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    uploadFile: (file: File, description?: string) =>
      uploadMutation.mutateAsync({ file, description }),
    updateDocument: (id: string, title: string, description?: string | null) =>
      updateMutation.mutateAsync({ id, title, description }),
    deleteDocument: (id: string) => deleteMutation.mutateAsync(id),
    openDocument,
    isUploading: uploadMutation.isPending,
    isSaving: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
