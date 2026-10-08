/**
 * Regras puras da recuperação de fotos travadas (sem rede nem banco).
 *
 *  - checkpoint da reconstrução só é apagado quando ela termina ou é abandonada;
 *  - fotos órfãs de uma reconstrução perdida só voltam ao envio comum com
 *    leitura confiável e nenhuma foto sem vínculo no site;
 *  - várias entregas incertas só são resolvidas com evidência consistente;
 *  - rodadas sem progresso param de girar a cada 2 min e pedem atenção.
 */
import { planGalleryRebuild, type RebuildRemoteItem } from "./gallery-rebuild";

/** `undefined` = a rodada não sabe o estado atual: não toca no campo. */
export function rebuildStateFields(checkpoint: unknown): Record<string, unknown> {
  return checkpoint === undefined ? {} : { media_rebuild_state: checkpoint };
}

export function isActiveRebuildCheckpoint(value: unknown): boolean {
  const cp = value as { deleteRemoteIds?: unknown; reinsertImageIds?: unknown } | null;
  return Boolean(cp && Array.isArray(cp.deleteRemoteIds) && Array.isArray(cp.reinsertImageIds));
}

export function isCleanRebuildRequest(value: unknown): boolean {
  return (value as { state?: unknown } | null)?.state === "clean_rebuild_requested";
}

export type OrphanRecovery =
  | { action: "send"; imageIds: string[] }
  | { action: "hold"; reason: "leitura_inconclusiva" | "fotos_sem_vinculo_no_site" | "nenhuma" };

/**
 * Linhas `rebuild_delete + pending` sem checkpoint válido. Foram apagadas do
 * site com confirmação, mas a reconstrução perdeu o ponto de retomada. Só
 * voltam ao envio comum quando a galeria REAL foi lida com confiança e não há
 * nenhuma foto no site sem vínculo (que poderia ser uma delas).
 */
export function classifyOrphanedRebuild(params: {
  orphanImageIds: readonly string[];
  galleryReliable: boolean;
  remoteCodes: readonly (string | null)[];
  linkedCodes: ReadonlySet<string>;
}): OrphanRecovery {
  if (!params.orphanImageIds.length) return { action: "hold", reason: "nenhuma" };
  if (!params.galleryReliable) return { action: "hold", reason: "leitura_inconclusiva" };
  const unlinked = params.remoteCodes.filter((code) => !code || !params.linkedCodes.has(code));
  if (unlinked.length > 0) return { action: "hold", reason: "fotos_sem_vinculo_no_site" };
  return { action: "send", imageIds: [...params.orphanImageIds] };
}

export type UnknownDelivery = { imageId: string; at: string | null; beforeCodes: string[] | null };

/**
 * Várias entregas incertas: casa cada foto com um código novo do site somente
 * quando a evidência é consistente. Os códigos do site crescem na ordem de
 * inserção; o i-ésimo envio (pela hora da intenção) recebe o i-ésimo código
 * órfão, que não pode estar no "antes" dele e precisa estar no "antes" de todo
 * envio posterior. Qualquer dúvida = nada é vinculado.
 */
export function resolveUnknownDeliveries(params: {
  unknowns: readonly UnknownDelivery[];
  orphanCodes: readonly string[];
}): Array<{ imageId: string; code: string }> | null {
  const unknowns = [...params.unknowns];
  const orphans = [...params.orphanCodes];
  if (unknowns.length < 2 || unknowns.length !== orphans.length) return null;
  if (unknowns.some((row) => !row.at || !row.beforeCodes)) return null;
  if (orphans.some((code) => !/^\d+$/.test(code))) return null;
  unknowns.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  if (new Set(unknowns.map((row) => row.at)).size !== unknowns.length) return null;
  orphans.sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0));
  for (let i = 0; i < unknowns.length; i += 1) {
    const code = orphans[i]!;
    if (unknowns[i]!.beforeCodes!.includes(code)) return null;
    for (let j = i + 1; j < unknowns.length; j += 1) {
      if (!unknowns[j]!.beforeCodes!.includes(code)) return null;
    }
  }
  return unknowns.map((row, i) => ({ imageId: row.imageId, code: orphans[i]! }));
}

