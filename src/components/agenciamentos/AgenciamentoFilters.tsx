import { RotateCcw, Search, SlidersHorizontal, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { getAgenciamentoPeriodLabel, getAgenciamentoStatusLabel } from "@/services/agenciamentos";
import type {
  AgenciamentoChecklistFilter,
  AgenciamentoFiltersState,
  AgenciamentoPeriodFilter,
  AgenciamentoStatusFilter,
  AgenciamentoTipoImovel,
} from "@/types/agenciamento";
import { agenciamentoTipoOptions } from "@/types/agenciamento";
import type { Corretor } from "@/types/corretor";
import { cn } from "@/lib/utils";

type AgenciamentoFiltersProps = {
  filters: AgenciamentoFiltersState;
  corretores: Corretor[];
  isAdmin: boolean;
  onFiltersChange: (filters: Partial<AgenciamentoFiltersState>) => void;
  onReset: () => void;
};

const periodOptions: AgenciamentoPeriodFilter[] = ["todos", "mes", "ultimos_30", "trimestre", "ano"];
const statusOptions: AgenciamentoStatusFilter[] = [
  "todos",
  "novo",
  "em_andamento",
  "pendentes",
  "aguardando_validacao",
  "validado",
  "reprovado",
  "cancelado",
];

const checklistOptions: Array<{ value: AgenciamentoChecklistFilter; label: string }> = [
  { value: "todos", label: "Todas as condições" },
  { value: "com_placa", label: "Com placa" },
  { value: "sem_placa", label: "Sem placa" },
  { value: "com_fotos", label: "Com fotos" },
  { value: "sem_fotos", label: "Sem fotos" },
  { value: "no_site", label: "Publicado no site" },
  { value: "fora_site", label: "Fora do site" },
  { value: "com_drive", label: "Com arquivos no Drive" },
  { value: "sem_drive", label: "Sem arquivos no Drive" },
];

const agencyOptions = [
  { value: "todas", label: "Todas" },
  { value: "cordial", label: "Cordial" },
  { value: "morar", label: "Morar" },
] as const;

const controlClassName =
  "h-10 rounded-xl border-foreground/10 bg-[#f7f4f0] text-foreground shadow-none focus:ring-2 focus:ring-primary/20";

export function AgenciamentoSearchField({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <label className={cn("relative block min-w-0", className)}>
      <span className="sr-only">Buscar agenciamentos</span>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-foreground/42"
      />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Endereço, código, proprietário ou corretor"
        className="h-11 w-full rounded-xl border border-foreground/10 bg-white pl-10 pr-10 text-sm text-foreground outline-none transition-[border-color,box-shadow] duration-150 ease-out placeholder:text-foreground/40 focus:border-primary/45 focus:ring-2 focus:ring-primary/15"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Limpar busca"
          className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-foreground/45 transition-colors duration-150 hover:bg-foreground/5 hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      )}
    </label>
  );
}

