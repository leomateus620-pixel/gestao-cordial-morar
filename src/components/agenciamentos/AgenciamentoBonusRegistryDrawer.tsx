import { useMemo, useState } from "react";
import { Award, Loader2, Search } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getAllowedBonusTransitions,
  getBonusPeriodLabel,
  getBonusStatusLabel,
  getTrackLabel,
  summarizeBonuses,
  type AgenciamentoTrack,
} from "@/lib/agenciamentos/track";
import type { AgenciamentoBonus, AgenciamentoBonusStatus } from "@/types/agenciamento";
import { cn } from "@/lib/utils";

type StatusFilter = "todas" | AgenciamentoBonusStatus;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  track: AgenciamentoTrack;
  bonuses: AgenciamentoBonus[];
  canValidate: boolean;
  isUpdating: boolean;
  onUpdateStatus: (bonus: AgenciamentoBonus, status: AgenciamentoBonusStatus) => Promise<boolean>;
};

const statusTone: Record<AgenciamentoBonusStatus, string> = {
  pendente: "bg-amber-500/15 text-amber-800",
  aprovada: "bg-sky-500/15 text-sky-800",
  paga: "bg-emerald-500/15 text-emerald-800",
  cancelada: "bg-slate-200 text-slate-600",
};

const statusFilters: Array<{ value: StatusFilter; label: string }> = [
  { value: "todas", label: "Todas" },
  { value: "pendente", label: "Pendentes" },
  { value: "aprovada", label: "Aprovadas" },
  { value: "paga", label: "Pagas" },
  { value: "cancelada", label: "Canceladas" },
];

const transitionLabel: Record<AgenciamentoBonusStatus, string> = {
  pendente: "Reabrir",
  aprovada: "Aprovar",
  paga: "Marcar como paga",
  cancelada: "Cancelar",
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function formatDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function AgenciamentoBonusRegistryDrawer({
  open,
  onOpenChange,
  track,
  bonuses,
  canValidate,
  isUpdating,
  onUpdateStatus,
}: Props) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todas");
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<{
    bonus: AgenciamentoBonus;
    status: AgenciamentoBonusStatus;
  } | null>(null);

  const summary = useMemo(() => summarizeBonuses(bonuses), [bonuses]);

  const filtered = useMemo(() => {
    const term = normalize(search);
    return bonuses.filter((bonus) => {
      if (statusFilter !== "todas" && bonus.status !== statusFilter) return false;
      if (!term) return true;
      return normalize(bonus.corretorNome ?? "").includes(term);
    });
  }, [bonuses, search, statusFilter]);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-lg">
          <SheetHeader className="space-y-1 text-left">
            <SheetTitle className="text-base font-extrabold tracking-tight">
              Registro de bonificações · {getTrackLabel(track)}
            </SheetTitle>
            <SheetDescription className="text-xs">
              {summary.total} bonificação(ões) ativas · {summary.validadas} validada(s) ·{" "}
              {summary.pendentes} pendente(s)
              {summary.canceladas > 0 ? ` · ${summary.canceladas} cancelada(s)` : ""}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-3 space-y-3">
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground/40"
              />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por corretor"
                aria-label="Buscar bonificações por corretor"
                className="h-10 rounded-xl bg-white/80 pl-9"
              />
            </div>
            <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
              {statusFilters.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setStatusFilter(item.value)}
                  aria-pressed={statusFilter === item.value}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition",
                    statusFilter === item.value
                      ? "bg-[#174d61] text-white"
                      : "bg-foreground/6 text-foreground/60 hover:bg-foreground/10",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto pb-6">
            {filtered.length === 0 ? (
              <p className="rounded-2xl bg-white/70 px-4 py-6 text-center text-xs text-foreground/55">
                Nenhuma bonificação encontrada para este filtro.
              </p>
            ) : (
              filtered.map((bonus) => {
                const transitions = canValidate ? getAllowedBonusTransitions(bonus.status) : [];
                return (
                  <article
                    key={bonus.id}
                    className="rounded-2xl bg-white/75 px-3 py-3 ring-1 ring-white/70"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-sm font-bold">
                          <Award aria-hidden="true" className="size-4 shrink-0 text-[#174d61]" />
                          <span className="truncate">{bonus.corretorNome ?? "Corretor"}</span>
                        </p>
                        <p className="mt-0.5 text-xs text-foreground/58">
                          Bonificação nº {bonus.nivel} · {getBonusPeriodLabel(bonus)} ·{" "}
                          {formatDate(bonus.conquistadoEm)}
                        </p>
                        <p className="mt-0.5 text-xs text-foreground/50">
                          {bonus.listingsCount} captação(ões)
                          {bonus.categoria === "venda" ? ` · ${bonus.placasCount} placa(s)` : ""}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                          statusTone[bonus.status],
                        )}
                      >
                        {getBonusStatusLabel(bonus.status)}
                      </span>
                    </div>

                    {transitions.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-foreground/8 pt-2.5">
                        {transitions.map((status) => (
                          <Button
                            key={status}
                            type="button"
                            size="sm"
                            variant={status === "cancelada" ? "ghost" : "outline"}
                            disabled={isUpdating}
                            className="h-8 rounded-lg text-xs"
                            onClick={() => setPending({ bonus, status })}
                          >
                            {transitionLabel[status]}
                          </Button>
                        ))}
                      </div>
                    )}
                  </article>
                );
              })
            )}
          </div>

          {!canValidate && (
            <p className="border-t border-foreground/8 pt-3 text-[11px] text-foreground/50">
              Somente administradores podem validar bonificações.
            </p>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={Boolean(pending)} onOpenChange={(next) => !next && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending ? `${transitionLabel[pending.status]} bonificação?` : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending
                ? `A bonificação nº ${pending.bonus.nivel} de ${pending.bonus.corretorNome ?? "corretor"} passará para "${getBonusStatusLabel(pending.status)}".`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUpdating}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={isUpdating}
              onClick={async (event) => {
                event.preventDefault();
                if (!pending) return;
                const ok = await onUpdateStatus(pending.bonus, pending.status);
                if (ok) setPending(null);
              }}
            >
              {isUpdating && (
                <Loader2 aria-hidden="true" className="mr-1.5 size-4 animate-spin" />
              )}
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
