export type WorkflowAction = "conferir" | "anexar" | "gerar" | "salvar";

const FALLBACK: Record<WorkflowAction, string> = {
  conferir: "Não foi possível conferir o contrato.",
  anexar: "Não foi possível anexar o contrato.",
  gerar: "Não foi possível gerar o contrato.",
  salvar: "Não foi possível salvar o rascunho.",
};

/** Mensagens técnicas (banco, rede, JS) que nunca devem aparecer para o usuário. */
const TECHNICAL =
  /populate_composite|scalar|violates|constraint|null value in column|not-null|syntax error|relation .* does not exist|function .* does not exist|permission denied|duplicate key|invalid input|jsonb|uuid|PGRST|SQLSTATE|Failed to fetch|NetworkError|fetch failed|Load failed|timeout|undefined|TypeError|Unexpected token|\b[0-9A-Z]{5}\b:/i;

export function friendlyWorkflowError(cause: unknown, action: WorkflowAction): string {
  const raw = cause instanceof Error ? cause.message : typeof cause === "string" ? cause : "";
  const message = raw.trim();
  const ownPortuguese =
    message.length > 0 &&
    message.length <= 160 &&
    /[ãçéêíóõúâ]|\b(não|Informe|Salve|Gere|Confirme|Rascunho|Aluguel|Imóvel|Fiador|Locatário|Arquivo|Documento|contrato)\b/i.test(
      message,
    ) &&
    !TECHNICAL.test(message);
  if (ownPortuguese) return message;
  if (message && typeof console !== "undefined") console.error(`[aluguel:${action}]`, cause);
  return `${FALLBACK[action]} Tente novamente; se persistir, avise o suporte.`;
}
