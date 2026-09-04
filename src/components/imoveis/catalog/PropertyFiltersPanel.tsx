import { useEffect, useState, type ReactNode } from "react";
import {
  Archive,
  ArrowUpDown,
  Bath,
  Bed,
  BedDouble,
  Car,
  ChevronDown,
  Globe,
  Home,
  MapPin,
  Maximize2,
  RotateCcw,
  Tag,
  Wallet,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  ARQUIVADOS_OPTIONS,
  DEFAULT_FILTERS,
  OPERACAO_OPTIONS,
  PRICE_PRESETS,
  SORT_OPTIONS,
  STATUS_OPTIONS,
  countActiveFilters,
  type CatalogFilters,
} from "@/lib/imoveis/filters";
import { cn } from "@/lib/utils";

export type CatalogFacets = { tipos: string[]; cidades: string[]; bairros: string[] };

function formatBRL(value: number | null): string {
  return value === null ? "" : `R$ ${value.toLocaleString("pt-BR")}`;
}

function parseDigits(raw: string): number | null {
  const digits = raw.replace(/\D/g, "");
  return digits ? Number(digits) : null;
}

function Section({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: typeof Tag;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <header className="flex items-center gap-2">
        <span className="grid size-6 place-items-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-3.5" strokeWidth={2.2} />
        </span>
        <h3 className="text-[12px] font-bold uppercase tracking-[0.14em] text-foreground/60">
          {title}
        </h3>
        {hint ? (
          <span className="ml-auto text-[11px] font-medium text-foreground/40">{hint}</span>
        ) : null}
      </header>
      {children}
    </section>
  );
}

/** Grupo de botões exclusivos (uma escolha). */
function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="grid gap-1 rounded-2xl bg-foreground/[0.05] p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "min-h-9 truncate rounded-xl px-2 text-[12px] font-semibold transition-all",
              active
                ? "bg-white text-primary shadow-[0_6px_16px_-8px_rgba(23,27,33,0.35)]"
                : "text-foreground/60 hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Mínimo de cômodos: Qualquer · 1+ · 2+ · 3+ · 4+ */
