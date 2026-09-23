/**
 * Importação incremental de mudanças feitas NO SITE, campo a campo e por
 * imobiliária, usando os três estados (confirmado / Gestão / site).
 *
 * Regras fixas:
 *  - só entra automaticamente o que mudou SOMENTE no site (`mudou_remoto`);
 *  - edição local pendente e limpeza intencional local NUNCA são desfeitas;
 *  - divergência (os dois lados mudaram) preserva o Gestão e registra os três
 *    valores para decisão administrativa;
 *  - divergência ENTRE contas (Cordial e Morar mudaram o mesmo campo de jeitos
 *    diferentes) mantém o valor do Gestão e registra o caso (scope
 *    "cross_account"); a ordem das importações não decide;
 *  - a gravação no imóvel exige a revisão lida: edição salva durante a
 *    importação nunca é sobrescrita;
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
import { sameValue, type PayloadSnapshot } from "./payload-diff";
import { findCrossAccountConflicts } from "./cross-account";
import type { ImobiProvider } from "./providers";

type Admin = SupabaseClient;

/** Nunca alterados pela importação — decisão de negócio, não técnica. */
export const IMPORT_PROTECTED_COLUMNS = [
  "codigo",
  "referencia",
  "pontos_fortes",
  "carteira",
  "valor_modo",
  "exibir_imovel",
  "observacao_imovel",
  "localizacao_exibida",
] as const;