export function AgenciamentoFilters({
  filters,
  corretores,
  isAdmin,
  onFiltersChange,
  onReset,
}: AgenciamentoFiltersProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const activeCount = getActiveFilterCount(filters, isAdmin);
  const chips = buildChips(filters, corretores, isAdmin);

  const trigger = (
    <Button
      type="button"
      variant="outline"
      aria-label={`Abrir filtros${activeCount > 0 ? `, ${activeCount} ativos` : ""}`}
      className={cn(
        "h-11 shrink-0 rounded-xl border-foreground/10 bg-white px-4 text-sm font-bold shadow-none transition-[border-color,background-color,transform] duration-150 ease-out hover:border-foreground/20 active:scale-[0.98]",
        activeCount > 0 ? "border-primary/45 text-primary" : "text-foreground/75",
      )}
    >
      <SlidersHorizontal className="size-4" />
      Filtros
      {activeCount > 0 && (
        <span className="grid size-5 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
          {activeCount}
        </span>
      )}
    </Button>
  );

  const panel = (
    <div className="space-y-4">
      <FilterLabel label="Imobiliária">
        <div
          role="group"
          aria-label="Escopo da imobiliária"
          className="grid grid-cols-3 rounded-xl border border-foreground/9 bg-[#ece7df] p-1"
        >
          {agencyOptions.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={filters.imobiliaria === item.value}
              onClick={() => onFiltersChange({ imobiliaria: item.value })}
              className={cn(
                "inline-flex min-h-9 items-center justify-center rounded-lg px-2.5 text-xs font-bold transition-all duration-150 ease-out active:scale-[0.98]",
                filters.imobiliaria === item.value
                  ? "bg-white text-primary shadow-[0_5px_14px_-10px_rgba(23,77,97,0.8)]"
                  : "text-foreground/54 hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </FilterLabel>

      <div className="grid gap-4 sm:grid-cols-2">
        <FilterLabel label="Período">
          <Select
            value={filters.periodo}
            onValueChange={(periodo) =>
              onFiltersChange({ periodo: periodo as AgenciamentoPeriodFilter })
            }
          >
            <SelectTrigger aria-label="Período" className={controlClassName}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {periodOptions.map((periodo) => (
                <SelectItem key={periodo} value={periodo}>
                  {getAgenciamentoPeriodLabel(periodo)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterLabel>

        <FilterLabel label="Status">
          <Select
            value={filters.status}
            onValueChange={(status) =>
              onFiltersChange({ status: status as AgenciamentoStatusFilter })
            }
          >
            <SelectTrigger aria-label="Status" className={controlClassName}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((status) => (
                <SelectItem key={status} value={status}>
                  {getAgenciamentoStatusLabel(status)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterLabel>

        <FilterLabel label="Tipo de imóvel">
          <Select
            value={filters.tipoImovel}
            onValueChange={(tipoImovel) =>
              onFiltersChange({ tipoImovel: tipoImovel as "todos" | AgenciamentoTipoImovel })
            }
          >
            <SelectTrigger aria-label="Tipo de imóvel" className={controlClassName}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os tipos</SelectItem>
              {agenciamentoTipoOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterLabel>

        <FilterLabel label="Checklist">
          <Select
            value={filters.checklist}
            onValueChange={(checklist) =>
              onFiltersChange({ checklist: checklist as AgenciamentoChecklistFilter })
            }
          >
            <SelectTrigger aria-label="Condição do checklist" className={controlClassName}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {checklistOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterLabel>

        {isAdmin && (
          <FilterLabel label="Responsável" className="sm:col-span-2">
            <Select
              value={filters.corretorId}
              onValueChange={(corretorId) => onFiltersChange({ corretorId })}
            >
              <SelectTrigger aria-label="Corretor responsável" className={controlClassName}>
                <SelectValue />
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
          </FilterLabel>
        )}
      </div>
    </div>
  );

  const footer = (closeButton: ReactNode) => (
    <div className="mt-4 flex items-center justify-between gap-2 border-t border-foreground/8 pt-3">
      <Button
        type="button"
        variant="ghost"
        className="h-10 rounded-xl px-3 text-xs font-semibold text-foreground/60 hover:text-primary disabled:opacity-35"
        onClick={onReset}
        disabled={activeCount === 0}
      >
        <RotateCcw className="size-3.5" />
        Limpar filtros
      </Button>
      {closeButton}
    </div>
  );

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center gap-2">
        {isMobile ? (
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>{trigger}</SheetTrigger>
            <SheetContent
              side="bottom"
              closeLabel="Fechar filtros"
              className="flex max-h-[88dvh] flex-col rounded-t-[1.75rem] border-white/70 bg-[#f7f3ed] px-5 pb-5 pt-5"
            >
              <SheetHeader className="text-left">
                <SheetTitle className="text-lg font-extrabold tracking-tight">
                  Refinar agenciamentos
                </SheetTitle>
              </SheetHeader>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-4">{panel}</div>
              {footer(
                <SheetClose asChild>
                  <Button type="button" className="h-10 rounded-xl bg-[#174d61] px-5 text-white">
                    Aplicar
                  </Button>
                </SheetClose>,
              )}
            </SheetContent>
          </Sheet>
        ) : (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>{trigger}</PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-[min(30rem,calc(100vw-2rem))] rounded-2xl border-foreground/10 bg-white p-4 shadow-[0_28px_64px_-40px_rgba(23,27,33,0.55)]"
            >
              {panel}
              {footer(
                <Button
                  type="button"
                  className="h-10 rounded-xl bg-[#174d61] px-5 text-white"
                  onClick={() => setOpen(false)}
                >
                  Aplicar
                </Button>,
              )}
            </PopoverContent>
          </Popover>
        )}
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => onFiltersChange(chip.clear)}
              className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/8 py-1 pl-2.5 pr-2 text-[11px] font-bold text-primary transition-colors duration-150 hover:bg-primary/15"
            >
              <span className="text-primary/60">{chip.group}</span>
              {chip.label}
              <X aria-hidden="true" className="size-3" />
              <span className="sr-only">Remover filtro</span>
            </button>
          ))}
          <button
            type="button"
            onClick={onReset}
            className="rounded-full px-2 py-1 text-[11px] font-semibold text-foreground/45 transition-colors hover:text-primary"
          >
            Limpar tudo
          </button>
        </div>
      )}
    </div>
  );
}

function FilterLabel({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-foreground/45">
        {label}
      </span>
      {children}
    </div>
  );
}

type Chip = {
  key: string;
  group: string;
  label: string;
  clear: Partial<AgenciamentoFiltersState>;
};

function buildChips(
  filters: AgenciamentoFiltersState,
  corretores: Corretor[],
  isAdmin: boolean,
): Chip[] {
  const chips: Chip[] = [];
  if (filters.imobiliaria !== "todas") {
    chips.push({
      key: "imobiliaria",
      group: "Imobiliária",
      label: filters.imobiliaria === "morar" ? "Morar" : "Cordial",
      clear: { imobiliaria: "todas" },
    });
  }
  if (filters.periodo !== "todos") {
    chips.push({
      key: "periodo",
      group: "Período",
      label: getAgenciamentoPeriodLabel(filters.periodo),
      clear: { periodo: "todos" },
    });
  }
  if (filters.status !== "todos") {
    chips.push({
      key: "status",
      group: "Status",
      label: getAgenciamentoStatusLabel(filters.status),
      clear: { status: "todos" },
    });
  }
  if (filters.tipoImovel !== "todos") {
    chips.push({
      key: "tipo",
      group: "Tipo",
      label:
        agenciamentoTipoOptions.find((option) => option.value === filters.tipoImovel)?.label ??
        filters.tipoImovel,
      clear: { tipoImovel: "todos" },
    });
  }
  if (filters.checklist !== "todos") {
    chips.push({
      key: "checklist",
      group: "Checklist",
      label:
        checklistOptions.find((option) => option.value === filters.checklist)?.label ??
        filters.checklist,
      clear: { checklist: "todos" },
    });
  }
  if (isAdmin && filters.corretorId !== "todos") {
    chips.push({
      key: "corretor",
      group: "Responsável",
      label: corretores.find((item) => item.id === filters.corretorId)?.nome ?? "Corretor",
      clear: { corretorId: "todos" },
    });
  }
  return chips;
}

function getActiveFilterCount(filters: AgenciamentoFiltersState, isAdmin: boolean) {
  return [
    filters.imobiliaria !== "todas",
    filters.status !== "todos",
    filters.periodo !== "todos",
    filters.tipoImovel !== "todos",
    filters.checklist !== "todos",
    isAdmin && filters.corretorId !== "todos",
  ].filter(Boolean).length;
}
