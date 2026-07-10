import { Building2, RotateCcw, Search, SlidersHorizontal, X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
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

const periodOptions: AgenciamentoPeriodFilter[] = ["mes", "ultimos_30", "trimestre", "ano"];
const statusOptions: AgenciamentoStatusFilter[] = [
  "todos",
  "novo",
  "em_andamento",
  "pendentes",
  "aguardando_validacao",
  "validado",
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

const controlClassName =
  "h-11 rounded-xl border-foreground/10 bg-white/78 text-foreground shadow-none focus:ring-2 focus:ring-primary/20";

export function AgenciamentoFilters({
  filters,
  corretores,
  isAdmin,
  onFiltersChange,
  onReset,
}: AgenciamentoFiltersProps) {
  const activeCount = getActiveFilterCount(filters, isAdmin);

  return (
    <section
      aria-labelledby="agenciamentos-filters-title"
      className="rounded-[1.4rem] border border-white/72 bg-white/60 p-3 shadow-[0_18px_44px_-36px_rgba(23,27,33,0.35)] backdrop-blur-xl sm:p-3.5"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <SlidersHorizontal aria-hidden="true" className="size-4 text-primary" />
            <h2 id="agenciamentos-filters-title" className="text-sm font-bold tracking-tight">
              Filtros operacionais
            </h2>
            {activeCount > 0 && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                {activeCount} {activeCount === 1 ? "ativo" : "ativos"}
              </span>
            )}
          </div>
        </div>

        <Button
          type="button"
          variant="ghost"
          className="h-10 shrink-0 rounded-xl px-2.5 text-xs font-semibold text-foreground/58 transition-[color,background-color,transform] duration-150 ease-out active:scale-[0.98] disabled:opacity-35"
          onClick={onReset}
          disabled={activeCount === 0}
        >
          <RotateCcw className="size-3.5" />
          <span className="hidden sm:inline">Limpar filtros</span>
          <span className="sm:hidden">Limpar</span>
        </Button>
      </div>

      <div className="mt-3 lg:hidden">
        <SearchField
          value={filters.busca}
          onChange={(busca) => onFiltersChange({ busca })}
          onClear={() => onFiltersChange({ busca: "" })}
        />

        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <Select
            value={filters.periodo}
            onValueChange={(periodo) =>
              onFiltersChange({ periodo: periodo as AgenciamentoPeriodFilter })
            }
          >
            <SelectTrigger aria-label="Período" className={controlClassName}>
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              {periodOptions.map((periodo) => (
                <SelectItem key={periodo} value={periodo}>
                  {getAgenciamentoPeriodLabel(periodo)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Sheet>
            <SheetTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-xl border-foreground/10 bg-white/78 px-3.5 text-sm font-bold text-primary shadow-none transition-[background-color,transform] duration-150 ease-out active:scale-[0.98]"
                aria-label={`Abrir filtros avançados${
                  activeCount > 0
                    ? `, ${activeCount} ${activeCount === 1 ? "ativo" : "ativos"}`
                    : ""
                }`}
              >
                <SlidersHorizontal className="size-4" />
                Filtros
                {activeCount > 0 && (
                  <span className="grid size-5 place-items-center rounded-full bg-primary text-[10px] text-white">
                    {activeCount}
                  </span>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent
              side="bottom"
              closeLabel="Fechar filtros"
              className="flex max-h-[88dvh] flex-col rounded-t-[1.75rem] border-white/70 bg-[#f7f3ed] p-0 shadow-[0_-24px_70px_-36px_rgba(23,27,33,0.52)] data-[state=closed]:duration-200 data-[state=open]:duration-300 motion-reduce:data-[state=closed]:animate-none motion-reduce:data-[state=open]:animate-none motion-reduce:transition-none [&>button]:right-5 [&>button]:top-5"
            >
              <SheetHeader className="border-b border-foreground/8 px-5 pb-4 pt-5 text-left">
                <SheetTitle className="text-lg font-extrabold tracking-tight">
                  Refinar agenciamentos
                </SheetTitle>
                <SheetDescription>
                  Os filtros são aplicados imediatamente e permanecem ativos ao fechar.
                </SheetDescription>
              </SheetHeader>

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-5">
                <FilterLabel label="Imobiliária">
                  <AgencyScope
                    value={filters.imobiliaria}
                    onChange={(imobiliaria) => onFiltersChange({ imobiliaria })}
                  />
                </FilterLabel>
                <FilterLabel label="Status">
                  <StatusSelect
                    value={filters.status}
                    onChange={(status) => onFiltersChange({ status })}
                  />
                </FilterLabel>
                <FilterLabel label="Tipo de imóvel">
                  <TypeSelect
                    value={filters.tipoImovel}
                    onChange={(tipoImovel) => onFiltersChange({ tipoImovel })}
                  />
                </FilterLabel>
                <FilterLabel label="Condição do checklist">
                  <ChecklistSelect
                    value={filters.checklist}
                    onChange={(checklist) => onFiltersChange({ checklist })}
                  />
                </FilterLabel>
                {isAdmin && (
                  <FilterLabel label="Corretor responsável">
                    <BrokerSelect
                      value={filters.corretorId}
                      corretores={corretores}
                      onChange={(corretorId) => onFiltersChange({ corretorId })}
                    />
                  </FilterLabel>
                )}
              </div>

              <div
                className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 border-t border-foreground/8 bg-white/75 px-5 py-3"
                style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.75rem)" }}
              >
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 rounded-xl px-3 text-foreground/60"
                  onClick={onReset}
                  disabled={activeCount === 0}
                >
                  <RotateCcw className="size-4" />
                  Limpar
                </Button>
                <SheetClose asChild>
                  <Button type="button" className="h-11 rounded-xl bg-[#174d61] text-white">
                    Aplicar filtros
                  </Button>
                </SheetClose>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      <div className="mt-3 hidden lg:block">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <FilterLabel label="Escopo da imobiliária" className="w-full xl:w-auto">
            <AgencyScope
              value={filters.imobiliaria}
              onChange={(imobiliaria) => onFiltersChange({ imobiliaria })}
            />
          </FilterLabel>
          <div className="w-full xl:w-[19rem]">
            <span className="mb-1.5 block text-[11px] font-semibold text-foreground/64">Busca</span>
            <SearchField
              value={filters.busca}
              onChange={(busca) => onFiltersChange({ busca })}
              onClear={() => onFiltersChange({ busca: "" })}
            />
          </div>
        </div>

        <div className="mt-2.5 grid gap-2.5 lg:grid-cols-2 xl:grid-cols-5">
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
            <StatusSelect
              value={filters.status}
              onChange={(status) => onFiltersChange({ status })}
            />
          </FilterLabel>
          <FilterLabel label="Tipo de imóvel">
            <TypeSelect
              value={filters.tipoImovel}
              onChange={(tipoImovel) => onFiltersChange({ tipoImovel })}
            />
          </FilterLabel>
          <FilterLabel label="Checklist">
            <ChecklistSelect
              value={filters.checklist}
              onChange={(checklist) => onFiltersChange({ checklist })}
            />
          </FilterLabel>
          {isAdmin ? (
            <FilterLabel label="Responsável">
              <BrokerSelect
                value={filters.corretorId}
                corretores={corretores}
                onChange={(corretorId) => onFiltersChange({ corretorId })}
              />
            </FilterLabel>
          ) : (
            <div className="hidden xl:block" />
          )}
        </div>
      </div>
    </section>
  );
}

function SearchField({
  value,
  onChange,
  onClear,
}: {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
}) {
  return (
    <label className="relative block min-w-0">
      <span className="sr-only">Buscar agenciamentos</span>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-foreground/42"
      />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Endereço, proprietário ou corretor"
        className="h-11 w-full rounded-xl border border-foreground/10 bg-white/78 pl-10 pr-10 text-sm text-foreground outline-none transition-[border-color,box-shadow,background-color] duration-150 ease-out placeholder:text-foreground/40 focus:border-primary/45 focus:bg-white focus:ring-2 focus:ring-primary/15"
      />
      {value && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Limpar busca"
          className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-foreground/45 transition-[color,background-color,transform] duration-150 ease-out hover:bg-foreground/5 hover:text-foreground active:scale-95"
        >
          <X className="size-4" />
        </button>
      )}
    </label>
  );
}

function AgencyScope({
  value,
  onChange,
}: {
  value: AgenciamentoFiltersState["imobiliaria"];
  onChange: (value: AgenciamentoFiltersState["imobiliaria"]) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Escopo da imobiliária"
      className="grid grid-cols-3 rounded-xl border border-foreground/9 bg-[#ece7df] p-1"
    >
      {[
        { value: "todas", label: "Todas" },
        { value: "cordial", label: "Cordial" },
        { value: "morar", label: "Morar" },
      ].map((item) => (
        <button
          key={item.value}
          type="button"
          aria-pressed={value === item.value}
          onClick={() => onChange(item.value as AgenciamentoFiltersState["imobiliaria"])}
          className={cn(
            "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-bold transition-[background-color,color,box-shadow,transform] duration-150 ease-out active:scale-[0.98]",
            value === item.value
              ? "bg-white text-primary shadow-[0_5px_14px_-10px_rgba(23,77,97,0.8)]"
              : "text-foreground/54 hover:text-foreground",
          )}
        >
          <Building2 aria-hidden="true" className="size-3.5" />
          {item.label}
        </button>
      ))}
    </div>
  );
}

function StatusSelect({
  value,
  onChange,
}: {
  value: AgenciamentoStatusFilter;
  onChange: (value: AgenciamentoStatusFilter) => void;
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as AgenciamentoStatusFilter)}>
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
  );
}

function TypeSelect({
  value,
  onChange,
}: {
  value: "todos" | AgenciamentoTipoImovel;
  onChange: (value: "todos" | AgenciamentoTipoImovel) => void;
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as typeof value)}>
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
  );
}

function ChecklistSelect({
  value,
  onChange,
}: {
  value: AgenciamentoChecklistFilter;
  onChange: (value: AgenciamentoChecklistFilter) => void;
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as AgenciamentoChecklistFilter)}>
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
  );
}

function BrokerSelect({
  value,
  corretores,
  onChange,
}: {
  value: string;
  corretores: Corretor[];
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
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
      <span className="mb-1.5 block text-[11px] font-semibold text-foreground/64">{label}</span>
      {children}
    </div>
  );
}

function getActiveFilterCount(filters: AgenciamentoFiltersState, isAdmin: boolean) {
  return [
    filters.imobiliaria !== "todas",
    filters.status !== "todos",
    filters.periodo !== "mes",
    filters.tipoImovel !== "todos",
    filters.checklist !== "todos",
    isAdmin && filters.corretorId !== "todos",
    Boolean(filters.busca.trim()),
  ].filter(Boolean).length;
}
