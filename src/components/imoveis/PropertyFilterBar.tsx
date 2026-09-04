import { useState } from "react";
import {
  Archive,
  ArrowUpDown,
  Bed,
  Home,
  MapPin,
  SlidersHorizontal,
  Tag,
  Wallet,
  X,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ARQUIVADOS_OPTIONS,
  DEFAULT_FILTERS,
  OPERACAO_OPTIONS,
  PRICE_PRESETS,
  SORT_OPTIONS,
  activeChips,
  countActiveFilters,
  priceRangeLabel,
  type CatalogFilters,
} from "@/lib/imoveis/filters";
import { cn } from "@/lib/utils";
import { FilterChip, FilterChipSelect } from "./catalog/FilterChip";
import { PropertyFiltersPanel, type CatalogFacets } from "./catalog/PropertyFiltersPanel";

/** Filtros que só existem no painel completo — aparecem como etiquetas removíveis abaixo do rail. */
const PANEL_ONLY_KEYS: Array<keyof CatalogFilters> = [
  "bairro",
  "suitesMin",
  "banheirosMin",
  "vagasMin",
  "areaMin",
  "areaMax",
  "status",
];

const DORM_OPTIONS = [
  { value: "", label: "Qualquer" },
  { value: "1", label: "1+ dormitório" },
  { value: "2", label: "2+ dormitórios" },
  { value: "3", label: "3+ dormitórios" },
  { value: "4", label: "4+ dormitórios" },
];

function formatBRL(value: number | null): string {
  return value === null ? "" : `R$ ${value.toLocaleString("pt-BR")}`;
}

function parseDigits(raw: string): number | null {
  const digits = raw.replace(/\D/g, "");
  return digits ? Number(digits) : null;
}

