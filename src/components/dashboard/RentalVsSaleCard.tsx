import { useState, type ReactNode } from "react";
import { AlertCircle, Loader2, SlidersHorizontal } from "lucide-react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  useRentalVsSale,
  type RentalVsSaleAgency,
  type RentalVsSalePeriod,
} from "@/hooks/useRentalVsSale";
import { chartCordial, chartMorar } from "@/lib/chart-palette";
import { cn } from "@/lib/utils";
import { useApp } from "@/store/app-store";

const PERIODS: Array<{ key: RentalVsSalePeriod; label: string }> = [
  { key: "mes", label: "Mês" },
  { key: "ano", label: "Ano" },
  { key: "custom", label: "Personalizado" },
];

const AGENCIES: Array<{ key: RentalVsSaleAgency; label: string }> = [
  { key: "todas", label: "Todas" },
  { key: "cordial", label: "Cordial" },
  { key: "morar", label: "Morar" },
];

const ALUGUEL = chartMorar;
const VENDA = chartCordial;

export function RentalVsSaleCard({ className }: { className?: string }) {
  const isMobile = useIsMobile();
  const selectedAgency = useApp((state) => state.agency) as RentalVsSaleAgency;

  const [period, setPeriod] = useState<RentalVsSalePeriod>("mes");
  const [agency, setAgency] = useState<RentalVsSaleAgency>("todas");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const effectiveAgency: RentalVsSaleAgency = agency === "todas" ? selectedAgency : agency;
  const result = useRentalVsSale({ period, agency: effectiveAgency, from, to });

  const filtersActive = period !== "mes" || agency !== "todas";
  const periodLabel = PERIODS.find((p) => p.key === period)?.label ?? "Mês";
  const share = result.total > 0 ? Math.round((result.aluguel / result.total) * 100) : 0;

  const filtersBody = (
    <div className="space-y-4">
      <FilterGroup label="Período">
        {PERIODS.map((option) => (
          <Chip
            key={option.key}
            active={period === option.key}
            onClick={() => setPeriod(option.key)}
          >
            {option.label}
          </Chip>
        ))}
      </FilterGroup>
      {period === "custom" ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/45">
            De
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="mt-1 w-full rounded-xl border border-white/70 bg-white/70 px-2 py-1.5 text-[12px] font-semibold text-foreground"
            />
          </label>
          <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/45">
            Até
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="mt-1 w-full rounded-xl border border-white/70 bg-white/70 px-2 py-1.5 text-[12px] font-semibold text-foreground"
            />
          </label>
        </div>
      ) : null}
      <FilterGroup label="Imobiliária">
        {AGENCIES.map((option) => (
          <Chip
            key={option.key}
            active={agency === option.key}
            onClick={() => setAgency(option.key)}
          >
            {option.label}
          </Chip>
        ))}
      </FilterGroup>
      {filtersActive ? (
        <button
          type="button"
          className="text-[11px] font-bold text-primary underline-offset-4 hover:underline"
          onClick={() => {
            setPeriod("mes");
            setAgency("todas");
            setFrom("");
            setTo("");
          }}
        >
          Limpar filtros
        </button>
      ) : null}
    </div>
  );

  const trigger = (
    <button
      type="button"
      aria-label="Filtros do comparativo aluguel x venda"
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
        "@container w-full min-w-0 overflow-hidden rounded-3xl border border-white/70 bg-white/70 p-4 shadow-[0_24px_60px_-32px_rgba(23,27,33,0.28)] backdrop-blur-xl sm:p-5",
        className,
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-stretch gap-3">
          <span
            aria-hidden="true"
            className="mt-1 w-1 shrink-0 rounded-full"
            style={{
              background: `linear-gradient(180deg, ${ALUGUEL} 0%, ${VENDA} 100%)`,
            }}
          />
          <div className="min-w-0">
            <h3 className="text-[1.45rem] font-black leading-[1.05] tracking-[-0.03em] text-foreground sm:text-[1.7rem]">
              Aluguel x venda
            </h3>
            <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.16em] text-foreground/40">
              {periodLabel} · {result.total} {result.total === 1 ? "atendimento" : "atendimentos"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {result.isFetching && !result.isLoading ? (
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

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat label="Aluguel" value={result.aluguel} color={ALUGUEL} />
        <Stat label="Venda" value={result.venda} color={VENDA} />
        <Stat label="% Aluguel" value={`${share}%`} hint="do período" color="rgba(42,48,56,0.35)" />
      </div>

      <div className="mt-4">
        {result.isLoading ? (
          <div className="h-48 animate-pulse rounded-2xl bg-foreground/5" />
        ) : result.isError ? (
          <div className="flex items-center gap-2 rounded-2xl bg-destructive/10 px-4 py-3 text-[12px] font-semibold text-destructive">
            <AlertCircle className="size-4" />
            {result.error instanceof Error
              ? result.error.message
              : "Não foi possível carregar os atendimentos."}
          </div>
        ) : result.total === 0 ? (
          <p className="rounded-2xl bg-foreground/[0.04] px-4 py-6 text-center text-[12px] font-semibold text-foreground/50">
            Sem atendimentos no período selecionado.
          </p>
        ) : (
          <div className="h-48 w-full sm:h-56">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <BarChart
                data={result.points}
                barCategoryGap="26%"
                barGap={3}
                margin={{ left: 0, right: 0, top: 8, bottom: 0 }}
              >
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                  minTickGap={12}
                  tick={{ fontSize: 10, fill: "rgba(42,48,56,0.45)", fontWeight: 700 }}
                />
                <Tooltip cursor={{ fill: "rgba(42,48,56,0.04)" }} content={<CompactTooltip />} />
                <Bar dataKey="aluguel" name="Aluguel" radius={[4, 4, 0, 0]} maxBarSize={26}>
                  {result.points.map((point) => (
                    <Cell key={point.key} fill={ALUGUEL} />
                  ))}
                </Bar>
                <Bar dataKey="venda" name="Venda" radius={[4, 4, 0, 0]} maxBarSize={26}>
                  {result.points.map((point) => (
                    <Cell key={point.key} fill={VENDA} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center gap-4">
        <LegendDot color={ALUGUEL} label="Aluguel" />
        <LegendDot color={VENDA} label="Venda" />
      </div>
    </section>
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
        <span className="size-2 rounded-full" style={{ background: color }} />
        {label}
      </p>
      <p className="mt-1 text-[1.6rem] font-black leading-none tracking-[-0.03em] tabular-nums text-foreground">
        {typeof value === "number" ? String(value).padStart(2, "0") : value}
      </p>
      {hint ? <p className="mt-0.5 text-[10px] font-semibold text-foreground/40">{hint}</p> : null}
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] font-bold text-foreground/50">
      <span className="size-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function CompactTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string | number; value?: number }>;
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  const aluguel = payload.find((item) => item.dataKey === "aluguel")?.value ?? 0;
  const venda = payload.find((item) => item.dataKey === "venda")?.value ?? 0;
  return (
    <div className="rounded-xl border border-white/70 bg-white/95 px-3 py-2 text-[11px] font-bold shadow-[0_18px_40px_-16px_rgba(23,27,33,0.25)]">
      <p className="mb-1 text-foreground/45">{label}</p>
      <p className="flex items-center gap-1.5 tabular-nums text-foreground">
        <span className="size-2 rounded-full" style={{ background: ALUGUEL }} />
        Aluguel {aluguel}
      </p>
      <p className="mt-0.5 flex items-center gap-1.5 tabular-nums text-foreground">
        <span className="size-2 rounded-full" style={{ background: VENDA }} />
        Venda {venda}
      </p>
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/45">
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
        "rounded-full px-3 py-1.5 text-[11px] font-bold transition",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-foreground/[0.05] text-foreground/60 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
