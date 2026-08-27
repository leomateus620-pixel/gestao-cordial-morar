import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  controlPropertyImport,
  getImportOverview,
  listImportConflicts,
  removeProperty,
  resolveImportConflict,
  startPropertyImport,
  type ConflictResolution,
  type ImportMode,
} from "@/lib/imoveis/import.functions";

const ACTIVE = new Set(["queued", "running"]);

export function useImportOverview(enabled = true) {
  const overview = useServerFn(getImportOverview);
  return useQuery({
    queryKey: ["property-import-overview"],
    queryFn: () => overview(),
    enabled,
    // Enquanto houver importação ativa, acompanha o progresso quase em tempo real.
    refetchInterval: (query) => {
      const runs = query.state.data?.runs ?? [];
      return runs.some((run) => ACTIVE.has(run.status) || run.pendingJobs > 0) ? 5_000 : false;
    },
  });
}

export function useImportConflicts(runId?: string | null, enabled = true) {
  const list = useServerFn(listImportConflicts);
  return useQuery({
    queryKey: ["property-import-conflicts", runId ?? null],
    queryFn: () => list({ data: { runId: runId ?? null } }),
    enabled,
    staleTime: 30_000,
  });
}

export function useStartPropertyImport() {
  const qc = useQueryClient();
  const start = useServerFn(startPropertyImport);
  return useMutation({
    mutationFn: (input: { providers: string[]; mode: ImportMode }) => start({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["property-import-overview"] }),
  });
}

export function useControlPropertyImport() {
  const qc = useQueryClient();
  const control = useServerFn(controlPropertyImport);
  return useMutation({
    mutationFn: (input: { runId: string; action: "pause" | "resume" | "cancel" | "retry_errors" }) =>
      control({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["property-import-overview"] }),
  });
}

export function useResolveImportConflict() {
  const qc = useQueryClient();
  const resolve = useServerFn(resolveImportConflict);
  return useMutation({
    mutationFn: (input: { candidateId: string; resolution: ConflictResolution }) => resolve({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["property-import-conflicts"] });
      qc.invalidateQueries({ queryKey: ["property-import-overview"] });
      qc.invalidateQueries({ queryKey: ["imoveis"] });
    },
  });
}

export function useRemoveProperty() {
  const qc = useQueryClient();
  const remove = useServerFn(removeProperty);
  return useMutation({
    mutationFn: (input: { propertyId: string; providers: string[]; reason?: string | null }) =>
      remove({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["imoveis"] });
      qc.invalidateQueries({ queryKey: ["property-sync"] });
    },
  });
}
