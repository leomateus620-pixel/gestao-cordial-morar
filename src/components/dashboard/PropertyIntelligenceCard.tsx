import { useMemo, useState, type ReactNode } from "react";
import { AlertCircle, Building2, Loader2, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePropertyPortfolioAnalytics } from "@/hooks/usePropertyPortfolio";
import { chartCordial, chartMorar } from "@/lib/chart-palette";
import { cn } from "@/lib/utils";
import {
  buildPortfolioInsights,
  EMPTY_PORTFOLIO_ANALYTICS,
  type PortfolioOperationFilter,
  type PortfolioProviderFilter,
} from "@/types/portfolio";
import { PortfolioRegionChart } from "./PortfolioRegionChart";
import { PortfolioTopValues } from "./PortfolioTopValues";

const PROVIDERS: Array<{ key: PortfolioProviderFilter; label: string }> = [
  { key: "todos", label: "Portfólio combinado" },
  { key: "cordial", label: "Cordial" },
  { key: "morar", label: "Morar" },
  { key: "ambos", label: "Publicado nos dois" },
];

const OPERATIONS: Array<{ key: PortfolioOperationFilter; label: string }> = [
  { key: "todos", label: "Venda e aluguel" },
  { key: "venda", label: "Venda" },
  { key: "aluguel", label: "Aluguel" },
];

const providerLabel = (key: PortfolioProviderFilter) =>
  PROVIDERS.find((item) => item.key === key)?.label ?? "Portfólio combinado";

