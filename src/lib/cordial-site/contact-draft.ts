// Browser memory only: survives route error/retry without writing contact PII to disk.
import type { SiteBrand } from "./brand";
export function contactDraftKey(kind: string, propertyId?: string, brand: SiteBrand = "cordial") {
  return `${brand}:${kind}:${propertyId ?? "general"}`;
}
export type ContactDraft = {
  requestId: string;
  values: {
    name: string;
    phone: string;
    email: string;
    message: string;
    operation: string;
    propertyType: string;
    city: string;
    website: string;
    consent: boolean;
  };
};
export function initialContactValues(reference?: string): ContactDraft["values"] {
  return {
    name: "",
    phone: "",
    email: "",
    message: reference
      ? `Olá! Tenho interesse no imóvel ${reference}. Gostaria de receber mais informações.`
      : "",
    operation: "",
    propertyType: "",
    city: "",
    website: "",
    consent: false,
  };
}
const drafts = new Map<string, { draft: ContactDraft; expires: number }>();
export function readContactDraft(key: string): ContactDraft | undefined {
  if (typeof window === "undefined") return undefined;
  const entry = drafts.get(key);
  if (!entry || entry.expires < Date.now()) {
    drafts.delete(key);
    return undefined;
  }
  return entry.draft;
}
export function saveContactDraft(key: string, draft: ContactDraft) {
  if (typeof window !== "undefined") drafts.set(key, { draft, expires: Date.now() + 30 * 60_000 });
}
export function clearContactDraft(key: string) {
  drafts.delete(key);
}
