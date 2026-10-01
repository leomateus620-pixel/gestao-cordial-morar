/**
 * Regras puras do arquivamento (sem I/O), compartilhadas por servidor, tela e testes.
 * Espelham `property_retire_request` / `property_archive_finalize`.
 */

export type RetireLink = {
  provider: string;
  enabled: boolean;
  external_property_id: string | null;
  last_synced_at: string | null;
  create_state: string | null;
  status: string | null;
};

const LIVE_STATUSES = new Set(["pending", "syncing", "partial", "out_of_sync", "published", "error"]);

/** Destinos que precisam de retirada confirmada antes de arquivar. */
export function retirementTargets(links: RetireLink[]): string[] {
  return links
    .filter((l) =>
      l.enabled || l.external_property_id || l.last_synced_at ||
      l.create_state === "awaiting_create_reconcile" ||
      (l.status !== null && LIVE_STATUSES.has(l.status)))
    .map((l) => l.provider)
    .sort();
}

export type ArchiveLink = {
  provider: string;
  status: string | null;
  desired_availability: string | null;
  publication_intent_revision: number | null;
  archive_intent_revision: number | null;
  last_error_message?: string | null;
};

/** Um destino só está retirado com confirmação da intenção vigente — `enabled=false` não basta. */
export function isDestinationConfirmed(link: ArchiveLink): boolean {
  return link.archive_intent_revision !== null &&
    link.status === "unpublished" &&
    link.desired_availability === "hidden" &&
    Number(link.publication_intent_revision ?? 0) >= link.archive_intent_revision;
}

/** Destinos ainda sem confirmação. Lista vazia = pode concluir o arquivamento. */
export function pendingArchiveDestinations(links: ArchiveLink[]): string[] {
  return links
    .filter((l) => l.archive_intent_revision !== null && !isDestinationConfirmed(l))
    .map((l) => l.provider)
    .sort();
}

export function archiveDestinations(links: ArchiveLink[]) {
  return links
    .filter((l) => l.archive_intent_revision !== null)
    .map((l) => ({
      provider: l.provider,
      state: isDestinationConfirmed(l)
        ? ("retirado" as const)
        : l.status === "error"
          ? ("falhou" as const)
          : ("pendente" as const),
      message: isDestinationConfirmed(l) ? null : (l.last_error_message ?? null),
    }))
    .sort((a, b) => a.provider.localeCompare(b.provider));
}
