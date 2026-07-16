import { ArrowUpRight, UserPlus, UsersRound } from "lucide-react";
import { cn } from "@/lib/utils";

export function ClientCreateCard({ onClick, isOpen }: { onClick: () => void; isOpen: boolean }) {
  return (
    <section
      aria-labelledby="clients-page-title"
      className="relative overflow-hidden rounded-[1.75rem] bg-[linear-gradient(135deg,#174d61_0%,#1e647d_52%,#28333b_100%)] p-4 text-white shadow-[0_22px_52px_-26px_rgba(23,27,33,0.55)] sm:p-5"
    >
      <span className="pointer-events-none absolute -right-12 -top-16 size-40 rounded-full bg-cyan-200/10 blur-3xl" />
      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
          <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-cyan-200/13 ring-1 ring-white/10">
            <UsersRound className="size-5 text-orange-300" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-orange-300">
              CRM imobiliário
            </p>
            <h1 id="clients-page-title" className="mt-0.5 text-xl font-semibold tracking-tight">
              Clientes
            </h1>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-white/68">
              Centralize perfis, interesses e próximos passos da carteira comercial.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClick}
          disabled={isOpen}
          aria-label="Criar cadastro de cliente"
          className={cn(
            "client-create-card premium-pressable inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-2xl bg-white px-4 text-sm font-semibold text-teal-950 shadow-[0_12px_28px_-16px_rgba(0,0,0,0.62)] hover:bg-orange-50 sm:w-auto",
            isOpen && "cursor-wait opacity-60",
          )}
        >
          <UserPlus className="size-4" aria-hidden="true" />
          Criar cadastro
          <ArrowUpRight className="size-4 text-teal-800/60" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
