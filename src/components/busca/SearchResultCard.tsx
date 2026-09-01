import {
  BadgeDollarSign,
  Building2,
  CalendarClock,
  FileText,
  Home,
  HousePlus,
  Inbox,
  KeyRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { BuscaCategoria, BuscaResultado } from "@/types/busca";
import { buscaCategoriaLabels, formatBuscaDate } from "@/types/busca";
import { cn } from "@/lib/utils";

export const categoriaIcons: Record<BuscaCategoria, LucideIcon> = {
  catalogo: Home,
  atendimento: Inbox,
  cliente: Users,
  aluguel: KeyRound,
  venda: BadgeDollarSign,
  agenciamento: HousePlus,
  imovel: Building2,
  inquilino: KeyRound,
  visita: CalendarClock,
};

type Props = {
  result: BuscaResultado;
  onSelect: (result: BuscaResultado) => void;
  compact?: boolean;
};

export function SearchResultCard({ result, onSelect, compact = false }: Props) {
  const Icon = categoriaIcons[result.categoria];

  return (
    <button
      type="button"
      onClick={() => onSelect(result)}
      className={cn(
        "group flex w-full items-start gap-3 rounded-2xl border border-transparent bg-white/60 p-3 text-left transition hover:border-primary/25 hover:bg-white/90 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none",
        compact ? "py-2.5" : "p-4",
      )}
    >
      <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-semibold text-foreground">{result.titulo}</span>
          <span className="rounded-full bg-primary/8 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-primary/80 uppercase">
            {buscaCategoriaLabels[result.categoria]}
          </span>
        </span>
        {result.subtitulo ? (
          <span className="mt-0.5 block truncate text-xs text-foreground/60">
            {result.subtitulo}
          </span>
        ) : null}
        {!compact && result.detalhe ? (
          <span className="mt-0.5 block truncate text-xs text-foreground/45">{result.detalhe}</span>
        ) : null}
      </span>
      <span className="hidden shrink-0 flex-col items-end gap-1 text-right sm:flex">
        {result.status ? (
          <span className="rounded-full bg-foreground/5 px-2 py-0.5 text-[11px] font-medium text-foreground/60 capitalize">
            {String(result.status).replace(/_/g, " ")}
          </span>
        ) : null}
        {result.data ? (
          <span className="text-[11px] text-foreground/40">{formatBuscaDate(result.data)}</span>
        ) : null}
      </span>
    </button>
  );
}
