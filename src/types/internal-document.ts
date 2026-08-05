export type InternalDocument = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  filePath: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedBy: string | null;
  uploadedByName: string | null;
  createdAt: string;
  updatedAt: string;
};

export const INTERNAL_DOCUMENT_MAX_BYTES = 50 * 1024 * 1024;

export const INTERNAL_DOCUMENT_ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt,application/pdf,image/*,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain,text/csv";

export function formatFileSize(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** Valida um arquivo antes do upload. Retorna a mensagem de erro ou null. */
export function validateInternalDocumentFile(file: { name: string; size: number }): string | null {
  if (!file.name.trim()) return "Arquivo sem nome.";
  if (file.size <= 0) return `"${file.name}" está vazio.`;
  if (file.size > INTERNAL_DOCUMENT_MAX_BYTES) {
    return `"${file.name}" excede o limite de 50 MB.`;
  }
  return null;
}

export function sanitizeInternalFileName(name: string): string {
  return name.replace(/[^\w.-]+/g, "_").slice(0, 120) || "arquivo";
}
