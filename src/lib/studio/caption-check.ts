/**
 * Checagem pura de legendas/textos gerados antes de permitir aprovação.
 * Reprova endereço exato, documentos/contatos pessoais e promessas não
 * verificáveis. Não acessa rede nem modelo — só regex/heurística local.
 */

export type CaptionIssue =
  | "endereco_exato"
  | "cpf"
  | "telefone"
  | "email"
  | "promessa_nao_verificavel";

export type CaptionCheckResult = { ok: boolean; issues: CaptionIssue[] };

const CPF_RE = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/;
const PHONE_RE = /(?:\+?55\s*)?\(?\d{2}\)?\s*9?\d{4}[-\s]?\d{4}\b/;
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
// Rua/Av + número — indício de endereço exato (bairro/cidade isolados não disparam).
const ADDRESS_RE = /\b(rua|av\.?|avenida|alameda|travessa|rodovia|estrada)\b[^\n,.;]{0,40}\b(n[º°o]?\.?\s*)?\d{1,5}\b/i;

const PROMISE_WORDS = [
  "garantido",
  "garantia de valorização",
  "melhor investimento",
  "sem concorrência",
  "único no mercado",
  "retorno garantido",
  "lucro garantido",
  "valorização garantida",
  "100% de retorno",
];

export function checkCaption(text: string): CaptionCheckResult {
  const issues: CaptionIssue[] = [];
  const lower = text.toLowerCase();
  if (ADDRESS_RE.test(text)) issues.push("endereco_exato");
  if (CPF_RE.test(text)) issues.push("cpf");
  if (PHONE_RE.test(text)) issues.push("telefone");
  if (EMAIL_RE.test(text)) issues.push("email");
  if (PROMISE_WORDS.some((w) => lower.includes(w))) issues.push("promessa_nao_verificavel");
  return { ok: issues.length === 0, issues };
}

export const CAPTION_ISSUE_LABEL: Record<CaptionIssue, string> = {
  endereco_exato: "Endereço exato não pode aparecer no texto (só bairro/cidade).",
  cpf: "CPF não pode aparecer no texto.",
  telefone: "Telefone não pode aparecer no texto.",
  email: "E-mail não pode aparecer no texto.",
  promessa_nao_verificavel: "Promessa não verificável (ex.: retorno/garantia) não é permitida.",
};