export function PropertyIntelligenceCard({ className }: { className?: string }) {
  const isMobile = useIsMobile();
  const [provider, setProvider] = useState<PortfolioProviderFilter>("todos");
  const [operation, setOperation] = useState<PortfolioOperationFilter>("todos");
  const [valuesTab, setValuesTab] = useState<"venda" | "aluguel">("venda");

  const query = usePropertyPortfolioAnalytics({ provider, operation });
  const data = query.data ?? EMPTY_PORTFOLIO_ANALYTICS;
  const { summary, regions } = data;
  const insights = useMemo(() => buildPortfolioInsights(data), [data]);

  const filtersActive = provider !== "todos" || operation !== "todos";
  const leader = regions[0];

  const activeValuesTab: "venda" | "aluguel" =
    operation === "venda" ? "venda" : operation === "aluguel" ? "aluguel" : valuesTab;
  const topItems =
    activeValuesTab === "venda" ? data.topValues.sale : data.topValues.rental;

  const clearFilters = () => {
    setProvider("todos");
    setOperation("todos");
  };

  const filtersBody = (
    <div className="space-y-4">
      <FilterGroup label="Imobiliária">
        {PROVIDERS.map((option) => (
          <Chip
            key={option.key}
            active={provider === option.key}
            onClick={() => setProvider(option.key)}
          >
            {option.label}
          </Chip>
        ))}
      </FilterGroup>
      <FilterGroup label="Operação">
        {OPERATIONS.map((option) => (
          <Chip
            key={option.key}
            active={operation === option.key}
            onClick={() => setOperation(option.key)}
          >
            {option.label}
          </Chip>
        ))}
      </FilterGroup>
      {filtersActive ? (
        <button
          type="button"
          className="text-[11px] font-bold text-primary underline-offset-4 hover:underline"
          onClick={clearFilters}
        >
          Limpar filtros
        </button>
      ) : null}
    </div>
  );

  const trigger = (
    <button
      type="button"
      aria-label="Filtros da inteligência dos imóveis"
      className="relative inline-flex size-9 items-center justify-center rounded-full border border-white/70 bg-white/70 text-foreground/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] transition hover:text-foreground"
    >
      <SlidersHorizontal className="size-4" />
      {filtersActive ? (
        <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-primary" />
      ) : null}
    </button>
  );

  return (
    <section
      className={cn(
        "w-full min-w-0 overflow-hidden rounded-3xl border border-white/70 bg-white/70 p-4 shadow-[0_24px_60px_-32px_rgba(23,27,33,0.28)] backdrop-blur-xl sm:p-5 lg:col-span-2",
        className,
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 bg-white/60 px-2.5 py-1">
            <span className="flex -space-x-1">
              <span
                className="size-2 rounded-full ring-1 ring-white"
                style={{ background: chartCordial }}
              />
              <span
                className="size-2 rounded-full ring-1 ring-white"
                style={{ background: chartMorar }}
              />
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-foreground/60">
              Cordial × Morar
            </span>
          </div>
          <h2 className="mt-1.5 text-base font-semibold tracking-tight">Inteligência dos imóveis</h2>
          <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.16em] text-foreground/40">
            {providerLabel(provider)} · {summary.uniqueProperties}{" "}
            {summary.uniqueProperties === 1 ? "imóvel" : "imóveis"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {query.isFetching && !query.isLoading ? (
            <Loader2 className="size-4 animate-spin text-primary motion-reduce:animate-none" />
          ) : null}
          {isMobile ? (
            <Sheet>
              <SheetTrigger asChild>{trigger}</SheetTrigger>
              <SheetContent
                side="bottom"
                className="rounded-t-[2rem] border-white/60 bg-background/95 p-5 backdrop-blur-2xl"
              >
                <SheetHeader className="mb-4 text-left">
                  <SheetTitle>Filtros</SheetTitle>
                </SheetHeader>
                {filtersBody}
              </SheetContent>
            </Sheet>
          ) : (
            <Popover>
              <PopoverTrigger asChild>{trigger}</PopoverTrigger>
              <PopoverContent align="end" className="w-72 rounded-2xl p-4">
                {filtersBody}
              </PopoverContent>
            </Popover>
          )}
        </div>
      </header>

      {filtersActive ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {provider !== "todos" ? (
            <ActiveChip label={providerLabel(provider)} onRemove={() => setProvider("todos")} />
          ) : null}
          {operation !== "todos" ? (
            <ActiveChip
              label={operation === "venda" ? "Venda" : "Aluguel"}
              onRemove={() => setOperation("todos")}
            />
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Imóveis" value={summary.uniqueProperties} color="rgba(42,48,56,0.35)" />
        <Stat label="Venda" value={summary.saleProperties} color={chartCordial} />
        <Stat label="Aluguel" value={summary.rentalProperties} color={chartMorar} />
        <Stat
          label="Maior concentração"
          value={leader ? `${leader.percentage.toLocaleString("pt-BR")}%` : "—"}
          hint={leader?.label ?? "Sem bairro informado"}
          color="rgba(42,48,56,0.35)"
        />
      </div>

      <div className="mt-4">
        {query.isLoading ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="h-56 animate-pulse rounded-2xl bg-foreground/5" />
            <div className="h-56 animate-pulse rounded-2xl bg-foreground/5" />
          </div>
        ) : query.isError ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-destructive/10 px-4 py-3 text-[12px] font-semibold text-destructive">
            <span className="flex items-center gap-2">
              <AlertCircle className="size-4" />
              Não foi possível carregar o portfólio.
            </span>
            <button
              type="button"
              className="underline underline-offset-4"
              onClick={() => query.refetch()}
            >
              Tentar novamente
            </button>
          </div>
        ) : summary.uniqueProperties === 0 ? (
          <div className="rounded-2xl bg-foreground/[0.04] px-4 py-8 text-center">
            <Building2 className="mx-auto size-5 text-foreground/30" />
            <p className="mt-2 text-[12px] font-semibold text-foreground/50">
              Nenhum imóvel publicado neste recorte.
            </p>
            {filtersActive ? (
              <button
                type="button"
                className="mt-2 text-[11px] font-bold text-primary underline-offset-4 hover:underline"
                onClick={clearFilters}
              >
                Limpar filtros
              </button>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="min-w-0">
              <SubTitle>Bairros e loteamentos</SubTitle>
              <PortfolioRegionChart
                regions={regions}
                provider={provider}
                operation={operation}
              />
              {summary.missingRegion > 0 ? (
                <p className="mt-2 text-[10px] font-semibold text-foreground/35">
                  {summary.missingRegion}{" "}
                  {summary.missingRegion === 1 ? "imóvel sem bairro" : "imóveis sem bairro"} informado
                </p>
              ) : null}
            </div>

            <div className="min-w-0">
              <div className="mb-2 flex items-center justify-between gap-2">
                <SubTitle className="mb-0">Top 5 valores</SubTitle>
                {operation === "todos" ? (
                  <div className="inline-flex rounded-full bg-foreground/[0.06] p-0.5">
                    {(["venda", "aluguel"] as const).map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setValuesTab(tab)}
                        className={cn(
                          "rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] transition",
                          activeValuesTab === tab
                            ? "bg-white text-foreground shadow-sm"
                            : "text-foreground/45",
                        )}
                      >
                        {tab === "venda" ? "Venda" : "Aluguel"}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <PortfolioTopValues
                items={topItems}
                operationLabel={activeValuesTab === "venda" ? "Venda" : "Aluguel"}
              />
            </div>
          </div>
        )}
      </div>

      {insights.length > 0 && !query.isLoading && !query.isError ? (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-foreground/5 pt-3 text-[11px] text-foreground/55">
          <Sparkles className="size-3 text-foreground/40" />
          {insights.map((insight) => (
            <span key={insight.id}>{insight.text}</span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function SubTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/45",
        className,
      )}
    >
      {children}
    </p>
  );
}

function Stat({
  label,
  value,
  color,
  hint,
}: {
  label: string;
  value: number | string;
  color: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl bg-foreground/[0.035] px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/45">
        <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />
        <span className="truncate">{label}</span>
      </p>
      <p className="mt-1 text-[1.6rem] font-black leading-none tracking-[-0.03em] tabular-nums text-foreground">
        {value}
      </p>
      {hint ? (
        <p className="mt-0.5 truncate text-[10px] font-semibold text-foreground/40">{hint}</p>
      ) : null}
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/45">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-2.5 py-1 text-[11px] font-bold transition",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-foreground/[0.06] text-foreground/60 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function ActiveChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className="inline-flex items-center gap-1 rounded-full bg-foreground/[0.06] px-2.5 py-1 text-[11px] font-bold text-foreground/65 transition hover:text-foreground"
    >
      {label}
      <X className="size-3" />
    </button>
  );
}