export type PublicationState = {
  id: string;
  property_id: string;
  provider: ImobiProvider;
  external_property_id?: string | null;
  updated_at?: string;
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
  const withoutBaseline = !input.publication.confirmed_field_snapshot ||
    Object.keys(input.publication.confirmed_field_snapshot).length === 0;
  if (!echo) {
    // Sem base confirmada não sabemos se o vazio local é intencional. Uma
    // leitura inicial não autoriza sobrescrever o Gestão.
    if (!withoutBaseline) {
      for (const field of report.importable) patch[field.field] = field.remote;
    }
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
    conflicts: echo
      ? []
      : withoutBaseline
        ? report.fields.filter((field) => field.remote !== null && field.remote !== undefined && !sameValue(field.local, field.remote, field.field))
        : report.conflicts,
    confirmed: snapshot,
    fullyConfirmed: fullyConfirmed && report.unverifiable.length === 0 && !withoutBaseline && report.conflicts.length === 0,
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
    /**
     * Leitura ATUAL da outra conta (Cordial x Morar). A comparação usa o que
     * está no site agora — não a última importação — para que a ordem das
     * importações nunca decida o valor. Nulo = leitura indisponível.
     */
    observeOther?: (provider: string, externalId: string) => Promise<PayloadSnapshot | null>;
  },
): Promise<RemoteChangePlan & { applied: string[] }> {
  const plan = planRemoteChanges(input);
  const now = input.remoteObservedAt ?? new Date().toISOString();

  // Outra conta do mesmo imóvel: divergência entre Cordial e Morar.
  const { data: others, error: othersError } = await admin
    .from("property_provider_publications")
    .select("id, provider, external_property_id, remote_field_snapshot, confirmed_field_snapshot, updated_at")
    .eq("property_id", input.publication.property_id)
    .neq("provider", input.publication.provider);
  if (othersError) throw new Error(othersError.message);
  const other = (others ?? [])[0] as
    | {
      provider: string;
      id: string;
      external_property_id: string | null;
      remote_field_snapshot: PayloadSnapshot | null;
      confirmed_field_snapshot: PayloadSnapshot | null;
      updated_at: string;
      }
    | undefined;
  let otherLive: PayloadSnapshot | null = null;
  let otherLiveFailed = false;
  if (other?.external_property_id && input.observeOther && !plan.echo && Object.keys(plan.patch).length) {
    try {
      otherLive = await input.observeOther(other.provider, other.external_property_id);
      if (!otherLive) otherLiveFailed = true;
    } catch {
      otherLiveFailed = true;
    }
  }
  const thisRemote: PayloadSnapshot = Object.fromEntries(
    plan.report.fields
      .filter((f) => f.remote !== undefined && f.remote !== null)
      .map((f) => [f.field, f.remote]),
  );
  const cross = plan.echo
    ? []
    : findCrossAccountConflicts({
        fields: [...new Set([...Object.keys(plan.patch), ...plan.conflicts.map((field) => field.field)])],
        thisConfirmed: input.publication.confirmed_field_snapshot,
        thisRemote,
        otherRemote: otherLiveFailed ? null : otherLive ?? other?.remote_field_snapshot ?? null,
        otherConfirmed: other?.confirmed_field_snapshot ?? null,
        local: input.localRow as PayloadSnapshot,
      });
  // Outra conta não pôde ser lida agora: campos compartilhados que diferem do
  // último valor visto nela ficam para a próxima rodada (nada é aplicado às cegas).
  const otherUnverified: string[] = [];
  if (otherLiveFailed && other?.external_property_id) {
    for (const field of Object.keys(plan.patch)) {
      otherUnverified.push(field);
      delete plan.patch[field];
      const previous = input.publication.confirmed_field_snapshot?.[field];
      if (previous === undefined) delete plan.confirmed[field];
      else plan.confirmed[field] = previous;
      plan.fullyConfirmed = false;
    }
  }
  const crossFields = new Set(cross.map((c) => c.field));
  for (const field of crossFields) {
    delete plan.patch[field];
    // Sem confirmação: a referência deste campo continua a anterior.
    const previous = input.publication.confirmed_field_snapshot?.[field];
    if (previous === undefined) delete plan.confirmed[field];
    else plan.confirmed[field] = previous;
    plan.fullyConfirmed = false;
  }
  // Campo em divergência entre contas não entra também como divergência simples.
  plan.conflicts = plan.conflicts.filter((c) => !crossFields.has(c.field));
  const applied = Object.keys(plan.patch);

  const records = [
    ...plan.conflicts.map((conflict) => ({
      field: conflict.field,
      scope: "field",
      classification: "conflito",
      confirmed: conflict.confirmed ?? null,
      local: conflict.local ?? null,
      remote: conflict.remote ?? null,
      applied: conflict.local ?? null,
    })),
    ...cross.map((c) => ({
      field: c.field,
      scope: "cross_account",
      classification: "conflito_entre_contas",
      confirmed: input.publication.confirmed_field_snapshot?.[c.field] ?? null,
      local: c.local ?? null,
      remote: { [input.publication.provider]: c.thisRemote, [other?.provider ?? "outra"]: c.otherRemote },
      applied: c.local ?? null,
    })),
  ];

  // Tudo numa só transação no banco: imóvel (com revisão +1), divergências e
  // publicação. Se o imóvel mudou no Gestão durante a leitura, nada é gravado.
  const expectedRevision = input.localRow["revision"];
  const publicationFields = {
      remote_field_snapshot: thisRemote as never,
      remote_snapshot_at: now,
      remote_observed_hash: input.remoteHash,
      remote_read_state: "lido",
      // A referência só avança quando local e site ficaram realmente iguais.
      ...(plan.fullyConfirmed
        ? {
            confirmed_field_snapshot: plan.confirmed as never,
            last_published_hash: input.remoteHash,
            baseline_at: now,
          }
        : { confirmed_field_snapshot: plan.confirmed as never }),
      last_imported_at: now,
      last_verified_at: now,
      ...(cross.length
        ? {
            last_error_category: "business",
            last_error_message: `Cordial e Morar mudaram de jeitos diferentes: ${cross.map((c) => c.field).join(", ")}. O valor do Gestão foi mantido e a diferença está registrada.`,
          }
        : otherUnverified.length
        ? {
            last_error_category: "read_inconclusive",
            last_error_message: `A outra conta não pôde ser conferida; importação dos campos ${otherUnverified.join(", ")} aguarda nova leitura.`,
          }
        : plan.conflicts.length
        ? {
            last_error_category: "business",
            last_error_message: `Divergência em: ${plan.conflicts.map((c) => c.field).join(", ")}. O valor do Gestão foi mantido para decisão administrativa.`,
          }
        : {}),
  };
  if (!Number.isInteger(expectedRevision)) throw new Error("revision_unavailable: a importação exige revisão local conhecida.");
  if (!input.publication.external_property_id || !input.publication.updated_at) {
    throw new Error("publication_guard_unavailable: vínculo remoto sem identidade ou versão.");
  }
  Object.assign(publicationFields, {
    __guard: {
      provider: input.publication.provider,
      external_property_id: input.publication.external_property_id,
      publication_updated_at: input.publication.updated_at,
      other_publication_id: other?.id ?? null,
      other_publication_updated_at: other?.updated_at ?? null,
    },
  });
  const { error: mergeError } = await admin.rpc("property_remote_merge" as never, {
    _property_id: input.publication.property_id,
    _expected_revision: typeof expectedRevision === "number" ? expectedRevision : null,
    _patch: plan.patch,
    _publication_id: input.publication.id,
    _publication_fields: publicationFields,
    _conflicts: records.map((record) => ({
      provider: input.publication.provider,
      field: record.field,
      scope: record.scope,
      classification: record.classification,
      confirmed_value: record.confirmed,
      local_value: record.local,
      remote_value: record.remote,
      applied_value: record.applied,
    })),
  } as never);
  if (mergeError) {
    if (/revision_changed/.test(mergeError.message)) {
      throw new Error("revision_changed: o imóvel foi alterado no Gestão durante a importação; será relido.");
    }
    throw new Error(mergeError.message);
  }

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
  const { error } = await admin
    .from("property_provider_publications")
    .update({
      echo_payload_hash: remoteHash,
      echo_expires_at: new Date(Date.now() + ttlMinutes * 60_000).toISOString(),
    })
    .eq("id", publicationId);
  if (error) throw new Error(error.message);
}
