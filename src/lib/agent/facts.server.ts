/**
 * Pure normalization helpers for assistant "facts" (short, server-written
 * working-memory notes tied to a user). No I/O here; see facts.functions.ts
 * for the server functions that call Supabase.
 */
import { maskText } from "./masking";

export const FACT_TEXT_MAX_LENGTH = 280;

/** `tipo`/texto values that would describe the record owner are rejected: facts
 * are meant for the assistant's working memory about the user's own session,
 * not for storing property-owner data. */
const OWNER_PATTERN = /propriet[aá]ri[ao]s?/i;

export class InvalidFactError extends Error {}

export type NormalizedFact = {
  tipo: string;
  refId: string | null;
  texto: string;
  expiresAt: string | null;
};

export type RawFactInput = {
  tipo: string;
  refId?: string | null;
  texto: string;
  expiresAt?: string | null;
};

function assertNotOwnerRelated(value: string, field: string) {
  if (OWNER_PATTERN.test(value)) {
    throw new InvalidFactError(
      `Não é permitido registrar fatos sobre proprietário no campo "${field}".`,
    );
  }
}

/** Trims, masks personal data out of free text, caps length, and rejects
 * anything that looks like it is about a property owner. */
export function normalizeFact(input: RawFactInput): NormalizedFact {
  const tipo = input.tipo.trim();
  if (!tipo) throw new InvalidFactError("O tipo do fato é obrigatório.");
  assertNotOwnerRelated(tipo, "tipo");

  const rawTexto = input.texto.trim();
  if (!rawTexto) throw new InvalidFactError("O texto do fato é obrigatório.");
  assertNotOwnerRelated(rawTexto, "texto");

  const masked = maskText(rawTexto);
  const texto =
    masked.length > FACT_TEXT_MAX_LENGTH ? masked.slice(0, FACT_TEXT_MAX_LENGTH) : masked;

  const refId = input.refId?.trim() || null;

  let expiresAt: string | null = null;
  if (input.expiresAt) {
    const parsed = new Date(input.expiresAt);
    if (Number.isNaN(parsed.getTime())) {
      throw new InvalidFactError("Data de expiração inválida.");
    }
    expiresAt = parsed.toISOString();
  }

  return { tipo, refId, texto, expiresAt };
}
