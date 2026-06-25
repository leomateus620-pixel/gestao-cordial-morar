import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  BarChart3,
  CalendarRange,
  Loader2,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Sector, type PieSectorDataItem } from "recharts";
import { CLIENTS_QUERY_KEY } from "@/hooks/useClients";
import { useSession } from "@/lib/auth-mock";
import {
  chartCordial,
  chartGraphite,
  chartMorar,
  chartMuted,
  chartSystem,
} from "@/lib/chart-palette";
import { listClients } from "@/lib/clients/clients.functions";
import { cn } from "@/lib/utils";
import { clientMatchesBrand } from "@/services/clients";
import { useApp } from "@/store/app-store";
import { leadOriginLabel, leadOriginOptions, type Client, type LeadOrigin } from "@/types/client";

type PeriodMode = "week" | "month" | "year" | "custom";

type PeriodRange = {
  start: Date;
  end: Date;
  invalid: boolean;
};

type LeadOriginRow = {
  origin: LeadOrigin;
  label: string;
  shortLabel: string;
  value: number;
  percent: number;
  color: string;
  softColor: string;
  glowColor: string;
  rank: number | null;
  insight: string;
};

const PERIOD_OPTIONS: Array<{ key: PeriodMode; label: string; shortLabel: string }> = [
  { key: "week", label: "Semana", shortLabel: "Semana" },
  { key: "month", label: "Mês", shortLabel: "Mês" },
  { key: "year", label: "Ano", shortLabel: "Ano" },
  { key: "custom", label: "Personalizado", shortLabel: "Personal." },
];

const ORIGIN_VISUALS: Record<
  LeadOrigin,
  { color: string; softColor: string; glowColor: string; shortLabel: string }
> = {
  indicacao: {
    color: chartMorar,
    softColor: "rgba(224,122,46,0.13)",
    glowColor: "rgba(224,122,46,0.3)",
    shortLabel: "Indicação",
  },
  instagram: {
    color: "#C45A8B",
    softColor: "rgba(196,90,139,0.13)",
    glowColor: "rgba(196,90,139,0.28)",
    shortLabel: "Instagram",
  },
  portal: {
    color: chartCordial,
    softColor: "rgba(43,127,163,0.13)",
    glowColor: "rgba(43,127,163,0.28)",
    shortLabel: "Portais",
  },
  site: {
    color: chartSystem,
    softColor: "rgba(30,100,125,0.13)",
    glowColor: "rgba(30,100,125,0.28)",
    shortLabel: "Site",
  },
  whatsapp: {
    color: "#2F9E68",
    softColor: "rgba(47,158,104,0.13)",
    glowColor: "rgba(47,158,104,0.28)",
    shortLabel: "WhatsApp",
  },
  presencial: {
    color: "#D6A437",
    softColor: "rgba(214,164,55,0.14)",
    glowColor: "rgba(214,164,55,0.28)",
    shortLabel: "Presencial",
  },
  outro: {
    color: chartMuted,
    softColor: "rgba(138,143,152,0.14)",
    glowColor: "rgba(138,143,152,0.22)",
    shortLabel: "Outros",
  },
};

