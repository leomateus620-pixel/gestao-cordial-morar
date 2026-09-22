/**
 * Importação incremental de mudanças feitas NO SITE, campo a campo e por
 * imobiliária, usando os três estados (confirmado / Gestão / site).
 *
 * Regras fixas:
 *  - só entra automaticamente o que mudou SOMENTE no site (`mudou_remoto`);
 *  - edição local pendente e limpeza intencional local NUNCA são desfeitas;
 *  - divergência (os dois lados mudaram) aplica o valor do site (decisão do
 *    usuário em 22/09/2026) e registra o caso em `property_field_conflicts`
 *    com o valor anterior do Gestão, para conferência;
 *  - a referência de comparação só avança nos campos realmente iguais;
 *  - eco do próprio envio nunca é tratado como edição externa;
 *  - proprietário, corretor, códigos, fotos, agenda e pontos fortes ficam fora.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { toPropertyRow, type NormalizedProperty } from "./import-normalizers";
import {
  buildTriStateReport,
  isOwnEcho,
  nextConfirmedSnapshot,
  type TriStateField,
  type TriStateReport,
} from "./tri-state";
import type { PayloadSnapshot } from "./payload-diff";
import type { ImobiProvider } from "./providers";

type Admin = SupabaseClient;

/** Nunca alterados pela importação — decisão de negócio, não técnica. */
export const IMPORT_PROTECTED_COLUMNS = [
  "codigo",
  "referencia",
  "pontos_fortes",
  "carteira",
  "valor_modo",
] as const;

export type PublicationState = {
  id: string;
  property_id: string;
  provider: ImobiProvider;
  confirmed_field_snapshot: PayloadSnapshot | null;
  echo_payload_hash: string | null;
  echo_expires_at: string | null;
};

export type RemoteChangePlan = {
  report: TriStateReport;
  /** Patch a aplicar em `properties` (colunas). */
  patch: Record<string, unknown>;
  /** Divergências a registrar. */
  conflicts: TriStateField[];
  /** Snapshot confirmado resultante + se ficou tudo confirmado. */
  confirmed: PayloadSnapshot;
  fullyConfirmed: boolean;
  /** Conteúdo remoto é eco do último envio do Gestão. */
  echo: boolean;
};

/**
 * Monta o plano SEM escrever nada — é a parte pura e testável da importação.
 */
export function planRemoteChanges(input: {
  publication: PublicationState;
  localRow: Record<string, unknown>;
  remote: NormalizedProperty;
  remoteHash: string;
  now?: Date;
}): RemoteChangePlan {
  const remoteRow = toPropertyRow(input.remote) as Record<string, unknown>;
  const managedKeys = Object.keys(remoteRow).filter(
    (key) => !(IMPORT_PROTECTED_COLUMNS as readonly string[]).includes(key),
  );

  const remoteSnapshot: PayloadSnapshot = {};
  const localSnapshot: PayloadSnapshot = {};
  for (const key of managedKeys) {
    // Valor remoto nulo = campo que a leitura não descreve. Ausência não é vazio:
    // fica fora do snapshot e por isso é classificado como "não verificável".
    if (remoteRow[key] !== null && remoteRow[key] !== undefined) remoteSnapshot[key] = remoteRow[key];
    if (key in input.localRow) localSnapshot[key] = input.localRow[key];
  }

  const echo = isOwnEcho(
    input.remoteHash,
    { hash: input.publication.echo_payload_hash, expiresAt: input.publication.echo_expires_at },
    input.now ?? new Date(),
  );

  const report = buildTriStateReport(
    input.publication.confirmed_field_snapshot,
    localSnapshot,
    remoteSnapshot,
  );

  const patch: Record<string, unknown> = {};
  if (!echo) {
    for (const field of report.importable) patch[field.field] = field.remote;
    // Divergência: o site prevalece, mas o caso fica registrado.
    for (const field of report.conflicts) patch[field.field] = field.remote;
  }

  const localAfter: PayloadSnapshot = { ...localSnapshot, ...patch };
  const { snapshot, fullyConfirmed } = nextConfirmedSnapshot(
    input.publication.confirmed_field_snapshot,
    localAfter,
    remoteSnapshot,
  );

  return {
    report,
    patch,
    conflicts: echo ? [] : report.conflicts,
    confirmed: snapshot,
    fullyConfirmed,
    echo,
  };
}

