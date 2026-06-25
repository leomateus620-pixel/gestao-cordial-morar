import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronRight, Sparkles, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  axisTick,
  chartCordial,
  chartMorar,
  chartSystem,
  gridStroke,
  tooltipStyle,
} from "@/lib/chart-palette";
import type {
  EquipePeriodo,
  EquipePerformanceResult,
} from "@/lib/equipe/equipe.functions";

type Props = {
  data: EquipePerformanceResult;
  periodo: EquipePeriodo;
  onPeriodoChange: (next: EquipePeriodo) => void;
  isLoading?: boolean;
  className?: string;
};

const PERIODOS: Array<{ value: EquipePeriodo; label: string; short: string }> = [
  { value: "mes", label: "Este mês", short: "Mês" },
  { value: "ultimos_30", label: "Últimos 30 dias", short: "30d" },
  { value: "trimestre", label: "Trimestre", short: "Trim." },
  { value: "ano", label: "Ano", short: "Ano" },
];

const SERIES = {
  atendimentos: { color: chartCordial, gradId: "perfGradAtend", label: "Atendimentos" },
  contratos: { color: chartMorar, gradId: "perfGradContr", label: "Contratos" },
  agenciamentos: { color: chartSystem, gradId: "perfGradAg", label: "Agenciamentos" },
} as const;

export function TeamPerformanceChart({
  data,
  periodo,
  onPeriodoChange,
  isLoading,
  className,
}: Props) {
  const chartData = useMemo(
    () =>
      data.rows.map((r) => ({
        nome: r.primeiroNome,
        nomeCompleto: r.nome,
        atendimentos: r.atendimentos,
        contratos: r.contratos,
        agenciamentos: r.agenciamentos,
        conversao: r.conversao,
      })),
    [data.rows],
  );

  const hasData = chartData.length > 0;
  const periodoLabel = PERIODOS.find((p) => p.value === periodo)?.label ?? "Período";

  return (
    <section
      className={cn(
        "relative w-full min-w-0 overflow-hidden rounded-[1.85rem] p-4 sm:p-5",
        className,
      )}
      style={{
        background:
          "linear-gradient(155deg, rgba(255,255,255,0.86) 0%, rgba(244,247,250,0.7) 55%, rgba(255,250,244,0.82) 100%)",
        backdropFilter: "blur(20px) saturate(150%)",
        border: "1px solid rgba(255,255,255,0.7)",
        boxShadow:
          "0 22px 50px -22px rgba(23,27,33,0.16), inset 0 1px 0 rgba(255,255,255,0.9)",
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full opacity-30 blur-3xl"
        style={{ background: `radial-gradient(circle, ${chartSystem} 0%, transparent 70%)` }}
      />

      <header className="relative z-10 mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-foreground/5 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.22em] text-foreground/55">
            <Sparkles className="size-3" />
            Performance da equipe
          </div>
          <h3 className="truncate text-base font-black tracking-tight sm:text-lg">
            Atendimentos, contratos e agenciamentos
          </h3>
          <p className="mt-0.5 truncate text-[11px] text-foreground/55">
            Top corretores por volume • {periodoLabel.toLowerCase()}
          </p>
        </div>

        <div
          className="inline-flex shrink-0 items-center gap-0.5 rounded-full p-0.5"
          style={{
            background: "rgba(23,27,33,0.04)",
            border: "1px solid rgba(23,27,33,0.06)",
          }}
        >
          {PERIODOS.map((p) => {
            const active = p.value === periodo;
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => onPeriodoChange(p.value)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition",
                  active
                    ? "bg-white text-foreground shadow-sm"
                    : "text-foreground/55 hover:text-foreground",
                )}
              >
                {p.short}
              </button>
            );
          })}
        </div>
      </header>

      <div className="relative z-10 mb-4 grid grid-cols-3 gap-2">
        <TotalPill
          label="Atendimentos"
          value={data.totals.atendimentos}
          color={SERIES.atendimentos.color}
        />
        <TotalPill
          label="Contratos"
          value={data.totals.contratos}
          color={SERIES.contratos.color}
          hint={`${data.totals.conversaoMedia}% conv.`}
          hintIcon
        />
        <TotalPill
          label="Agenciamentos"
          value={data.totals.agenciamentos}
          color={SERIES.agenciamentos.color}
        />
      </div>

      <div className="relative z-10 h-72 w-full min-w-0 sm:h-80">
        {isLoading ? (
          <SkeletonChart />
        ) : hasData ? (
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ left: 4, right: 36, top: 4, bottom: 4 }}
              barCategoryGap="22%"
              barGap={3}
            >
              <defs>
                {Object.values(SERIES).map((s) => (
                  <linearGradient key={s.gradId} id={s.gradId} x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor={s.color} stopOpacity={0.95} />
                    <stop offset="100%" stopColor={s.color} stopOpacity={0.55} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid stroke={gridStroke} horizontal={false} />
              <XAxis type="number" hide />
              <YAxis
                dataKey="nome"
                type="category"
                tickLine={false}
                axisLine={false}
                tick={{ ...axisTick, fontWeight: 600, fill: "#3a4048" }}
                width={64}
              />
              <Tooltip
                cursor={{ fill: "rgba(23,27,33,0.04)" }}
                contentStyle={tooltipStyle}
                content={<RichTooltip />}
              />
              <Bar
                dataKey="atendimentos"
                fill="url(#perfGradAtend)"
                radius={[0, 8, 8, 0]}
                name="Atendimentos"
                barSize={11}
                animationDuration={900}
              >
                <LabelList
                  dataKey="atendimentos"
                  position="right"
                  className="text-[10px] font-bold"
                  fill={SERIES.atendimentos.color}
                  formatter={(v: number) => (v > 0 ? String(v) : "")}
                />
              </Bar>
              <Bar
                dataKey="contratos"
                fill="url(#perfGradContr)"
                radius={[0, 8, 8, 0]}
                name="Contratos"
                barSize={11}
                animationDuration={1000}
              >
                <LabelList
                  dataKey="contratos"
                  position="right"
                  className="text-[10px] font-bold"
                  fill={SERIES.contratos.color}
                  formatter={(v: number) => (v > 0 ? String(v) : "")}
                />
              </Bar>
              <Bar
                dataKey="agenciamentos"
                fill="url(#perfGradAg)"
                radius={[0, 8, 8, 0]}
                name="Agenciamentos"
                barSize={11}
                animationDuration={1100}
              >
                <LabelList
                  dataKey="agenciamentos"
                  position="right"
                  className="text-[10px] font-bold"
                  fill={SERIES.agenciamentos.color}
                  formatter={(v: number) => (v > 0 ? String(v) : "")}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChart />
        )}
      </div>

      <footer className="relative z-10 mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] text-foreground/65">
        {Object.entries(SERIES).map(([key, s]) => (
          <div key={key} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block size-2 rounded-full"
              style={{ background: s.color }}
            />
            <span className="font-medium">{s.label}</span>
          </div>
        ))}
        <span className="ml-auto inline-flex items-center gap-1 font-mono text-[10px] text-foreground/40">
          {periodoLabel}
          <ChevronRight className="size-3" />
        </span>
      </footer>
    </section>
  );
}