/** Faixa de valor direto no rail: presets rápidos + digitação livre. */
function PriceChip({
  valorMin,
  valorMax,
  onChange,
}: {
  valorMin: number | null;
  valorMax: number | null;
  onChange: (patch: { valorMin: number | null; valorMax: number | null }) => void;
}) {
  const [open, setOpen] = useState(false);
  const label = priceRangeLabel(valorMin, valorMax);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <FilterChip
          icon={Wallet}
          label="Valor"
          value={label}
          active={open}
          onClear={() => onChange({ valorMin: null, valorMax: null })}
          aria-haspopup="dialog"
          aria-expanded={open}
        />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        collisionPadding={12}
        className="w-[min(92vw,21rem)] space-y-3 rounded-2xl border-white/70 bg-white/92 p-3.5 shadow-[0_24px_60px_-20px_rgba(23,27,33,0.35)] backdrop-blur-2xl"
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-foreground/45">
            Faixa de valor
          </span>
          {label ? (
            <button
              type="button"
              onClick={() => onChange({ valorMin: null, valorMax: null })}
              className="text-[11px] font-semibold text-primary hover:underline"
            >
              Limpar
            </button>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-foreground/55">
            Mínimo
            <input
              inputMode="numeric"
              value={formatBRL(valorMin)}
              placeholder="R$ 0"
              onChange={(event) =>
                onChange({ valorMin: parseDigits(event.target.value), valorMax })
              }
              className="h-10 rounded-xl border border-foreground/[0.08] bg-white px-3 text-[13px] font-medium text-foreground outline-none transition placeholder:text-foreground/35 focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-foreground/55">
            Máximo
            <input
              inputMode="numeric"
              value={formatBRL(valorMax)}
              placeholder="Sem limite"
              onChange={(event) =>
                onChange({ valorMin, valorMax: parseDigits(event.target.value) })
              }
              className="h-10 rounded-xl border border-foreground/[0.08] bg-white px-3 text-[13px] font-medium text-foreground outline-none transition placeholder:text-foreground/35 focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PRICE_PRESETS.map((preset) => {
            const active = preset.min === valorMin && preset.max === valorMax;
            return (
              <button
                key={preset.label}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  onChange(
                    active
                      ? { valorMin: null, valorMax: null }
                      : { valorMin: preset.min, valorMax: preset.max },
                  );
                  setOpen(false);
                }}
                className={cn(
                  "h-8 rounded-full px-3 text-[11px] font-semibold transition-colors",
                  active
                    ? "bg-primary text-white"
                    : "bg-foreground/[0.05] text-foreground/65 hover:bg-foreground/10",
                )}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function PropertyFilterBar({
  filters,
  facets,
  total,
  onChange,
  onReset,
  className,
}: {
  filters: CatalogFilters;
  facets: CatalogFacets | undefined;
  total: number;
  onChange: (patch: Partial<CatalogFilters>) => void;
  onReset: () => void;
  className?: string;
}) {
  const [panelOpen, setPanelOpen] = useState(false);

  const totalActive = countActiveFilters(filters);
  const panelChips = activeChips(filters).filter((chip) => PANEL_ONLY_KEYS.includes(chip.key));
  const tipoOptions = [
    { value: "", label: "Todos os tipos" },
    ...(facets?.tipos ?? []).map((t) => ({ value: t, label: t })),
  ];
  const cidadeOptions = [
    { value: "", label: "Todas as cidades" },
    ...(facets?.cidades ?? []).map((c) => ({ value: c, label: c })),
  ];

  return (
    <div className={cn("catalog-filter-bar space-y-2", className)}>
      {/* Rail: rola na horizontal no mobile, quebra linha no desktop. */}
      <div className="-mx-4 lg:mx-0">
        <div
          role="toolbar"
          aria-label="Filtros do catálogo"
          className="catalog-filter-rail flex items-center gap-2 overflow-x-auto px-4 py-1 lg:flex-wrap lg:overflow-visible lg:px-0"
        >
          <FilterChip
            icon={SlidersHorizontal}
            label="Filtros"
            count={panelChips.length || undefined}
            active={panelOpen}
            onClick={() => setPanelOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={panelOpen}
            className="order-first lg:order-last lg:ml-auto"
          />

          <FilterChipSelect
            icon={Tag}
            label="Operação"
            emptyLabel="Venda e aluguel"
            value={filters.operacao}
            emptyValue="todos"
            options={OPERACAO_OPTIONS}
            onChange={(operacao) => onChange({ operacao, page: 0 })}
          />

          <FilterChipSelect
            icon={Home}
            label="Tipo"
            value={filters.tipo}
            emptyValue=""
            options={tipoOptions}
            onChange={(tipo) => onChange({ tipo, page: 0 })}
          />

          <FilterChipSelect
            icon={MapPin}
            label="Cidade"
            value={filters.cidade}
            emptyValue=""
            options={cidadeOptions}
            onChange={(cidade) => onChange({ cidade, page: 0 })}
          />

          <PriceChip
            valorMin={filters.valorMin}
            valorMax={filters.valorMax}
            onChange={(patch) => onChange({ ...patch, page: 0 })}
          />

          <FilterChipSelect
            icon={Bed}
            label="Dormitórios"
            value={
              filters.dormitoriosMin === null ? "" : String(Math.min(4, filters.dormitoriosMin))
            }
            emptyValue=""
            options={DORM_OPTIONS}
            onChange={(raw) => onChange({ dormitoriosMin: raw ? Number(raw) : null, page: 0 })}
          />

          <span aria-hidden className="hidden h-6 w-px shrink-0 bg-foreground/10 lg:block" />

          <FilterChipSelect
            icon={ArrowUpDown}
            label="Ordenar"
            emptyLabel="Mais recentes"
            value={filters.sort}
            emptyValue="recentes"
            options={SORT_OPTIONS}
            onChange={(sort) => onChange({ sort, page: 0 })}
            iconOnlyOnMobile
          />

          <FilterChipSelect
            icon={Archive}
            label="Catálogo"
            emptyLabel="Catálogo ativo"
            value={filters.arquivados}
            emptyValue="ocultar"
            options={ARQUIVADOS_OPTIONS}
            onChange={(arquivados) => onChange({ arquivados, page: 0 })}
            iconOnlyOnMobile
          />
        </div>
      </div>

      {(panelChips.length > 0 || totalActive > 0) && (
        <div className="flex flex-wrap items-center gap-1.5 px-0.5">
          {panelChips.map((chip) => (
            <button
              key={`${chip.key}-${chip.label}`}
              type="button"
              onClick={() =>
                onChange({
                  [chip.key]: DEFAULT_FILTERS[chip.key],
                  page: 0,
                } as Partial<CatalogFilters>)
              }
              className="inline-flex h-7 items-center gap-1 rounded-full border border-primary/20 bg-primary/[0.07] pl-2.5 pr-1.5 text-[11px] font-semibold text-primary transition hover:bg-primary/15"
            >
              {chip.label}
              <span className="grid size-4 place-items-center rounded-full bg-primary/10">
                <X className="size-2.5" strokeWidth={2.6} />
              </span>
            </button>
          ))}
          {totalActive > 0 ? (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex h-7 items-center rounded-full px-2.5 text-[11px] font-semibold text-foreground/50 transition hover:bg-foreground/[0.05] hover:text-foreground"
            >
              Limpar tudo ({totalActive})
            </button>
          ) : null}
        </div>
      )}

      <PropertyFiltersPanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        filters={filters}
        facets={facets}
        total={total}
        onApply={(next) => onChange(next)}
        onReset={onReset}
      />
    </div>
  );
}
