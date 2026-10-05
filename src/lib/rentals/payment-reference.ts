/** Calendar arithmetic for a recorded occurrence; never infer a missing due date. */
export function nextPaymentDueDate(dueDate: string | null, dueDay: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dueDate ?? "");
  if (!match || !Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
    throw new Error("Revise o vencimento da ocorrência antes de registrar a baixa.");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const original = new Date(Date.UTC(year, month - 1, day));
  if (original.toISOString().slice(0, 10) !== dueDate) {
    throw new Error("Revise o vencimento da ocorrência antes de registrar a baixa.");
  }
  const lastNextDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(dueDay, lastNextDay))).toISOString().slice(0, 10);
}

/** A baixa só conta como registrada quando gravou uma referência histórica nova. */
export function assertPaymentReferenceRecorded(previous: string | null, current: string | null): void {
  if (!current || current === previous) {
    throw new Error(
      "A baixa não registrou a referência histórica da ocorrência. Não repita a baixa; solicite suporte para conferir o contrato.",
    );
  }
}