/**
 * Aplica o plano: patch no imóvel, divergências registradas e referência de
 * comparação atualizada apenas onde houve confirmação real.
 */
export async function applyRemoteChanges(
  admin: Admin,
  input: {
    publication: PublicationState;
    localRow: Record<string, unknown>;
    remote: NormalizedProperty;
    remoteHash: string;
    remoteObservedAt?: string;
  },
): Promise<RemoteChangePlan & { applied: string[] }> {
  const plan = planRemoteChanges(input);
  const now = input.remoteObservedAt ?? new Date().toISOString();
  const applied = Object.keys(plan.patch);

  if (applied.length) {
    const { error } = await admin
      .from("properties")
      .update(plan.patch)
      .eq("id", input.publication.property_id);
    if (error) throw new Error(error.message);
  }

  // O índice único só vale para divergências pendentes; resolvidas ficam como
  // histórico. Por isso: atualiza a pendente se existir, senão insere nova.
  for (const conflict of plan.conflicts) {
    const values = {
      publication_id: input.publication.id,
      confirmed_value: (conflict.confirmed ?? null) as never,
      local_value: (conflict.local ?? null) as never,
      remote_value: (conflict.remote ?? null) as never,
      applied_value: (conflict.remote ?? null) as never,
      classification: "conflito",
    };
    const { data: updated, error: updateError } = await admin
      .from("property_field_conflicts")
      .update(values)
      .eq("property_id", input.publication.property_id)
      .eq("provider", input.publication.provider)
      .eq("field", conflict.field)
      .eq("scope", "field")
      .eq("resolution", "pending")
      .select("id");
    if (updateError) throw new Error(updateError.message);
    if (updated?.length) continue;
    const { error: insertError } = await admin.from("property_field_conflicts").insert({
      ...values,
      property_id: input.publication.property_id,
      provider: input.publication.provider,
      field: conflict.field,
      scope: "field",
      resolution: "pending",
    });
    if (insertError) throw new Error(insertError.message);
  }

  await admin
    .from("property_provider_publications")
    .update({
      remote_field_snapshot: Object.fromEntries(
        plan.report.fields.map((field) => [field.field, field.remote ?? null]),
      ) as never,
      remote_snapshot_at: now,
      remote_observed_hash: input.remoteHash,
      // A referência só avança quando local e site ficaram realmente iguais.
      ...(plan.fullyConfirmed
        ? {
            confirmed_field_snapshot: plan.confirmed as never,
            last_published_hash: input.remoteHash,
            baseline_at: now,
          }
        : { confirmed_field_snapshot: plan.confirmed as never }),
      conflict_count: plan.conflicts.length,
      last_imported_at: now,
      last_verified_at: now,
      ...(plan.conflicts.length
        ? {
            last_error_category: "business",
            last_error_message: `Divergência em: ${plan.conflicts.map((c) => c.field).join(", ")}. O valor da imobiliária foi mantido e a diferença está registrada.`,
          }
        : {}),
    })
    .eq("id", input.publication.id);

  return { ...plan, applied };
}

/**
 * Marca o conteúdo que o Gestão acabou de publicar, para que a próxima leitura
 * reconheça o eco do próprio envio (evita ciclo importar → republicar).
 */
export async function markOwnEcho(
  admin: Admin,
  publicationId: string,
  remoteHash: string,
  ttlMinutes = 120,
) {
  await admin
    .from("property_provider_publications")
    .update({
      echo_payload_hash: remoteHash,
      echo_expires_at: new Date(Date.now() + ttlMinutes * 60_000).toISOString(),
    })
    .eq("id", publicationId);
}
