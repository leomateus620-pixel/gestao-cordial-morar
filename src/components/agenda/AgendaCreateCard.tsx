import { ArrowUpRight, CalendarDays, CalendarPlus2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export function AgendaCreateCard({
  onClick,
  isOpen,
  canCreate = true,
}: {
  onClick: () => void;
  isOpen: boolean;
  canCreate?: boolean;
}) {
  return (
    <section
      aria-labelledby="agenda-page-title"
      className="relative overflow-hidden rounded-[1.75rem] bg-[linear-gradient(135deg,rgba(8,72,78,0.98),rgba(19,111,108,0.94)_60%,rgba(24,80,91,0.96))] px-4 py-4 text-white shadow-xl shadow-teal-950/18 ring-1 ring-white/40 sm:px-5 sm:py-5"
    >
      <span className="pointer-events-none absolute -right-14 -top-24 size-52 rounded-full bg-cyan-200/12 blur-3xl" />
      <span className="pointer-events-none absolute -bottom-14 left-1/3 size-40 rounded-full bg-orange-300/9 blur-3xl" />

      <div className="relative flex items-center gap-3 sm:gap-4">
        <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/14 shadow-inner ring-1 ring-white/20 sm:size-12">
          <CalendarDays className="size-5" aria-hidden="true" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-teal-50/76">
            <Sparkles className="size-3 text-orange-200" aria-hidden="true" />
            Operação diária
          </div>
          <h1
            id="agenda-page-title"
            className="mt-0.5 text-xl font-semibold tracking-tight sm:text-2xl"
          >
            Agenda
          </h1>
          <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-teal-50/78 sm:line-clamp-1 sm:text-[13px]">
            Visitas, retornos e compromissos da equipe em um só fluxo.
          </p>
        </div>

        {canCreate ? (
          <button
            type="button"
            onClick={onClick}
            disabled={isOpen}
            aria-label="Agendar novo compromisso"
            className={cn(
              "premium-pressable flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-2xl bg-white px-3.5 text-xs font-semibold text-teal-950 shadow-lg shadow-teal-950/18 hover:bg-orange-50 sm:px-4 sm:text-sm",
              isOpen && "cursor-wait opacity-60",
            )}
          >
            <CalendarPlus2 className="size-4" aria-hidden="true" />
            <span className="hidden xs:inline sm:inline">Novo compromisso</span>
            <span className="sm:hidden">Novo</span>
            <ArrowUpRight className="hidden size-4 sm:block" aria-hidden="true" />
          </button>
        ) : (
          <span className="shrink-0 rounded-full bg-white/10 px-3 py-2 text-[10px] font-semibold text-white/72 ring-1 ring-white/15">
            Somente leitura
          </span>
        )}
      </div>
    </section>
  );
}
