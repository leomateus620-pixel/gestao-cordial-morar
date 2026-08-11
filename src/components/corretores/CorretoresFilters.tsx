import { useMemo, useState, type ReactNode } from "react";
import { RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getCorretorPeriodLabel, getCorretorStatusLabel } from "@/services/corretores";
import { useIsMobile } from "@/hooks/use-mobile";
import type {
  Corretor,
  CorretorFiltersState,
  CorretorPeriodFilter,
  CorretorSortKey,
  CorretorStatusFilter,
} from "@/types/corretor";
import { cn } from "@/lib/utils";

type CorretoresFiltersProps = {
  filters: CorretorFiltersState;
  corretores: Corretor[];
  onFiltersChange: (filters: Partial<CorretorFiltersState>) => void;
  onReset: () => void;
  isLoading?: boolean;
  activeAgencyLabel?: string;
};

const periodOptions: CorretorPeriodFilter[] = ["mes", "ultimos_30", "trimestre", "ano"];
const statusOptions: CorretorStatusFilter[] = ["ativos", "todos", "inativos"];

const sortOptions: Array<{ value: CorretorSortKey; label: string }> = [
  { value: "conversao", label: "Conversão de atendimentos" },
  { value: "contratos", label: "Contratos fechados" },
  { value: "atendimentos", label: "Atendimentos recebidos" },
  { value: "comissao", label: "Comissão prevista" },
  { value: "agenciamentos", label: "Agenciamentos" },
];

export function CorretoresFilters({
  filters,
  corretores,
  onFiltersChange,
  onReset,
  isLoading = false,
  activeAgencyLabel,
}: CorretoresFiltersProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const selectedBrokerExists = useMemo(
    () => filters.corretorId === "todos" || corretores.some(({ id }) => id === filters.corretorId),
    [corretores, filters.corretorId],
  );
  const brokerSelectValue = selectedBrokerExists ? filters.corretorId : "todos";
  const activeFilterCount = [
    filters.periodo !== "mes",
    filters.status !== "ativos",
    filters.ordenacao !== "contratos",
    filters.corretorId !== "todos",
    filters.busca.trim().length > 0,
  ].filter(Boolean).length;

  const trigger = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={isLoading}
      aria-label={
        activeFilterCount > 0
          ? `Filtros — ${activeFilterCount} ativos`
          : "Abrir filtros operacionais"
      }
      className="h-9 shrink-0 gap-2 rounded-xl border-border/55 bg-background/70 px-2.5 text-foreground/70 hover:text-primary"
    >
      <SlidersHorizontal className="size-4" aria-hidden />
      <span className="hidden sm:inline">Filtros</span>
      {activeFilterCount > 0 && (
        <span className="grid size-5 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
          {activeFilterCount}
        </span>
      )}
    </Button>
  );

  const body = (
    <FilterFields
      filters={filters}
      corretores={corretores}
      brokerSelectValue={brokerSelectValue}
      onFiltersChange={onFiltersChange}
      onReset={onReset}
      isLoading={isLoading}
      activeFilterCount={activeFilterCount}
      activeAgencyLabel={activeAgencyLabel}
    />
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent side="bottom" className="rounded-t-3xl p-5">
          <SheetHeader className="mb-4 text-left">
            <SheetTitle className="text-base">Filtros operacionais</SheetTitle>
          </SheetHeader>
          {body}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] rounded-2xl p-4">
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-foreground/55">
          Filtros operacionais
        </p>
        {body}
      </PopoverContent>
    </Popover>
  );
}

function FilterFields({
  filters,
  corretores,
  brokerSelectValue,
  onFiltersChange,
  onReset,
  isLoading,
  activeFilterCount,
  activeAgencyLabel,
}: {
  filters: CorretorFiltersState;
  corretores: Corretor[];
  brokerSelectValue: string;
  onFiltersChange: (filters: Partial<CorretorFiltersState>) => void;
  onReset: () => void;
  isLoading: boolean;
  activeFilterCount: number;
  activeAgencyLabel?: string;
}) {
  return (
    <div className="grid gap-3">
      {activeAgencyLabel && (
        <span className="w-fit rounded-full bg-primary/8 px-2 py-0.5 text-[10px] font-semibold text-primary">
          Escopo: {activeAgencyLabel}
        </span>
      )}

      <FilterField label="Período" htmlFor="corretores-periodo">
        <Select
          value={filters.periodo}
          disabled={isLoading}
          onValueChange={(periodo) => onFiltersChange({ periodo: periodo as CorretorPeriodFilter })}
        >
          <SelectTrigger
            id="corretores-periodo"
            className="h-10 rounded-xl border-border/55 bg-background/72"
          >
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
      </FilterField>

      <FilterField label="Situação" htmlFor="corretores-status">
        <Select
          value={filters.status}
          disabled={isLoading}
          onValueChange={(status) => onFiltersChange({ status: status as CorretorStatusFilter })}
        >
          <SelectTrigger
            id="corretores-status"
            className="h-10 rounded-xl border-border/55 bg-background/72"
          >
            <SelectValue placeholder="Situação" />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map((status) => (
              <SelectItem key={status} value={status}>
                {getCorretorStatusLabel(status)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterField>

      <FilterField label="Critério do ranking" htmlFor="corretores-ranking">
        <Select
          value={filters.ordenacao}
          disabled={isLoading}
          onValueChange={(ordenacao) => onFiltersChange({ ordenacao: ordenacao as CorretorSortKey })}
        >
          <SelectTrigger
            id="corretores-ranking"
            className="h-10 rounded-xl border-border/55 bg-background/72"
          >
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
      </FilterField>

      <FilterField label="Corretor" htmlFor="corretores-corretor">
        <Select
          value={brokerSelectValue}
          disabled={isLoading}
          onValueChange={(corretorId) => onFiltersChange({ corretorId })}
        >
          <SelectTrigger
            id="corretores-corretor"
            className="h-10 rounded-xl border-border/55 bg-background/72"
          >
            <SelectValue placeholder="Corretor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os corretores</SelectItem>
            {corretores.map((corretor) => (
              <SelectItem key={corretor.id} value={corretor.id}>
                {corretor.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterField>

      <FilterField label="Busca" htmlFor="corretores-busca">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground/40"
            aria-hidden
          />
          <input
            id="corretores-busca"
            value={filters.busca}
            disabled={isLoading}
            onChange={(event) => onFiltersChange({ busca: event.target.value })}
            placeholder="Nome ou CRECI"
            autoComplete="off"
            className="h-10 w-full rounded-xl border border-border/55 bg-background/72 pl-9 pr-3 text-sm outline-none transition-[border-color,box-shadow,background-color] placeholder:text-foreground/40 focus:border-primary/40 focus:bg-background focus:ring-2 focus:ring-primary/12 disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>
      </FilterField>

      <Button
        type="button"
        variant="ghost"
        className={cn(
          "h-10 w-full rounded-xl text-foreground/65 hover:text-primary",
          activeFilterCount === 0 && "opacity-60",
        )}
        onClick={onReset}
        disabled={isLoading || activeFilterCount === 0}
      >
        <RotateCcw className="mr-2 size-4" aria-hidden />
        Limpar filtros
      </Button>
    </div>
  );
}

function FilterField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.14em] text-foreground/55"
      >
        {label}
      </label>
      {children}
    </div>
  );
}
