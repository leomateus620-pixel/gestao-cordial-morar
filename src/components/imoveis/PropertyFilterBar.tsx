import { useEffect, useState } from "react";
import { Loader2, Search, SlidersHorizontal, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DEFAULT_FILTERS,
  activeChips,
  countActiveAdvanced,
  type CatalogFilters,
} from "@/lib/imoveis/filters";

type Facets = { tipos: string[]; cidades: string[]; bairros: string[] };

const STATUS_OPTIONS = [
  { value: "", label: "Qualquer status" },
  { value: "published", label: "Publicado" },
  { value: "pending", label: "Pendente" },
  { value: "error", label: "Com erro" },
  { value: "out_of_sync", label: "Divergente" },
  { value: "draft", label: "Rascunho" },
];

const SORT_OPTIONS: Array<{ value: CatalogFilters["sort"]; label: string }> = [
  { value: "recentes", label: "Mais recentes" },
  { value: "codigo", label: "Código" },
  { value: "preco_asc", label: "Menor preço" },
  { value: "preco_desc", label: "Maior preço" },
  { value: "area_desc", label: "Maior área" },
];

function NumberField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-[11px] font-semibold text-foreground/60">
      {label}
      <input
        inputMode="numeric"
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => {
          const raw = e.target.value.replace(/\D/g, "");
          onChange(raw ? Number(raw) : null);
        }}
        className="rounded-xl bg-white/70 px-3 py-2 text-sm font-medium text-foreground outline-none ring-1 ring-white/60 focus:ring-primary/40"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-[11px] font-semibold text-foreground/60">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl bg-white/70 px-3 py-2 text-sm font-medium text-foreground outline-none ring-1 ring-white/60 focus:ring-primary/40"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

const PRICE_PRESETS: Array<{ label: string; min: number | null; max: number | null }> = [
  { label: "Até R$ 200 mil", min: null, max: 200_000 },
  { label: "R$ 200 mil – 350 mil", min: 200_000, max: 350_000 },
  { label: "R$ 350 mil – 500 mil", min: 350_000, max: 500_000 },
  { label: "R$ 500 mil – 600 mil", min: 500_000, max: 600_000 },
  { label: "R$ 600 mil – 800 mil", min: 600_000, max: 800_000 },
  { label: "R$ 800 mil – 1 mi", min: 800_000, max: 1_000_000 },
  { label: "Acima de R$ 1 mi", min: 1_000_000, max: null },
];

function formatBRL(value: number | null): string {
  return value === null ? "" : `R$ ${value.toLocaleString("pt-BR")}`;
}

function parseBRL(raw: string): number | null {
  const digits = raw.replace(/\D/g, "");
  return digits ? Number(digits) : null;
}