function MinStepper({
  label,
  icon: Icon,
  value,
  onChange,
  max = 4,
}: {
  label: string;
  icon: typeof Bed;
  value: number | null;
  onChange: (value: number | null) => void;
  max?: number;
}) {
  const steps = Array.from({ length: max }, (_, i) => i + 1);
  return (
    <div className="flex items-center gap-2">
      <span className="flex w-24 shrink-0 items-center gap-1.5 text-[12px] font-semibold text-foreground/65">
        <Icon className="size-3.5 text-foreground/45" />
        {label}
      </span>
      <div role="radiogroup" aria-label={`${label} (mínimo)`} className="flex flex-1 gap-1">
        <button
          type="button"
          role="radio"
          aria-checked={value === null}
          onClick={() => onChange(null)}
          className={cn(
            "h-8 flex-1 rounded-xl text-[11px] font-semibold transition-colors",
            value === null
              ? "bg-primary text-white"
              : "bg-foreground/[0.05] text-foreground/60 hover:bg-foreground/10",
          )}
        >
          Todos
        </button>
        {steps.map((step) => {
          const active = value === step;
          return (
            <button
              key={step}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(step)}
              className={cn(
                "h-8 flex-1 rounded-xl text-[12px] font-semibold tabular-nums transition-colors",
                active
                  ? "bg-primary text-white"
                  : "bg-foreground/[0.05] text-foreground/65 hover:bg-foreground/10",
              )}
            >
              {step}+
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PanelSelect({
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
    <label className="flex flex-col gap-1 text-[11px] font-semibold text-foreground/55">
      {label}
      <span className="relative">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-full appearance-none rounded-xl border border-foreground/[0.08] bg-white/80 pl-3 pr-9 text-[13px] font-medium text-foreground outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-foreground/40" />
      </span>
    </label>
  );
}

function PanelInput({
  label,
  value,
  onChange,
  placeholder,
  suffix,
}: {
  label: string;
  value: string;
  onChange: (raw: string) => void;
  placeholder?: string;
  suffix?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-[11px] font-semibold text-foreground/55">
      {label}
      <span className="relative">
        <input
          inputMode="numeric"
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            "h-10 w-full rounded-xl border border-foreground/[0.08] bg-white/80 px-3 text-[13px] font-medium text-foreground outline-none transition placeholder:text-foreground/35 focus:border-primary/40 focus:ring-2 focus:ring-primary/15",
            suffix && "pr-10",
          )}
        />
        {suffix ? (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-foreground/40">
            {suffix}
          </span>
        ) : null}
      </span>
    </label>
  );
}

export function PropertyFiltersPanel({
  open,
  onOpenChange,
  filters,
  facets,
  total,
  onApply,
  onReset,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: CatalogFilters;
  facets: CatalogFacets | undefined;
  total: number;
  onApply: (next: CatalogFilters) => void;
  onReset: () => void;
}) {
  const isMobile = useIsMobile();
  const [draft, setDraft] = useState<CatalogFilters>(filters);

  // Reabrir o painel sempre parte dos filtros aplicados (a URL).
  useEffect(() => {
    if (open) setDraft(filters);
  }, [open, filters]);

  const patch = (partial: Partial<CatalogFilters>) =>
    setDraft((current) => ({ ...current, ...partial }));
  const draftCount = countActiveFilters(draft);
  const withAll = (values: string[] | undefined, label: string) => [
    { value: "", label },
    ...(values ?? []).map((value) => ({ value, label: value })),
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        closeLabel="Fechar filtros"
        overlayClassName="!bg-[rgba(21,34,41,0.45)] backdrop-blur-[2px]"
        className={cn(
          "catalog-filters-sheet flex flex-col gap-0 border-white/70 bg-[#fbf8f4]/95 p-0 backdrop-blur-2xl",
          isMobile
            ? "inset-x-0 bottom-0 h-auto max-h-[88dvh] rounded-t-[28px] border-t"
            : "h-dvh !w-[min(92vw,26rem)] !max-w-none rounded-l-[28px] border-l",
        )}
      >
        {isMobile ? (
          <div
            aria-hidden
            className="mx-auto mt-2.5 h-1.5 w-12 shrink-0 rounded-full bg-foreground/15"
          />
        ) : null}

        <SheetHeader className="shrink-0 space-y-0.5 px-5 pb-3 pt-4 text-left">
          <SheetTitle className="text-lg font-semibold tracking-tight">Filtrar imóveis</SheetTitle>
          <SheetDescription className="text-[12px] text-foreground/50">
            {draftCount > 0
              ? `${draftCount} ${draftCount === 1 ? "filtro ativo" : "filtros ativos"}`
              : "Refine o catálogo por operação, tipo, valor e cômodos."}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 pb-6">
          <Section icon={Tag} title="Operação">
            <Segmented
              ariaLabel="Operação"
              value={draft.operacao}
              options={OPERACAO_OPTIONS}
              onChange={(operacao) => patch({ operacao })}
            />
          </Section>

          <Section icon={Home} title="Tipo de imóvel">
            <div className="flex flex-wrap gap-1.5">
              {[
                { value: "", label: "Todos" },
                ...(facets?.tipos ?? []).map((t) => ({ value: t, label: t })),
              ].map((option) => {
                const active = draft.tipo === option.value;
                return (
                  <button
                    key={option.value || "__all"}
                    type="button"
                    aria-pressed={active}
                    onClick={() => patch({ tipo: option.value })}
                    className={cn(
                      "h-8 rounded-full px-3 text-[12px] font-semibold transition-colors",
                      active
                        ? "bg-primary text-white shadow-[0_8px_18px_-8px_rgba(30,100,125,0.6)]"
                        : "bg-foreground/[0.05] text-foreground/65 hover:bg-foreground/10",
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </Section>

          <Section icon={MapPin} title="Localização">
            <div className="grid grid-cols-2 gap-2">
              <PanelSelect
                label="Cidade"
                value={draft.cidade}
                options={withAll(facets?.cidades, "Todas")}
                onChange={(cidade) => patch({ cidade })}
              />
              <PanelSelect
                label="Bairro"
                value={draft.bairro}
                options={withAll(facets?.bairros, "Todos")}
                onChange={(bairro) => patch({ bairro })}
              />
            </div>
          </Section>

          <Section icon={Wallet} title="Valor">
            <div className="grid grid-cols-2 gap-2">
              <PanelInput
                label="Mínimo"
                value={formatBRL(draft.valorMin)}
                placeholder="R$ 0"
                onChange={(raw) => patch({ valorMin: parseDigits(raw) })}
              />
              <PanelInput
                label="Máximo"
                value={formatBRL(draft.valorMax)}
                placeholder="Sem limite"
                onChange={(raw) => patch({ valorMax: parseDigits(raw) })}
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PRICE_PRESETS.map((preset) => {
                const active = preset.min === draft.valorMin && preset.max === draft.valorMax;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      patch(
                        active
                          ? { valorMin: null, valorMax: null }
                          : { valorMin: preset.min, valorMax: preset.max },
                      )
                    }
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
          </Section>

          <Section icon={BedDouble} title="Cômodos" hint="mínimo">
            <div className="space-y-2">
              <MinStepper
                label="Dormitórios"
                icon={Bed}
                value={draft.dormitoriosMin}
                onChange={(v) => patch({ dormitoriosMin: v })}
              />
              <MinStepper
                label="Suítes"
                icon={BedDouble}
                value={draft.suitesMin}
                onChange={(v) => patch({ suitesMin: v })}
              />
              <MinStepper
                label="Banheiros"
                icon={Bath}
                value={draft.banheirosMin}
                onChange={(v) => patch({ banheirosMin: v })}
              />
              <MinStepper
                label="Vagas"
                icon={Car}
                value={draft.vagasMin}
                onChange={(v) => patch({ vagasMin: v })}
              />
            </div>
          </Section>

          <Section icon={Maximize2} title="Área">
            <div className="grid grid-cols-2 gap-2">
              <PanelInput
                label="Mínima"
                suffix="m²"
                value={draft.areaMin === null ? "" : String(draft.areaMin)}
                placeholder="0"
                onChange={(raw) => patch({ areaMin: parseDigits(raw) })}
              />
              <PanelInput
                label="Máxima"
                suffix="m²"
                value={draft.areaMax === null ? "" : String(draft.areaMax)}
                placeholder="Sem limite"
                onChange={(raw) => patch({ areaMax: parseDigits(raw) })}
              />
            </div>
          </Section>

          <Section icon={Globe} title="Publicação e catálogo">
            <div className="grid grid-cols-2 gap-2">
              <PanelSelect
                label="Status nos sites"
                value={draft.status}
                options={STATUS_OPTIONS}
                onChange={(status) => patch({ status })}
              />
              <label className="flex flex-col gap-1 text-[11px] font-semibold text-foreground/55">
                <span className="flex items-center gap-1">
                  <Archive className="size-3" /> Catálogo
                </span>
                <Segmented
                  ariaLabel="Catálogo"
                  value={draft.arquivados}
                  options={ARQUIVADOS_OPTIONS}
                  onChange={(arquivados) => patch({ arquivados })}
                />
              </label>
            </div>
          </Section>

          <Section icon={ArrowUpDown} title="Ordenação">
            <Segmented
              ariaLabel="Ordenação"
              value={draft.sort}
              options={SORT_OPTIONS.slice(0, 3)}
              onChange={(sort) => patch({ sort })}
            />
            <Segmented
              ariaLabel="Ordenação por preço e área"
              value={draft.sort}
              options={SORT_OPTIONS.slice(3)}
              onChange={(sort) => patch({ sort })}
            />
          </Section>
        </div>

        <footer
          className="flex shrink-0 items-center gap-2 border-t border-foreground/[0.06] bg-white/70 px-5 py-3 backdrop-blur-xl"
          style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
        >
          <button
            type="button"
            onClick={() => {
              setDraft({ ...DEFAULT_FILTERS, q: filters.q, carteira: filters.carteira });
              onReset();
              onOpenChange(false);
            }}
            className="inline-flex h-11 items-center gap-1.5 rounded-2xl px-3.5 text-[12px] font-semibold text-foreground/60 transition hover:bg-foreground/[0.05] hover:text-foreground"
          >
            <RotateCcw className="size-3.5" /> Limpar
          </button>
          <button
            type="button"
            onClick={() => {
              onApply({ ...draft, page: 0 });
              onOpenChange(false);
            }}
            className="system-button inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl text-[13px] font-bold transition hover:brightness-110 active:scale-[0.99]"
          >
            Aplicar filtros
            {draftCount > 0 ? (
              <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-bold tabular-nums">
                {draftCount}
              </span>
            ) : null}
          </button>
          <span className="sr-only">{total} imóveis atualmente na lista</span>
        </footer>
      </SheetContent>
    </Sheet>
  );
}
