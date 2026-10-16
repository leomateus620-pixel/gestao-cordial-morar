/** Short lived browser-only handoff; never put a private draft in the URL. */
export function saveAssistantDraft(userId: string, botId: string, text: string) {
  try {
    sessionStorage.setItem(
      `cordial:assistant:draft:${userId}:${botId}`,
      JSON.stringify({ text: text.slice(0, 4000), expires: Date.now() + 5 * 60_000 }),
    );
  } catch {}
}
export function takeAssistantDraft(userId: string, botId: string): string | undefined {
  try {
    const key = `cordial:assistant:draft:${userId}:${botId}`;
    const raw = sessionStorage.getItem(key);
    sessionStorage.removeItem(key);
    if (!raw) return;
    const value: unknown = JSON.parse(raw);
    if (
      value &&
      typeof value === "object" &&
      "expires" in value &&
      typeof value.expires === "number" &&
      value.expires > Date.now() &&
      "text" in value &&
      typeof value.text === "string"
    )
      return value.text.slice(0, 4000);
  } catch {}
}