function TotalPill({
  label,
  value,
  color,
  hint,
  hintIcon,
}: {
  label: string;
  value: number;
  color: string;
  hint?: string;
  hintIcon?: boolean;
}) {
  return (
    <div
      className="rounded-2xl px-3 py-2.5"
      style={{
        background: `linear-gradient(135deg, ${color}14 0%, ${color}06 100%)`,
        border: `1px solid ${color}25`,
      }}
    >
      <div className="flex items-center gap-1.5">
        <span className="inline-block size-1.5 rounded-full" style={{ background: color }} />
        <p className="truncate text-[9px] font-bold uppercase tracking-wider text-foreground/55">
          {label}
        </p>
      </div>
      <p
        className="mt-1 truncate font-mono text-xl font-black leading-none sm:text-2xl"
        style={{ color }}
      >
        {value}
      </p>
      {hint && (
        <p className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-foreground/55">
          {hintIcon && <TrendingUp className="size-3" />}
          {hint}
        </p>
      )}
    </div>
  );
}

type TooltipPayload = {
  payload: {
    nomeCompleto: string;
    atendimentos: number;
    contratos: number;
    agenciamentos: number;
    conversao: number;
  };
};
function RichTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div
      className="rounded-xl px-3 py-2 text-[11px]"
      style={{
        background: "rgba(255,255,255,0.96)",
        border: "1px solid rgba(23,27,33,0.08)",
        boxShadow: "0 18px 40px -16px rgba(23,27,33,0.2)",
      }}
    >
      <p className="mb-1.5 font-bold tracking-tight">{p.nomeCompleto}</p>
      <Row color={SERIES.atendimentos.color} label="Atendimentos" value={p.atendimentos} />
      <Row color={SERIES.contratos.color} label="Contratos" value={p.contratos} />
      <Row color={SERIES.agenciamentos.color} label="Agenciamentos" value={p.agenciamentos} />
      <div className="mt-1.5 border-t border-foreground/10 pt-1.5">
        <Row color="#16a34a" label="Conversão" value={`${p.conversao}%`} />
      </div>
    </div>
  );
}

function Row({ color, label, value }: { color: string; label: string; value: number | string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="inline-flex items-center gap-1.5 text-foreground/65">
        <span className="inline-block size-1.5 rounded-full" style={{ background: color }} />
        {label}
      </span>
      <span className="font-mono font-bold text-foreground">{value}</span>
    </div>
  );
}

function SkeletonChart() {
  return (
    <div className="flex h-full flex-col justify-center gap-3 px-2">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="h-3 w-12 animate-pulse rounded bg-foreground/10" />
          <div className="flex-1 space-y-1.5">
            <div
              className="h-2.5 animate-pulse rounded-full bg-foreground/10"
              style={{ width: `${80 - i * 12}%` }}
            />
            <div
              className="h-2.5 animate-pulse rounded-full bg-foreground/10"
              style={{ width: `${55 - i * 8}%` }}
            />
            <div
              className="h-2.5 animate-pulse rounded-full bg-foreground/10"
              style={{ width: `${40 - i * 5}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <div className="grid size-10 place-items-center rounded-2xl bg-foreground/5 text-foreground/40">
        <Sparkles className="size-5" />
      </div>
      <p className="text-sm font-semibold tracking-tight text-foreground/65">
        Sem atividade no período
      </p>
      <p className="max-w-[220px] text-[11px] text-foreground/50">
        Registre atendimentos ou agenciamentos para acompanhar a performance da equipe aqui.
      </p>
    </div>
  );
}
