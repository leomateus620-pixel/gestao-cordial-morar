import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Link as LinkIcon } from "lucide-react";
import { useApp, useFiltered } from "@/store/app-store";
import { KpiCard } from "@/components/kpi-card";
import { SectionHeader } from "@/components/section-header";
import { ChartCard } from "@/components/shared/chart-card";
import { FinancialSummaryCard } from "@/components/shared/financial-summary-card";
import { StatusBadge } from "@/components/status-badge";
import { brl } from "@/lib/format";
import { receitaMensal } from "@/lib/mock/data";
import { PermissionGuard } from "@/components/permission-guard";
import { axisTick, chartSystem, gridStroke, tooltipStyle } from "@/lib/chart-palette";

export const Route = createFileRoute("/_app/financeiro")({
  head: () => ({ meta: [{ title: "Financeiro — Gestão Cordial" }] }),
  component: Page,
});

function Page() {
  const lancamentos = useFiltered(useApp((s) => s.lancamentos));
  const entradas = lancamentos.filter((l) => l.tipo === "entrada");
  const saidas = lancamentos.filter((l) => l.tipo === "saida");
  const totalEntradas = entradas.reduce((s, l) => s + l.valor, 0);
  const totalSaidas = saidas.reduce((s, l) => s + l.valor, 0);
  const inadimplencia = lancamentos
    .filter((l) => l.status === "Atrasado")
    .reduce((s, l) => s + l.valor, 0);
  const comissoes = entradas
    .filter((l) => l.categoria === "Comissão")
    .reduce((s, l) => s + l.valor, 0);

  const data = receitaMensal.map((m) => ({ mes: m.mes, total: (m.vendas + m.alugueis) * 1000 }));

  return (
    <>
      <section className="mb-5 grid grid-cols-2 gap-3">
        <KpiCard
          label="Receita do mês"
          value={brl(totalEntradas, { compact: true })}
          tone="primary"
          delta="+12%"
          accent="up"
        />
        <KpiCard label="Comissões" value={brl(comissoes, { compact: true })} delta="pagas" />
        <KpiCard label="Repasses" value={brl(totalSaidas, { compact: true })} delta="saídas" />
        <KpiCard
          label="Inadimplência"
          value={brl(inadimplencia, { compact: true })}
          delta="atraso"
          accent="down"
        />
      </section>

      <ChartCard title="Fluxo de receita" heightClassName="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={chartSystem} stopOpacity={0.45} />
                <stop offset="100%" stopColor={chartSystem} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={gridStroke} vertical={false} />
            <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={axisTick} />
            <YAxis hide />
            <Tooltip
              cursor={{ stroke: "rgba(30,100,125,0.3)" }}
              contentStyle={tooltipStyle}
              formatter={(v) => brl(Number(v), { compact: true })}
            />
            <Area
              type="monotone"
              dataKey="total"
              stroke={chartSystem}
              strokeWidth={2.4}
              fill="url(#g)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <section className="mb-6">
        <FinancialSummaryCard
          entradas={totalEntradas}
          saidas={totalSaidas}
          pendente={inadimplencia}
          footer="Valores consolidados para a imobiliária selecionada."
        />
      </section>

      <section className="mb-6">
        <SectionHeader title="Lançamentos recentes" />
        <div className="space-y-2">
          {lancamentos.map((l) => (
            <div
              key={l.id}
              className="glass-panel flex items-center justify-between rounded-2xl p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{l.descricao}</p>
                <p className="text-[10px] text-foreground/55">
                  {l.categoria} · {new Date(l.data).toLocaleDateString("pt-BR")}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p
                  className="font-mono text-sm font-bold"
                  style={{
                    color:
                      l.tipo === "entrada" ? "var(--success)" : "rgba(30,35,41,0.7)",
                  }}
                >
                  {l.tipo === "entrada" ? "+" : "−"} {brl(l.valor, { compact: true })}
                </p>
                <div className="mt-0.5">
                  <StatusBadge status={l.status} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <PermissionGuard modules={["integracoes", "financeiro"]}>
        <section className="glass-panel rounded-3xl p-5">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-sky-500/15 text-sky-700">
              <LinkIcon className="size-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Integração Conta Azul</h3>
              <p className="mt-1 text-[11px] text-foreground/60">
                Em breve: sincronize lançamentos, repasses e comissões automaticamente com o Conta
                Azul.
              </p>
              <span className="mt-2 inline-block rounded-full bg-foreground/8 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-foreground/55">
                Disponível em breve
              </span>
            </div>
          </div>
        </section>
      </PermissionGuard>
    </>
  );
}
