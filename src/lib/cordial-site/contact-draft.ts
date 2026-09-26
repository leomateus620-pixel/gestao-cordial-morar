// Browser memory only: survives route error/retry without writing contact PII to disk.
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
