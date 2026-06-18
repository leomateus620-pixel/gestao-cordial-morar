import {
  ArrowUpRight,
  CalendarPlus2,
  Camera,
  FileSignature,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

const highlights = [
  { label: "Visita", icon: CalendarPlus2 },
  { label: "Fotos", icon: Camera },
  { label: "Retorno", icon: RotateCcw },
  { label: "Assinatura", icon: FileSignature },
] as const;

export function AgendaCreateCard({ onClick, isOpen }: { onClick: () => void; isOpen: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Agendar novo compromisso"
      className={cn(
        "agenda-create-card group relative w-full overflow-hidden rounded-[1.75rem] p-4 text-left sm:p-5",
        "bg-[linear-gradient(135deg,rgba(8,72,78,0.98),rgba(19,111,108,0.94)_60%,rgba(24,80,91,0.96))] text-white",
        "shadow-xl shadow-teal-950/20 ring-1 ring-white/40",
        "transition-[opacity,transform,box-shadow] duration-300 ease-out",
        isOpen && "pointer-events-none opacity-65",
      )}
    >
      <span className="absolute -right-12 -top-20 size-52 rounded-full bg-cyan-200/14 blur-3xl" />
      <span className="absolute -bottom-12 left-1/3 size-40 rounded-full bg-orange-300/10 blur-3xl" />
      <span className="absolute bottom-0 left-10 h-1 w-24 rounded-full bg-orange-300/90 shadow-[0_0_24px_rgba(253,186,116,0.58)] transition-all duration-300 group-hover:w-40" />

      <span className="relative flex items-start gap-3 sm:items-center sm:gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/15 shadow-inner ring-1 ring-white/20 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:rotate-3 sm:size-14">
          <CalendarPlus2 className="size-5 sm:size-6" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.2em] text-teal-50/70 sm:text-[10px]">
            <Sparkles className="size-3 text-orange-200" />
            Central operacional
          </span>
          <span className="mt-1 block text-lg font-semibold tracking-tight sm:text-xl">
            Novo compromisso
          </span>
          <span className="mt-1 block max-w-[48rem] text-xs leading-5 text-teal-50/78 sm:text-[13px]">
            Agende visitas, fotos, vídeos, retornos, assinaturas e tarefas da equipe.
          </span>

          <span className="mt-3 flex flex-wrap gap-1.5">
            {highlights.map(({ label, icon: Icon }) => (
              <span
                key={label}
                className="flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1.5 text-[9px] font-semibold text-white/78 ring-1 ring-white/12 sm:text-[10px]"
              >
                <Icon className="size-3 text-orange-200" />
                {label}
              </span>
            ))}
          </span>
        </span>

        <span className="hidden shrink-0 items-center gap-2 rounded-full bg-white/14 px-4 py-2.5 text-xs font-semibold ring-1 ring-white/20 transition duration-300 group-hover:-translate-y-0.5 group-hover:bg-orange-200 group-hover:text-teal-950 sm:flex">
          Agendar
          <ArrowUpRight className="size-4" />
        </span>
      </span>
    </button>
  );
}
