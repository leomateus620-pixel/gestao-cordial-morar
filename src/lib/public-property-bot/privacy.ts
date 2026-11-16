import { decodeHTML } from "entities";
/** Best-effort minimization, not an assertion of perfect personal-data detection. No raw input is persisted. */
export function redactIncidentalData(input: string) {
  return input
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[contato removido]")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[documento removido]")
    .replace(/(?:\+?55\s*)?\(?\d{2}\)?\s*9?\d{4}[-\s]?\d{4}\b/g, "[contato removido]")
    .replace(/\b(?:me chamo|meu nome [ée])\s+[^,.!?\n]+/gi, "[nome removido]");
}
export function publicPlainText(value: string) {
  let text = value;
  for (let i = 0; i < 3; i++) text = decodeHTML(text);
  return redactIncidentalData(
    text
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/https?:\/\/\S+/gi, " ")
      .replace(/\s+/g, " ")
      .trim(),
  ).slice(0, 12000);
}