const EMPTY_CLIENTS: Client[] = [];
const MS_DAY = 24 * 60 * 60 * 1000;
const RADIAN = Math.PI / 180;
const BR_DATE_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function LeadOriginCard({ className }: { className?: string }) {
  const session = useSession();
  const agency = useApp((state) => state.agency);
  const [periodMode, setPeriodMode] = useState<PeriodMode>("month");
  const [customStart, setCustomStart] = useState(() => toDateInputValue(startOfYear(new Date())));
  const [customEnd, setCustomEnd] = useState(() => toDateInputValue(new Date()));
  const [hoveredOrigin, setHoveredOrigin] = useState<LeadOrigin | null>(null);
  const [selectedOrigin, setSelectedOrigin] = useState<LeadOrigin | null>(null);

  const clientsQuery = useQuery({
    queryKey: CLIENTS_QUERY_KEY,
    queryFn: () => listClients(),
    enabled: Boolean(session),
    staleTime: 15_000,
  });

  const clients = clientsQuery.data ?? EMPTY_CLIENTS;
  const scopedClients = useMemo(
    () => clients.filter((client) => clientMatchesBrand(client, agency)),
    [agency, clients],
  );
  const periodRange = useMemo(
    () => getPeriodRange(periodMode, customStart, customEnd),
    [customEnd, customStart, periodMode],
  );
  const periodLabel = useMemo(
    () => formatPeriodLabel(periodMode, periodRange),
    [periodMode, periodRange],
  );
  const { rows, chartRows, total } = useMemo(
    () => buildLeadOriginRows(scopedClients, periodRange),
    [periodRange, scopedClients],
  );
  const focusedOrigin = hoveredOrigin ?? selectedOrigin;
  const activeIndex = focusedOrigin
    ? chartRows.findIndex((row) => row.origin === focusedOrigin)
    : -1;
  const activeRow = activeIndex >= 0 ? chartRows[activeIndex] : null;
  const leader = rows.find((row) => row.value > 0) ?? null;
  const second = rows.find((row) => row.value > 0 && row.origin !== leader?.origin) ?? null;
  const hasAnyLead = scopedClients.length > 0;
  const hasFilteredData = total > 0;
  const shouldAnimate =
    typeof window !== "undefined"
      ? !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      : false;
  const errorMessage =
    clientsQuery.error instanceof Error
      ? clientsQuery.error.message
      : "Não foi possível carregar os leads.";

  function toggleOrigin(origin: LeadOrigin) {
    setSelectedOrigin((current) => (current === origin ? null : origin));
  }

  if (clientsQuery.isLoading) {
    return <LeadOriginSkeleton className={className} />;
  }

  return (
    <section
      className={cn(
        "relative w-full min-w-0 overflow-hidden rounded-3xl p-3 shadow-[0_28px_72px_-30px_rgba(23,27,33,0.3)] sm:p-5",
        className,
      )}
      style={{
        background:
          "linear-gradient(145deg, rgba(255,255,255,0.86) 0%, rgba(248,252,253,0.72) 45%, rgba(255,246,238,0.76) 100%)",
        backdropFilter: "blur(22px) saturate(152%)",
        border: "1px solid rgba(255,255,255,0.7)",
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-5 top-0 h-px"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.95), transparent)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-24 size-56 rounded-full opacity-60 blur-3xl"
        style={{ background: "rgba(95,175,199,0.16)" }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 -left-20 size-56 rounded-full opacity-55 blur-3xl"
        style={{ background: "rgba(240,168,109,0.14)" }}
      />

      <header className="relative z-10 flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/10 bg-white/60 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-primary shadow-[0_10px_24px_-20px_rgba(30,100,125,0.7)]">
            <Sparkles className="size-3 text-[var(--system-accent-dark)]" />
            Inteligência comercial
          </div>
          <h3 className="mt-3 text-[1.32rem] font-black leading-tight tracking-tight text-foreground sm:text-2xl">
            Origem dos leads
          </h3>
          <p className="mt-1.5 max-w-[38rem] text-sm leading-relaxed text-foreground/58">
            Distribuição dos contatos por canal no período selecionado.
          </p>
          {!clientsQuery.isError && hasFilteredData ? (
            <p className="mt-3 max-w-[34rem] text-[12px] font-semibold leading-relaxed text-foreground/62">
              {buildExecutiveInsight(leader, second)}
            </p>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col items-start gap-2 lg:items-end">
          <div className="inline-flex min-w-0 items-center gap-2 rounded-2xl border border-white/70 bg-white/62 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.88)]">
            {clientsQuery.isFetching && !clientsQuery.isLoading ? (
              <Loader2 className="size-4 animate-spin text-primary motion-reduce:animate-none" />
            ) : (
              <CalendarRange className="size-4 text-primary" />
            )}
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-[0.14em] text-foreground/42">
                Período ativo
              </p>
              <p className="truncate text-[11px] font-black text-foreground">{periodLabel}</p>
            </div>
          </div>

          <PeriodSelector
            value={periodMode}
            onChange={(next) => {
              setPeriodMode(next);
              setHoveredOrigin(null);
            }}
          />
        </div>
      </header>

      {periodMode === "custom" ? (
        <div className="relative z-10 mt-3 grid gap-2 rounded-2xl border border-white/70 bg-white/44 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] sm:grid-cols-2">
          <DateField
            label="Início"
            value={customStart}
            max={customEnd || undefined}
            onChange={(value) => setCustomStart(value)}
          />
          <DateField
            label="Fim"
            value={customEnd}
            min={customStart || undefined}
            onChange={(value) => setCustomEnd(value)}
          />
          {periodRange.invalid ? (
            <p className="sm:col-span-2 rounded-xl bg-amber-50/80 px-3 py-2 text-[11px] font-semibold text-amber-800">
              Ajuste o intervalo personalizado para visualizar a origem dos leads.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="relative z-10 mt-5">
        {clientsQuery.isError ? (
          <LeadOriginError message={errorMessage} />
        ) : !hasAnyLead ? (
          <LeadOriginEmpty
            title="Nenhum lead registrado neste período."
            text="Quando novos contatos forem cadastrados, a distribuição por origem aparecerá aqui."
          />
        ) : !hasFilteredData ? (
          <LeadOriginEmpty
            title="Sem dados para o período selecionado."
            text="Ajuste o filtro para visualizar a origem dos leads."
            filtered
          />
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-3">
              <SummaryTile
                label="Total"
                value={String(total)}
                detail={leadWord(total)}
                color={chartSystem}
              />
              <SummaryTile
                label="Canal líder"
                value={leader?.shortLabel ?? "-"}
                detail={leader ? `${formatPercent(leader.percent)}% do período` : "Sem dados"}
                color={leader?.color ?? chartSystem}
              />
              <SummaryTile
                label="Origens ativas"
                value={String(chartRows.length)}
                detail="canais com leads"
                color={chartGraphite}
              />
            </div>

            <div className="mt-4 rounded-[1.35rem] border border-white/72 bg-white/44 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.86)] sm:p-3">
              <div className="relative h-[17.5rem] min-w-0 sm:h-[19rem]">
                <div
                  aria-hidden="true"
                  className="absolute left-1/2 top-[59%] h-12 w-56 max-w-[76%] -translate-x-1/2 rounded-full blur-2xl"
                  style={{
                    background: activeRow ? activeRow.glowColor : "rgba(30,100,125,0.16)",
                  }}
                />
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <PieChart accessibilityLayer margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                    <defs>
                      {chartRows.map((row) => (
                        <linearGradient
                          key={row.origin}
                          id={`lead-origin-gradient-${row.origin}`}
                          x1="0"
                          y1="0"
                          x2="1"
                          y2="1"
                        >
                          <stop offset="0%" stopColor={row.color} stopOpacity={1} />
                          <stop offset="62%" stopColor={row.color} stopOpacity={0.86} />
                          <stop offset="100%" stopColor={row.color} stopOpacity={0.62} />
                        </linearGradient>
                      ))}
                    </defs>
                    <Pie
                      data={chartRows}
                      dataKey="value"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      innerRadius={68}
                      outerRadius={106}
                      paddingAngle={chartRows.length > 1 ? 3 : 0}
                      cornerRadius={8}
                      activeIndex={activeIndex}
                      activeShape={renderActiveSector}
                      isAnimationActive={shouldAnimate}
                      animationBegin={120}
                      animationDuration={820}
                      onMouseEnter={(row) => setHoveredOrigin(row.payload.origin)}
                      onMouseLeave={() => setHoveredOrigin(null)}
                      onClick={(row) => toggleOrigin(row.payload.origin)}
                      onTouchStart={(row) => {
                        setHoveredOrigin(row.payload.origin);
                        setSelectedOrigin(row.payload.origin);
                      }}
                    >
                      {chartRows.map((row) => {
                        const muted = focusedOrigin && focusedOrigin !== row.origin;
                        return (
                          <Cell
                            key={row.origin}
                            fill={`url(#lead-origin-gradient-${row.origin})`}
                            fillOpacity={muted ? 0.42 : 1}
                            stroke="rgba(255,255,255,0.78)"
                            strokeWidth={2.2}
                            style={{
                              filter: muted
                                ? "saturate(0.82)"
                                : `drop-shadow(0 10px 14px ${row.glowColor})`,
                              cursor: "pointer",
                              transition:
                                "fill-opacity 180ms ease, filter 180ms ease, transform 180ms ease",
                            }}
                          />
                        );
                      })}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <LeadOriginTooltip row={activeRow} periodLabel={periodLabel} total={total} />

                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="grid size-[7.35rem] place-items-center rounded-full border border-white/76 bg-white/70 text-center shadow-[0_18px_38px_-28px_rgba(23,27,33,0.46),inset_0_1px_0_rgba(255,255,255,0.92)] backdrop-blur">
                    <div className="min-w-0 px-2">
                      <p className="truncate text-[10px] font-black uppercase tracking-[0.14em] text-foreground/45">
                        {activeRow ? activeRow.shortLabel : "Total"}
                      </p>
                      <p
                        className="mt-1 font-mono text-[1.65rem] font-black leading-none tracking-tight"
                        style={{ color: activeRow?.color ?? chartSystem }}
                      >
                        {activeRow ? activeRow.value : total}
                      </p>
                      <p className="mt-1 text-[10px] font-bold text-foreground/50">
                        {activeRow ? `${formatPercent(activeRow.percent)}%` : leadWord(total)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
              {rows.map((row) => (
                <LegendChip
                  key={row.origin}
                  row={row}
                  selected={selectedOrigin === row.origin}
                  focused={focusedOrigin === row.origin}
                  onClick={() => toggleOrigin(row.origin)}
                  onMouseEnter={() => setHoveredOrigin(row.origin)}
                  onMouseLeave={() => setHoveredOrigin(null)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function PeriodSelector({
  value,
  onChange,
}: {
  value: PeriodMode;
  onChange: (next: PeriodMode) => void;
}) {
  return (
    <div
      className="no-scrollbar flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl border border-foreground/10 bg-white/56 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.86)]"
      role="radiogroup"
      aria-label="Filtrar origem dos leads por período"
    >
      {PERIOD_OPTIONS.map((option) => {
        const active = option.key === value;
        return (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-label={option.label}
            aria-checked={active}
            onClick={() => onChange(option.key)}
            className={cn(
              "relative shrink-0 rounded-xl px-3 py-1.5 text-[11px] font-extrabold tracking-normal transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(30,100,125,0.32)]",
              active
                ? "bg-foreground text-white shadow-[0_10px_20px_-14px_rgba(23,27,33,0.85)]"
                : "text-foreground/58 hover:bg-white/74 hover:text-foreground",
            )}
          >
            <span className="hidden sm:inline">{option.label}</span>
            <span className="sm:hidden">{option.shortLabel}</span>
          </button>
        );
      })}
    </div>
  );
}

function DateField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: string;
  min?: string;
  max?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="min-w-0 rounded-xl border border-foreground/8 bg-white/58 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.84)]">
      <span className="text-[9px] font-black uppercase tracking-[0.14em] text-foreground/42">
        {label}
      </span>
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(event.target.value)}
        onInput={(event) => onChange(event.currentTarget.value)}
        className="mt-1 w-full min-w-0 bg-transparent font-mono text-[12px] font-bold text-foreground outline-none focus-visible:ring-0"
      />
    </label>
  );
}

function SummaryTile({
  label,
  value,
  detail,
  color,
}: {
  label: string;
  value: string;
  detail: string;
  color: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/70 bg-white/50 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.86)]">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p className="truncate text-[9px] font-black uppercase tracking-[0.13em] text-foreground/42">
          {label}
        </p>
        <span
          className="size-2.5 shrink-0 rounded-full ring-4"
          style={{ background: color, boxShadow: `0 0 0 4px ${withAlpha(color, 0.13)}` }}
        />
      </div>
      <p className="mt-2 truncate font-mono text-xl font-black leading-none" style={{ color }}>
        {value}
      </p>
      <p className="mt-1 truncate text-[10px] font-semibold text-foreground/48">{detail}</p>
    </div>
  );
}

function LegendChip({
  row,
  selected,
  focused,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: {
  row: LeadOriginRow;
  selected: boolean;
  focused: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const active = focused || selected;
  const disabled = row.value === 0;

  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={cn(
        "group min-w-0 rounded-2xl border p-2.5 text-left transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(30,100,125,0.32)]",
        active
          ? "border-white/80 bg-white/70 shadow-[0_16px_32px_-24px_rgba(23,27,33,0.42),inset_0_1px_0_rgba(255,255,255,0.92)]"
          : "border-foreground/8 bg-white/38 hover:bg-white/62",
        disabled && "cursor-default opacity-55",
      )}
      style={{
        transform: active && !disabled ? "translateY(-1px)" : undefined,
      }}
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="grid size-7 shrink-0 place-items-center rounded-xl border border-white/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]"
            style={{ background: row.softColor }}
          >
            <span
              className="size-3 rounded-full"
              style={{
                background: row.color,
                boxShadow: row.value > 0 ? `0 0 0 4px ${row.softColor}` : undefined,
              }}
            />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[12px] font-black text-foreground">{row.shortLabel}</p>
            <p className="truncate text-[10px] font-semibold text-foreground/46">{row.insight}</p>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <p className="font-mono text-sm font-black text-foreground">{row.value}</p>
          <p className="text-[10px] font-bold text-foreground/45">{formatPercent(row.percent)}%</p>
        </div>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-foreground/7">
        <span
          className="block h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none"
          style={{
            width: row.percent > 0 ? `${Math.max(7, Math.min(100, row.percent))}%` : 0,
            background: row.color,
          }}
        />
      </div>
    </button>
  );
}

function LeadOriginTooltip({
  row,
  periodLabel,
  total,
}: {
  row: LeadOriginRow | null;
  periodLabel: string;
  total: number;
}) {
  if (!row) return null;

  return (
    <div
      data-codex-tooltip
      className="rounded-2xl border border-white/76 bg-white/94 p-3 text-[11px] text-foreground shadow-[0_24px_54px_-28px_rgba(23,27,33,0.46)] backdrop-blur-xl"
      style={{
        position: "absolute",
        right: "0.55rem",
        top: "0.55rem",
        width: "min(16.5rem, calc(100% - 1.1rem))",
        zIndex: 20,
      }}
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-black leading-tight tracking-normal">{row.label}</p>
          <p className="mt-0.5 text-[10px] font-bold text-foreground/45">{periodLabel}</p>
        </div>
        <span
          className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 font-mono text-[10px] font-black"
          style={{ background: row.softColor, color: row.color }}
        >
          <Target className="size-3" aria-hidden />#{row.rank ?? "-"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 border-y border-foreground/10 py-2">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.12em] text-foreground/42">
            Leads
          </p>
          <p className="mt-0.5 font-mono text-lg font-black text-foreground">{row.value}</p>
        </div>
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.12em] text-foreground/42">
            Participação
          </p>
          <p className="mt-0.5 font-mono text-lg font-black" style={{ color: row.color }}>
            {formatPercent(row.percent)}%
          </p>
        </div>
      </div>

      <div className="mt-2 rounded-xl bg-foreground/5 px-2.5 py-2">
        <p className="text-[9px] font-black uppercase tracking-[0.12em] text-foreground/42">
          Leitura
        </p>
        <p className="mt-0.5 text-[11px] font-bold leading-relaxed text-foreground/70">
          {row.insight} de um total de {total} {leadWord(total)}.
        </p>
      </div>
    </div>
  );
}

function LeadOriginSkeleton({ className }: { className?: string }) {
  return (
    <section
      className={cn(
        "relative min-h-[34rem] w-full min-w-0 overflow-hidden rounded-3xl border border-white/70 bg-white/64 p-3 shadow-[0_28px_72px_-30px_rgba(23,27,33,0.24)] sm:p-5",
        className,
      )}
      aria-label="Carregando origem dos leads"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="h-6 w-48 animate-pulse rounded-full bg-foreground/10" />
          <div className="mt-3 h-8 w-64 max-w-full animate-pulse rounded-full bg-foreground/12" />
          <div className="mt-2 h-4 w-80 max-w-full animate-pulse rounded-full bg-foreground/8" />
        </div>
        <div className="h-14 w-44 animate-pulse rounded-2xl bg-foreground/8" />
      </div>
      <div className="mt-6 grid gap-2 sm:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-24 animate-pulse rounded-2xl bg-foreground/8" />
        ))}
      </div>
      <div className="mt-4 grid place-items-center rounded-[1.35rem] border border-white/70 bg-white/44 p-4">
        <div className="size-48 animate-pulse rounded-full bg-foreground/10" />
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="h-16 animate-pulse rounded-2xl bg-foreground/8" />
        ))}
      </div>
    </section>
  );
}

function LeadOriginEmpty({
  title,
  text,
  filtered,
}: {
  title: string;
  text: string;
  filtered?: boolean;
}) {
  return (
    <div className="grid min-h-[21rem] place-items-center rounded-[1.35rem] border border-white/72 bg-white/44 p-6 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.86)]">
      <div className="max-w-[24rem]">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl border border-foreground/8 bg-white/62 text-foreground/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]">
          {filtered ? (
            <CalendarRange className="size-6" aria-hidden />
          ) : (
            <BarChart3 className="size-6" aria-hidden />
          )}
        </div>
        <p className="mt-3 text-base font-black tracking-tight text-foreground/76">{title}</p>
        <p className="mx-auto mt-1.5 max-w-[20rem] text-[12px] leading-relaxed text-foreground/52">
          {text}
        </p>
      </div>
    </div>
  );
}

function LeadOriginError({ message }: { message: string }) {
  return (
    <div className="grid min-h-[21rem] place-items-center rounded-[1.35rem] border border-red-200/70 bg-white/44 p-6 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.86)]">
      <div className="max-w-[24rem]">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl border border-red-200/70 bg-red-50/72 text-red-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]">
          <AlertCircle className="size-6" aria-hidden />
        </div>
        <p className="mt-3 text-base font-black tracking-tight text-foreground/76">
          Não foi possível carregar a origem dos leads.
        </p>
        <p className="mx-auto mt-1.5 max-w-[21rem] text-[12px] leading-relaxed text-foreground/52">
          {message}
        </p>
      </div>
    </div>
  );
}

function renderActiveSector(props: PieSectorDataItem) {
  const cx = Number(props.cx ?? 0);
  const cy = Number(props.cy ?? 0);
  const innerRadius = Number(props.innerRadius ?? 0);
  const outerRadius = Number(props.outerRadius ?? 0);
  const startAngle = Number(props.startAngle ?? 0);
  const endAngle = Number(props.endAngle ?? 0);
  const midAngle = Number(props.midAngle ?? 0);
  const offsetX = Math.cos(-RADIAN * midAngle) * 5;
  const offsetY = Math.sin(-RADIAN * midAngle) * 5;
  const fill = typeof props.fill === "string" ? props.fill : chartSystem;

  return (
    <g>
      <Sector
        cx={cx}
        cy={cy + 7}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 2}
        startAngle={startAngle}
        endAngle={endAngle}
        fill="rgba(23,27,33,0.13)"
        stroke="none"
      />
      <Sector
        cx={cx + offsetX}
        cy={cy + offsetY}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 8}
        startAngle={startAngle}
        endAngle={endAngle}
        cornerRadius={9}
        fill={fill}
        stroke="rgba(255,255,255,0.86)"
        strokeWidth={2.6}
        style={{ filter: "drop-shadow(0 12px 12px rgba(23,27,33,0.22))" }}
      />
    </g>
  );
}

function buildLeadOriginRows(clients: Client[], periodRange: PeriodRange) {
  const counts = new Map<LeadOrigin, number>();
  const filteredClients = periodRange.invalid
    ? []
    : clients.filter((client) => isWithinRange(parseDate(client.createdAt), periodRange));

  filteredClients.forEach((client) => {
    const origin = resolveLeadOrigin(client.leadOrigin);
    counts.set(origin, (counts.get(origin) ?? 0) + 1);
  });

  const total = filteredClients.length;
  const orderedRows = leadOriginOptions
    .map(({ value }) => {
      const origin = resolveLeadOrigin(value);
      const visual = ORIGIN_VISUALS[origin];
      const count = counts.get(origin) ?? 0;
      return {
        origin,
        label: getOriginLabel(origin),
        shortLabel: visual.shortLabel,
        value: count,
        percent: total > 0 ? (count / total) * 100 : 0,
        color: visual.color,
        softColor: visual.softColor,
        glowColor: visual.glowColor,
      };
    })
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "pt-BR"));

  const rows: LeadOriginRow[] = orderedRows.map((row, index) => ({
    ...row,
    rank: row.value > 0 ? index + 1 : null,
    insight: getOriginInsight(
      row.value,
      row.percent,
      index,
      orderedRows.filter((r) => r.value > 0).length,
    ),
  }));

  return {
    rows,
    chartRows: rows.filter((row) => row.value > 0),
    total,
  };
}

function getOriginInsight(value: number, percent: number, index: number, activeCount: number) {
  if (value === 0) return "Sem leads no período";
  if (index === 0) return "Canal com maior participação";
  if (index === activeCount - 1) return "Canal com menor volume no período";
  if (percent >= 20) return "Participação relevante";
  return "Participação moderada";
}

function buildExecutiveInsight(leader: LeadOriginRow | null, second: LeadOriginRow | null) {
  if (!leader) return "A distribuição será exibida assim que houver leads no período.";
  if (!second) return `${leader.shortLabel} concentra os leads do período selecionado.`;
  return `${leader.shortLabel} lidera a entrada de leads; ${second.shortLabel} aparece como segundo canal.`;
}

function getPeriodRange(mode: PeriodMode, customStart: string, customEnd: string): PeriodRange {
  const now = new Date();
  if (mode === "week") {
    const start = startOfDay(new Date(now.getTime() - 6 * MS_DAY));
    return { start, end: endOfDay(now), invalid: false };
  }
  if (mode === "month") {
    return { start: startOfMonth(now), end: endOfDay(now), invalid: false };
  }
  if (mode === "year") {
    return { start: startOfYear(now), end: endOfDay(now), invalid: false };
  }

  const start = parseDateInput(customStart);
  const end = parseDateInput(customEnd);
  if (!start || !end || start.getTime() > end.getTime()) {
    return { start: startOfYear(now), end: endOfDay(now), invalid: true };
  }

  return { start: startOfDay(start), end: endOfDay(end), invalid: false };
}

function formatPeriodLabel(mode: PeriodMode, range: PeriodRange) {
  if (mode === "week") return "Últimos 7 dias";
  if (mode === "month") return "Este mês";
  if (mode === "year") return "Ano atual";
  if (range.invalid) return "Período personalizado";
  return `${BR_DATE_FORMATTER.format(range.start)} - ${BR_DATE_FORMATTER.format(range.end)}`;
}

function isWithinRange(date: Date | null, range: PeriodRange) {
  if (!date) return false;
  const time = date.getTime();
  return time >= range.start.getTime() && time <= range.end.getTime();
}

function parseDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDateInput(value: string) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfYear(date: Date) {
  return new Date(date.getFullYear(), 0, 1);
}

function resolveLeadOrigin(value: string): LeadOrigin {
  return leadOriginOptions.some((option) => option.value === value)
    ? (value as LeadOrigin)
    : "outro";
}

function getOriginLabel(origin: LeadOrigin) {
  if (origin === "portal") return "Portais";
  if (origin === "presencial") return "Atendimento presencial";
  if (origin === "outro") return "Outros";
  return leadOriginLabel(origin);
}

function formatPercent(value: number) {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function leadWord(value: number) {
  return value === 1 ? "lead" : "leads";
}

function withAlpha(color: string, alpha: number) {
  if (!color.startsWith("#") || color.length !== 7) return color;
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  return `rgba(${red},${green},${blue},${alpha})`;
}
