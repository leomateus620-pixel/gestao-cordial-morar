import { ArrowUpRight, BarChart3, Sparkles, UserRoundPlus, UsersRound } from "lucide-react";
import { cn } from "@/lib/utils";

const highlights = [
  { label: "Pré-cadastro rápido", icon: UserRoundPlus },
  { label: "Encaminhar corretor", icon: UsersRound },
  { label: "Gerar relatório", icon: BarChart3 },
] as const;

export function AtendimentoCreateCard({
  onClick,
  isOpen,
}: {
  onClick: () => void;
  isOpen: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Criar novo atendimento"
      className={cn(
        "atendimento-create-card group relative w-full overflow-hidden rounded-[1.75rem] p-4 text-left sm:p-5",
        "bg-[linear-gradient(135deg,rgba(10,77,82,0.98),rgba(16,112,105,0.92))] text-white",
        "shadow-xl shadow-teal-950/18 ring-1 ring-white/40",
        "transition-[opacity,transform,box-shadow] duration-300 ease-out",
        isOpen && "pointer-events-none opacity-65",
      )}
    >
      <span className="absolute -right-10 -top-16 size-44 rounded-full bg-cyan-200/14 blur-3xl" />
      <span className="absolute -bottom-10 left-1/3 size-32 rounded-full bg-amber-300/8 blur-3xl" />
      <span className="absolute bottom-0 left-10 h-1 w-20 rounded-full bg-amber-300/85 shadow-[0_0_22px_rgba(252,211,77,0.5)] transition-all duration-300 group-hover:w-36" />

      <div className="relative flex items-start gap-3 sm:gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/15 shadow-inner ring-1 ring-white/20 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:rotate-3 sm:size-14">
          <UserRoundPlus className="size-5 sm:size-6" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.2em] text-teal-50/70 sm:text-[10px]">
            <Sparkles className="size-3 text-amber-200" />
            Entrada comercial inteligente
          </span>
          <span className="mt-1 block text-lg font-semibold tracking-tight sm:text-xl">
            Novo atendimento
          </span>
          <span className="mt-1 block max-w-[46rem] text-xs leading-5 text-teal-50/78 sm:text-[13px]">
            Registre a entrada de um cliente, identifique o perfil de busca e encaminhe para o
            corretor responsável.
          </span>

          <span className="mt-3 flex flex-wrap gap-1.5">
            {highlights.map(({ label, icon: Icon }) => (
              <span
                key={label}
                className="flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1.5 text-[9px] font-semibold text-white/76 ring-1 ring-white/12 sm:text-[10px]"
              >
                <Icon className="size-3 text-amber-200" />
                {label}
              </span>
            ))}
          </span>
        </span>

        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white/14 ring-1 ring-white/20 transition duration-300 group-hover:-translate-y-0.5 group-hover:bg-amber-200 group-hover:text-teal-950 sm:size-11">
          <ArrowUpRight className="size-4" />
        </span>
      </div>
    </button>
  );
}
