import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useImportConflicts, useResolveImportConflict } from "@/hooks/usePropertyImport";
import type { ConflictResolution } from "@/lib/imoveis/import.functions";

const FIELDS: Array<{ key: string; label: string; localKey: string }> = [
  { key: "tipo", label: "Tipo", localKey: "tipo" },
  { key: "operacao", label: "Operação", localKey: "operacao" },
  { key: "cidade", label: "Cidade", localKey: "cidade" },
  { key: "bairro", label: "Bairro", localKey: "bairro" },
  { key: "valor", label: "Valor", localKey: "valor" },
  { key: "areaPrincipal", label: "Área", localKey: "area_principal" },
  { key: "dormitorios", label: "Dormitórios", localKey: "dormitorios" },
  { key: "codigo", label: "Código", localKey: "codigo" },
];

function show(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

export function ImportConflictsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const conflicts = useImportConflicts(null, open);
  const resolve = useResolveImportConflict();

  const apply = async (candidateId: string, resolution: ConflictResolution) => {
    try {
      await resolve.mutateAsync({ candidateId, resolution });
      toast.success("Conflito resolvido.");
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Conflitos de importação</DialogTitle>
          <DialogDescription>
            Compare o cadastro atual com o que veio do site. Nada é alterado sem a sua decisão.
          </DialogDescription>
        </DialogHeader>

        {conflicts.isPending && <p className="text-sm text-foreground/50">Carregando…</p>}
        {!conflicts.isPending && (conflicts.data?.length ?? 0) === 0 && (
          <p className="text-sm text-foreground/50">Nenhum conflito aguardando decisão.</p>
        )}

        <div className="space-y-4">
          {(conflicts.data ?? []).map((conflict) => (
            <div key={conflict.id} className="rounded-2xl border border-foreground/10 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">
                  {conflict.provider === "cordial" ? "Cordial" : "Morar"} · código {conflict.externalPropertyId}
                </p>
                <span className="rounded-full bg-amber-500/12 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                  {conflict.matchReason ?? "Requer revisão"}
                </span>
              </div>

              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-left text-foreground/45">
                      <th className="py-1 pr-2 font-medium">Campo</th>
                      <th className="py-1 pr-2 font-medium">Cadastro atual</th>
                      <th className="py-1 font-medium">Vindo do site</th>
                    </tr>
                  </thead>
                  <tbody>
                    {FIELDS.map((field) => {
                      const local = conflict.local ? show(conflict.local[field.localKey]) : "—";
                      const remote = show((conflict.remote as Record<string, unknown>)[field.key]);
                      const differs = local !== remote;
                      return (
                        <tr key={field.key} className={differs ? "bg-amber-500/[0.06]" : undefined}>
                          <td className="py-1 pr-2 text-foreground/55">{field.label}</td>
                          <td className="py-1 pr-2">{local}</td>
                          <td className="py-1 font-medium">{remote}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  disabled={resolve.isPending || !conflict.local}
                  onClick={() => apply(conflict.id, "link_only")}
                  className="rounded-full bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-40"
                >
                  Vincular sem sobrescrever
                </button>
                <button
                  disabled={resolve.isPending || !conflict.local}
                  onClick={() => apply(conflict.id, "update_local")}
                  className="rounded-full bg-foreground/[0.06] px-3 py-1.5 text-[11px] font-semibold disabled:opacity-40"
                >
                  Atualizar cadastro local
                </button>
                <button
                  disabled={resolve.isPending}
                  onClick={() => apply(conflict.id, "create_separate")}
                  className="rounded-full bg-foreground/[0.06] px-3 py-1.5 text-[11px] font-semibold disabled:opacity-40"
                >
                  Criar separado
                </button>
                <button
                  disabled={resolve.isPending}
                  onClick={() => apply(conflict.id, "ignore")}
                  className="rounded-full bg-foreground/[0.06] px-3 py-1.5 text-[11px] font-semibold disabled:opacity-40"
                >
                  Ignorar
                </button>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
