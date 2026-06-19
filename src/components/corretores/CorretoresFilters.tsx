import { Building2, RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AgencyFilter } from "@/services/corretores";
import { getCorretorPeriodLabel, getCorretorStatusLabel } from "@/services/corretores";
import type {
  Corretor,
  CorretorFiltersState,
  CorretorPeriodFilter,
  CorretorSortKey,
  CorretorStatusFilter,
} from "@/types/corretor";
import { cn } from "@/lib/utils";

type CorretoresFiltersProps = {
  agency: AgencyFilter;
  filters: CorretorFiltersState;
  corretores: Corretor[];
  onAgencyChange: (agency: AgencyFilter) => void;
  onFiltersChange: (filters: Partial<CorretorFiltersState>) => void;
  onReset: () => void;
};

const periodOptions: CorretorPeriodFilter[] = ["mes", "ultimos_30", "trimestre", "ano"];
const statusOptions: CorretorStatusFilter[] = ["ativos", "todos", "inativos"];

const sortOptions: Array<{ value: CorretorSortKey; label: string }> = [
  { value: "conversao", label: "Melhor conversão" },
  { value: "contratos", label: "Mais contratos" },
  { value: "atendimentos", label: "Mais atendimentos" },
  { value: "comissao", label: "Maior comissão" },
  { value: "agenciamentos", label: "Mais agenciamentos" },
];

export function CorretoresFilters({
  agency,
  filters,
  corretores,
  onAgencyChange,
  onFiltersChange,
  onReset,
}: CorretoresFiltersProps) {
  const selectedBroker = corretores.find((corretor) => corretor.nome === filters.busca);
  const brokerSelectValue = selectedBroker ? selectedBroker.nome : "todos";

  return (
    <section className="premium-card p-3 sm:p-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-9 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
            <SlidersHorizontal className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-tight">Filtros do período</p>
            <p className="truncate text-[11px] text-foreground/50">
              Ajuste imobiliária, status e ranking sem sair da visão executiva.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 rounded-2xl bg-white/[0.55] p-1 ring-1 ring-foreground/5 sm:w-fit">
          {[
            { value: "todas", label: "Todas" },
            { value: "cordial", label: "Cordial" },
            { value: "morar", label: "Morar" },
          ].map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => onAgencyChange(item.value as AgencyFilter)}
              className={cn(
                "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-bold transition-all active:scale-[0.98]",
                agency === item.value
                  ? "bg-primary text-white shadow-[0_10px_24px_-14px_rgba(30,100,125,0.75)]"
                  : "text-foreground/55 hover:bg-white/[0.7] hover:text-primary",
              )}
            >
              <Building2 className="size-3.5" />
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-[0.9fr_0.9fr_1.1fr_1.1fr_auto]">
        <Select
          value={filters.periodo}
          onValueChange={(periodo) => onFiltersChange({ periodo: periodo as CorretorPeriodFilter })}
        >
          <SelectTrigger className="h-11 rounded-2xl border-white/[0.65] bg-white/[0.58]">
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent>
            {periodOptions.map((periodo) => (
              <SelectItem key={periodo} value={periodo}>
                {getCorretorPeriodLabel(periodo)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.status}
          onValueChange={(status) => onFiltersChange({ status: status as CorretorStatusFilter })}
        >
          <SelectTrigger className="h-11 rounded-2xl border-white/[0.65] bg-white/[0.58]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map((status) => (
              <SelectItem key={status} value={status}>
                {getCorretorStatusLabel(status)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.ordenacao}
          onValueChange={(ordenacao) =>
            onFiltersChange({ ordenacao: ordenacao as CorretorSortKey })
          }
        >
          <SelectTrigger className="h-11 rounded-2xl border-white/[0.65] bg-white/[0.58]">
            <SelectValue placeholder="Ordenar por" />
          </SelectTrigger>
          <SelectContent>
            {sortOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={brokerSelectValue}
          onValueChange={(value) => onFiltersChange({ busca: value === "todos" ? "" : value })}
        >
          <SelectTrigger className="h-11 rounded-2xl border-white/[0.65] bg-white/[0.58]">
            <SelectValue placeholder="Corretor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os corretores</SelectItem>
            {corretores.map((corretor) => (
              <SelectItem key={corretor.id} value={corretor.nome}>
                {corretor.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex gap-2">
          <label className="relative min-w-0 flex-1 xl:w-52 xl:flex-none">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground/38" />
            <input
              value={filters.busca}
              onChange={(event) => onFiltersChange({ busca: event.target.value })}
              placeholder="Buscar"
              className="h-11 w-full rounded-2xl border border-white/[0.65] bg-white/[0.58] pl-9 pr-3 text-sm outline-none transition-all placeholder:text-foreground/35 focus:border-primary/30 focus:bg-white/[0.8] focus:ring-2 focus:ring-primary/10"
            />
          </label>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-11 shrink-0 rounded-2xl border-white/[0.65] bg-white/[0.58] text-foreground/55 hover:text-primary"
            onClick={onReset}
            aria-label="Limpar filtros"
          >
            <RotateCcw className="size-4" />
          </Button>
        </div>
      </div>
    </section>
  );
}
