import { useEffect, useRef, useState } from "react";
import {
  Archive,
  ArrowUpDown,
  Bed,
  Hash,
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
import { codeSearchLabel, normalizePropertyCode } from "@/lib/imoveis/code-search";
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
  className,
}: {
  valorMin: number | null;
  valorMax: number | null;
  className?: string;
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
          className={className}
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

/** Campo de código exato no rail: Enter ou pausa curta aplica; Esc/X limpa. */
function CodeFilterInput({
  value,
  onApply,
  onInvalidChange,
}: {
  value: string;
  onApply: (codigo: string) => void;
  onInvalidChange: (invalid: boolean) => void;
}) {
  const [text, setText] = useState(value);
  const lastApplied = useRef(value);
  useEffect(() => {
    // Mudança vinda de fora (limpar tudo, voltar da ficha): mostra o valor atual.
    if (value !== lastApplied.current) {
      lastApplied.current = value;
      setText(value);
      onInvalidChange(false);
    }
  }, [value, onInvalidChange]);

  const apply = (raw: string) => {
    const trimmed = raw.trim();
    const code = trimmed ? normalizePropertyCode(trimmed) : "";
    onInvalidChange(code === null);
    if (code === null || code === lastApplied.current) return;
    lastApplied.current = code;
    onApply(code);
  };

  useEffect(() => {
    if (text.trim() === value) return;
    const timer = window.setTimeout(() => apply(text), 400);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const clear = () => {
    setText("");
    apply("");
  };
  const active = Boolean(value);

  return (
    <label
      data-active={active ? "true" : "false"}
      className={cn(
        "catalog-filter-chip relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border pl-1 pr-1.5 text-xs font-semibold transition-[background-color,color,border-color] duration-150 focus-within:ring-2 focus-within:ring-primary/40 focus-within:ring-offset-1",
        active
          ? "border-primary/80 bg-primary text-white"
          : "border-white/70 bg-white/60 text-foreground/70 shadow-[0_4px_14px_-8px_rgba(23,27,33,0.18)] backdrop-blur-md hover:border-primary/25 hover:bg-white/90",
      )}
    >
      <span
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-full",
          active ? "bg-white/18 text-white" : "bg-primary/10 text-primary",
        )}
      >
        <Hash className="size-3.5" strokeWidth={2.2} />
      </span>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        aria-label="Buscar pelo código exato"
        placeholder="Código"
        maxLength={12}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            apply(text);
          } else if (e.key === "Escape") {
            e.preventDefault();
            clear();
          }
        }}
        className={cn(
          "w-[4.5rem] bg-transparent outline-none tabular-nums",
          active ? "text-white placeholder:text-white/70" : "placeholder:text-foreground/60",
        )}
      />
      {text ? (
        <button
          type="button"
          aria-label="Limpar código"
          onClick={clear}
          className={cn(
            "grid size-6 place-items-center rounded-full transition",
            active ? "hover:bg-white/20" : "hover:bg-foreground/[0.06]",
          )}
        >
          <X className="size-3" strokeWidth={2.6} />
        </button>
      ) : (
        <span className="w-1" />
      )}
    </label>
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
  const [codeInvalid, setCodeInvalid] = useState(false);
  const codeActive = Boolean(filters.codigo);
  // Com código ativo os outros filtros ficam pausados: atenuados, mas clicáveis.
  const muted = codeActive ? "opacity-45 hover:opacity-80" : undefined;

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
            className={cn("-order-2 lg:order-last lg:ml-auto", muted)}
          />

          <div className="-order-1 shrink-0 lg:-order-1">
            <CodeFilterInput
              value={filters.codigo}
              onApply={(codigo) => onChange({ codigo, page: 0 })}
              onInvalidChange={setCodeInvalid}
            />
          </div>

          <FilterChipSelect
            className={muted}
            icon={Tag}
            label="Operação"
            emptyLabel="Venda e aluguel"
            value={filters.operacao}
            emptyValue="todos"
            options={OPERACAO_OPTIONS}
            onChange={(operacao) => onChange({ operacao, page: 0 })}
          />

          <FilterChipSelect
            className={muted}
            icon={Home}
            label="Tipo"
            value={filters.tipo}
            emptyValue=""
            options={tipoOptions}
            onChange={(tipo) => onChange({ tipo, page: 0 })}
          />

          <FilterChipSelect
            className={muted}
            icon={MapPin}
            label="Cidade"
            value={filters.cidade}
            emptyValue=""
            options={cidadeOptions}
            onChange={(cidade) => onChange({ cidade, page: 0 })}
          />

          <PriceChip
            className={muted}
            valorMin={filters.valorMin}
            valorMax={filters.valorMax}
            onChange={(patch) => onChange({ ...patch, page: 0 })}
          />

          <FilterChipSelect
            className={muted}
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
            className={muted}
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
            className={muted}
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

      {codeInvalid ? (
        <p role="alert" className="px-0.5 text-[11px] font-semibold text-destructive">
          Digite apenas números
        </p>
      ) : codeActive ? (
        <p role="status" className="px-0.5 text-[11px] font-semibold text-primary">
          Buscando só pelo {codeSearchLabel(filters.codigo, filters.carteira)} · outros filtros
          pausados
        </p>
      ) : null}

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
