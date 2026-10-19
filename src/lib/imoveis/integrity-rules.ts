// Regras puras do incidente 1409/3408 (códigos, envio, finalidade, Drive).
// Sem acesso ao banco: os chamadores leem os dados e aplicam estas decisões.

export type ReservationRow = {
  id: string;
  status: string;
  property_id: string | null;
  reserved_by: string | null;
  code?: string | null;
};

/** Reserva só é confirmada para o próprio imóvel (ou livre e do mesmo usuário). */
export function reservationCommitError(
  r: ReservationRow,
  propertyId: string,
  userId: string,
): string | null {
  if (r.property_id && r.property_id !== propertyId) {
    return `O código ${r.code ?? ""} já pertence a outro imóvel (${r.property_id.slice(0, 8)}).`.replace("  ", " ");
  }
  if (r.status === "committed") {
    return r.property_id === propertyId ? null : `O código ${r.code ?? ""} já foi usado.`;
  }
  if (r.status !== "reserved") return `A reserva do código ${r.code ?? ""} não está mais ativa.`;
  if (!r.property_id && r.reserved_by !== userId) {
    return `A reserva do código ${r.code ?? ""} pertence a outro usuário.`;
  }
  return null;
}

export function normalizeCode(v: string | null | undefined): string {
  return (v ?? "").trim().toLowerCase();
}

/** Código digitado já usado por outro imóvel ou reserva ativa de outro imóvel. */
export function manualCodeConflict(args: {
  code: string | null | undefined;
  propertyId: string | null;
  otherPropertyIds: string[];
  reservations: Array<Pick<ReservationRow, "status" | "property_id">>;
}): string | null {
  if (!normalizeCode(args.code)) return null;
  const other = args.otherPropertyIds.find((id) => id !== args.propertyId);
  if (other) return other;
  const res = args.reservations.find(
    (r) =>
      (r.status === "reserved" || r.status === "committed") &&
      r.property_id &&
      r.property_id !== args.propertyId,
  );
  return res?.property_id ?? null;
}

/** Violação de unicidade / conflito de referência: nunca adianta repetir. */
export function isUniquenessConflict(err: unknown): boolean {
  const text =
    err && typeof err === "object"
      ? `${(err as { code?: unknown }).code ?? ""} ${(err as { message?: unknown }).message ?? ""}`
      : String(err ?? "");
  return /23505|duplicate key|unique constraint|ppp_provider_external_id_idx|referência já (em uso|utilizada)/i.test(
    text,
  );
}

export type Operacao = "venda" | "aluguel" | "venda_aluguel" | string | null | undefined;

/** Finalidade do agenciamento compatível com a operação do imóvel. */
export function purposeMatchesOperation(operacao: Operacao, finalidade: string): boolean {
  if (!operacao) return true;
  const op = String(operacao).toLowerCase();
  if (op.includes("venda") && op.includes("alug")) return true;
  if (op.includes("alug") || op.includes("loca")) return finalidade === "aluguel";
  if (op.includes("venda")) return finalidade === "venda";
  return true;
}

export function defaultPurposeFor(operacao: Operacao): "venda" | "aluguel" {
  const op = String(operacao ?? "").toLowerCase();
  return op.includes("alug") && !op.includes("venda") ? "aluguel" : "venda";
}

/** Pasta encontrada pelo nome só é adotada se não pertencer a outro imóvel. */
export function canAdoptDriveFolder(args: {
  propertyId: string;
  registeredTo: string[];
  appPropertyId: string | null | undefined;
}): boolean {
  if (args.registeredTo.some((id) => id !== args.propertyId)) return false;
  if (args.appPropertyId && args.appPropertyId !== args.propertyId) return false;
  return true;
}

/**
 * Identidade de uma pasta já registrada: o nome nunca basta. Retorna o motivo
 * quando a pasta (ou subpasta) não pode receber arquivos deste imóvel.
 */
export function driveFolderIdentityProblem(args: {
  propertyId: string;
  registeredTo: string[];
  appPropertyId: string | null | undefined;
  expectedParentId?: string | null;
  parents?: string[] | null;
}): "shared_folder" | "foreign_mark" | "wrong_parent" | null {
  if (args.registeredTo.some((id) => id !== args.propertyId)) return "shared_folder";
  if (args.appPropertyId && args.appPropertyId !== args.propertyId) return "foreign_mark";
  if (args.expectedParentId && args.parents && !args.parents.includes(args.expectedParentId)) {
    return "wrong_parent";
  }
  return null;
}

/** Decisão do worker ao fim de um lote: pendência esgotada nunca é sucesso. */
export function driveJobOutcome(args: {
  stillPending: boolean;
  hasMore: boolean;
  attempts: number;
  maxAttempts: number;
}): "succeeded" | "continue" | "retry" | "failed" {
  if (!args.stillPending) return "succeeded";
  if (args.hasMore) return "continue";
  return args.attempts < args.maxAttempts ? "retry" : "failed";
}

/** Job "ativo" com lease vencido não bloqueia uma nova execução. */
export function isStaleDriveJob(
  job: { status: string; lease_expires_at: string | null },
  now = Date.now(),
): boolean {
  return (
    job.status === "processing" &&
    (!job.lease_expires_at || new Date(job.lease_expires_at).getTime() < now)
  );
}