export const NO_PROGRESS_LIMIT = 5;

export function noProgressDecision(params: {
  priorRuns: number;
  progressed: boolean;
  terminal: boolean;
}): { runs: number; needsAttention: boolean } {
  if (params.terminal || params.progressed) return { runs: 0, needsAttention: false };
  const runs = Math.max(0, params.priorRuns) + 1;
  return { runs, needsAttention: runs >= NO_PROGRESS_LIMIT };
}

/** 2 min nas primeiras rodadas; depois 10 → 30 → 120 min → 6 h. */
export function noProgressDelaySeconds(runs: number): number {
  if (runs < NO_PROGRESS_LIMIT) return 120;
  const steps = [600, 1800, 7200];
  return steps[runs - NO_PROGRESS_LIMIT] ?? 21_600;
}

export const MEDIA_READ_HEADROOM = 3;

export function hasMediaReadHeadroom(usedLastMinute: number, limit = 18, needed = MEDIA_READ_HEADROOM): boolean {
  return limit - usedLastMinute >= needed;
}

export const ATTENTION_MESSAGES: Record<string, string> = {
  fotos_sem_vinculo_no_site: "Há fotos no site que não estão ligadas ao Gestão. Use \"Reconstruir galeria\" para limpar e reenviar na ordem certa.",
  delivery_unknown: "O site não confirmou o envio de algumas fotos. Use \"Reconstruir galeria\" para reenviar sem cópias.",
  leitura_inconclusiva: "O site não respondeu a conferência das fotos várias vezes seguidas. Tente \"Reenviar fotos\" mais tarde.",
  sem_progresso: "O envio das fotos parou de avançar. Use \"Reenviar fotos\".",
};

export function attentionMessage(reason: string | null | undefined): string {
  return ATTENTION_MESSAGES[reason ?? ""] ?? ATTENTION_MESSAGES.sem_progresso!;
}

export type CleanRebuildPlan =
  | { feasible: true; deleteRemoteIds: string[]; reinsertImageIds: string[]; keptPrefix: number }
  | { feasible: false; reason: string };

/**
 * Reconstrução limpa (só manual, admin): apaga as fotos do site sem vínculo e
 * as fora de ordem, e reinsere a partir do Gestão. A capa volta a ser a
 * primeira foto do Gestão (prefixo mantido só se a capa já estiver certa).
 */
export function planCleanRebuild(params: {
  desiredImageIds: readonly string[];
  remote: readonly RebuildRemoteItem[];
}): CleanRebuildPlan {
  if (!params.desiredImageIds.length) return { feasible: false, reason: "sem_fotos_no_gestao" };
  if (params.remote.some((item) => !item.codigoImagem)) return { feasible: false, reason: "codigo_remoto_desconhecido" };
  const desired = new Set(params.desiredImageIds);
  const unlinked = params.remote.filter((item) => !item.imageId || !desired.has(item.imageId));
  const linked = params.remote.filter((item) => item.imageId && desired.has(item.imageId));
  // Vínculo repetido (mesma foto 2x) também é cópia: tudo do ponto em diante sai.
  const seen = new Set<string>();
  const duplicated = linked.some((item) => (seen.has(item.imageId!) ? true : (seen.add(item.imageId!), false)));
  const plan = duplicated
    ? { keptPrefix: 0, deleteRemoteIds: linked.map((i) => i.codigoImagem as string) }
    : planGalleryRebuild({ desiredImageIds: params.desiredImageIds, remote: linked });
  const keptPrefix = plan.keptPrefix;
  if (!duplicated && "feasible" in plan && !plan.feasible) return { feasible: false, reason: plan.reason ?? "inviavel" };
  const linkedDeletes = duplicated
    ? plan.deleteRemoteIds
    : linked.slice(keptPrefix).map((item) => item.codigoImagem as string);
  return {
    feasible: true,
    deleteRemoteIds: [...unlinked.map((item) => item.codigoImagem as string), ...linkedDeletes],
    reinsertImageIds: params.desiredImageIds.slice(keptPrefix),
    keptPrefix,
  };
}