/** Faixa de valor visível na barra: presets rápidos + digitação livre. */
function PriceRangeFilter({
  valorMin,
  valorMax,
  onChange,
}: {
  valorMin: number | null;
  valorMax: number | null;
  onChange: (patch: { valorMin: number | null; valorMax: number | null }) => void;
}) {
  const label =
    valorMin === null && valorMax === null
      ? "Valor"
      : valorMin !== null && valorMax !== null
        ? `${formatBRL(valorMin)} – ${formatBRL(valorMax)}`
        : valorMin !== null
          ? `A partir de ${formatBRL(valorMin)}`
          : `Até ${formatBRL(valorMax)}`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="glass-panel inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold">
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(92vw,22rem)] space-y-3 rounded-3xl p-4">
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-foreground/60">
            Valor mínimo
            <input
              inputMode="numeric"
              value={formatBRL(valorMin)}
              placeholder="R$ 0"
              onChange={(e) => onChange({ valorMin: parseBRL(e.target.value), valorMax })}
              className="rounded-xl bg-white/70 px-3 py-2 text-sm font-medium text-foreground outline-none ring-1 ring-white/60 focus:ring-primary/40"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-foreground/60">
            Valor máximo
            <input
              inputMode="numeric"
              value={formatBRL(valorMax)}
              placeholder="Sem limite"
              onChange={(e) => onChange({ valorMin, valorMax: parseBRL(e.target.value) })}
              className="rounded-xl bg-white/70 px-3 py-2 text-sm font-medium text-foreground outline-none ring-1 ring-white/60 focus:ring-primary/40"
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PRICE_PRESETS.map((preset) => {
            const active = preset.min === valorMin && preset.max === valorMax;
            return (
              <button
                key={preset.label}
                onClick={() => onChange({ valorMin: preset.min, valorMax: preset.max })}
                className={
                  "rounded-full px-3 py-1.5 text-[11px] font-semibold transition " +
                  (active
                    ? "bg-primary text-primary-foreground"
                    : "bg-foreground/[0.05] text-foreground/65 hover:bg-foreground/10")
                }
              >
                {preset.label}
              </button>
            );
          })}
        </div>
        {(valorMin !== null || valorMax !== null) && (
          <button
            onClick={() => onChange({ valorMin: null, valorMax: null })}
            className="text-xs font-semibold text-foreground/55"
          >
            Limpar faixa de valor
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function PropertyFilterBar({
  filters,
  facets,
  total,
  loading,
  onChange,
  onReset,
}: {
  filters: CatalogFilters;
  facets: Facets | undefined;
  total: number;
  loading?: boolean;
  onChange: (patch: Partial<CatalogFilters>) => void;
  onReset: () => void;
}) {
  const [term, setTerm] = useState(filters.q);
  const [draft, setDraft] = useState(filters);

  useEffect(() => setTerm(filters.q), [filters.q]);
  useEffect(() => setDraft(filters), [filters]);

  // Busca só dispara depois que a digitação para: evita uma consulta por tecla.
  useEffect(() => {
    if (term === filters.q) return;
    const timer = setTimeout(() => onChange({ q: term, page: 0 }), 300);
    return () => clearTimeout(timer);
  }, [term, filters.q, onChange]);

  const chips = activeChips(filters);
  const advanced = countActiveAdvanced(filters);
  const listOptions = (values: string[] | undefined, label: string) => [
    { value: "", label },
    ...(values ?? []).map((value) => ({ value, label: value })),
  ];

  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-2xl bg-white/60 px-3 py-2 backdrop-blur">
          <Search className="size-4 shrink-0 text-foreground/40" />
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Código, referência, bairro, cidade, tipo ou endereço…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-foreground/35"
          />
          {term && (
            <button onClick={() => setTerm("")} aria-label="Limpar busca">
              <X className="size-4 text-foreground/40" />
            </button>
          )}
          {loading && <Loader2 className="size-4 animate-spin text-foreground/35" />}
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <button className="glass-panel inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold">
              <SlidersHorizontal className="size-4" />
              Filtros
              {advanced > 0 && (
                <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
                  {advanced}
                </span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[min(92vw,26rem)] space-y-3 rounded-3xl p-4">
            <div className="grid grid-cols-2 gap-2">
              <SelectField
                label="Bairro"
                value={draft.bairro}
                options={listOptions(facets?.bairros, "Todos")}
                onChange={(bairro) => setDraft((d) => ({ ...d, bairro }))}
              />
              <SelectField
                label="Status de publicação"
                value={draft.status}
                options={STATUS_OPTIONS}
                onChange={(status) => setDraft((d) => ({ ...d, status }))}
              />
              <NumberField
                label="Dormitórios (mín.)"
                value={draft.dormitoriosMin}
                onChange={(dormitoriosMin) => setDraft((d) => ({ ...d, dormitoriosMin }))}
              />
              <NumberField
                label="Suítes (mín.)"
                value={draft.suitesMin}
                onChange={(suitesMin) => setDraft((d) => ({ ...d, suitesMin }))}
              />
              <NumberField
                label="Banheiros (mín.)"
                value={draft.banheirosMin}
                onChange={(banheirosMin) => setDraft((d) => ({ ...d, banheirosMin }))}
              />
              <NumberField
                label="Vagas (mín.)"
                value={draft.vagasMin}
                onChange={(vagasMin) => setDraft((d) => ({ ...d, vagasMin }))}
              />
              <NumberField
                label="Área mínima (m²)"
                value={draft.areaMin}
                onChange={(areaMin) => setDraft((d) => ({ ...d, areaMin }))}
              />
              <NumberField
                label="Área máxima (m²)"
                value={draft.areaMax}
                onChange={(areaMax) => setDraft((d) => ({ ...d, areaMax }))}
              />
            </div>
            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                onClick={() => {
                  setDraft({ ...DEFAULT_FILTERS, q: filters.q });
                  onReset();
                }}
                className="text-xs font-semibold text-foreground/55"
              >
                Limpar filtros
              </button>
              <button
                onClick={() => onChange({ ...draft, page: 0 })}
                className="rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground"
              >
                Aplicar
              </button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SelectField
          label=""
          value={filters.carteira}
          options={[
            { value: "todas", label: "Todas as carteiras" },
            { value: "cordial", label: "Cordial" },
            { value: "morar", label: "Morar" },
            { value: "ambas", label: "Cordial + Morar" },
          ]}
          onChange={(carteira) => onChange({ carteira: carteira as CatalogFilters["carteira"], page: 0 })}
        />
        <SelectField
          label=""
          value={filters.operacao}
          options={[
            { value: "todos", label: "Venda e aluguel" },
            { value: "venda", label: "Venda" },
            { value: "aluguel", label: "Aluguel" },
          ]}
          onChange={(operacao) => onChange({ operacao: operacao as CatalogFilters["operacao"], page: 0 })}
        />
        <SelectField
          label=""
          value={filters.tipo}
          options={listOptions(facets?.tipos, "Todos os tipos")}
          onChange={(tipo) => onChange({ tipo, page: 0 })}
        />
        <SelectField
          label=""
          value={filters.cidade}
          options={listOptions(facets?.cidades, "Todas as cidades")}
          onChange={(cidade) => onChange({ cidade, page: 0 })}
        />
        <SelectField
          label=""
          value={filters.sort}
          options={SORT_OPTIONS}
          onChange={(sort) => onChange({ sort: sort as CatalogFilters["sort"], page: 0 })}
        />
        <span className="ml-auto text-[11px] font-medium text-foreground/45">
          {total} {total === 1 ? "imóvel" : "imóveis"}
        </span>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <button
              key={`${chip.key}-${chip.label}`}
              onClick={() => onChange({ [chip.key]: DEFAULT_FILTERS[chip.key], page: 0 } as Partial<CatalogFilters>)}
              className="glass-panel inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold text-foreground/70"
            >
              {chip.label}
              <X className="size-3" />
            </button>
          ))}
          <button onClick={onReset} className="text-[11px] font-semibold text-primary">
            Limpar tudo
          </button>
        </div>
      )}
    </div>
  );
}
