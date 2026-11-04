import { supabase } from "@/integrations/supabase/client";
import type { UploadDeps } from "./upload-document";

export const RENTAL_DOCS_BUCKET = "rental-documents";

export function rentalStorageDeps(register: (path: string) => Promise<unknown>): UploadDeps {
  const bucket = () => supabase.storage.from(RENTAL_DOCS_BUCKET);
  return {
    upload: async (path, file, contentType, signal) => {
      const { error } = await bucket().upload(path, file, {
        contentType,
        upsert: false,
        // supabase-js repassa opções extras ao fetch; o sinal limita a espera.
        ...({ signal } as object),
      });
      return { error: error ? { message: error.message, statusCode: (error as { statusCode?: string }).statusCode } : null };
    },
    exists: async (path) => {
      const slash = path.lastIndexOf("/");
      const { data, error } = await bucket().list(path.slice(0, slash), { search: path.slice(slash + 1), limit: 5 });
      if (error) return false;
      return (data ?? []).some((o) => o.name === path.slice(slash + 1));
    },
    register,
  };
}
