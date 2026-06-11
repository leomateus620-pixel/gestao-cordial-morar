import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useState } from "react";
import { KpiCard } from "@/components/kpi-card";
import { SectionHeader } from "@/components/section-header";
import { StatusBadge } from "@/components/status-badge";
import { Fab } from "@/components/fab";
import { useApp, useFiltered } from "@/store/app-store";
import { brl, timeAgo } from "@/lib/format";
import { receitaMensal } from "@/lib/mock/data";
import { NovoAtendimentoSheet } from "@/components/sheets/novo-atendimento";

export const Route = createFileRoute("/_app/")({
  head: () => ({ meta: [{ title: "Dashboard — Gestão Cordial" }] }),
  component: Dashboard,
});

function Dashboard() {
  const [open, setOpen] = useState(false);
  const atendimentos = useFiltered(useApp((s) => s.atendimentos));
  const imoveis = useFiltered(useApp((s) => s.imoveis));
  const contratos = useFiltered(useApp((s) => s.contratos));
  const agenda = useFiltered(useApp((s) => s.agenda));
  const clientes = useApp((s) => s.clientes);
  const corretores = useApp((s) => s.corretores);

  const hoje = new Date().toISOString().slice(0, 10);
  const atendimentosHoje = atendimentos.filter((a) => a.criadoEm.slice(0, 10) === hoje).length;
  const visitasHoje = agenda.filter((a) => a.data.slice(0, 10) === hoje).length;
  const contratosAtivos = contratos.filter((c) => c.status === "Ativo").length;
  const receitaMes = contratos
    .filter((c) => c.status === "Ativo")
    .reduce((sum, c) => sum + (c.tipo === "Aluguel" ? c.valor : c.valor * 0.05), 0);

  const destaques = imoveis.filter((i) => i.status === "Disponível").slice(0, 5);
  const recentes = atendimentos.slice(0, 4);

  return (
    <>
      <section className="mb-5 grid grid-cols-2 gap-3">
        <KpiCard label="Atendimentos hoje" value={String(atendimentosHoje).padStart(2, "0")} delta="+2" accent="up" />
        <KpiCard label="Visitas hoje" value={String(visitasHoje).padStart(2, "0")} delta="agenda" />
        <KpiCard label="Contratos ativos" value={String(contratosAtivos)} delta="+1" accent="up" />
        <KpiCard label="Receita do mês" value={brl(receitaMes, { compact: true })} tone="primary" delta="+12%" accent="up" />
      </section>

      <section className="glass-panel mb-6 rounded-3xl p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold tracking-tight">Performance de vendas</h3>
          <span className="font-mono text-[10px] text-foreground/40">6 MESES</span>
        </div>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={receitaMensal} barCategoryGap={8}>
              <CartesianGrid stroke="rgba(80,40,20,0.06)" vertical={false} />
              <XAxis
                dataKey="mes"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10, fill: "rgba(50,30,15,0.5)" }}
              />
              <YAxis hide />
              <Tooltip
                cursor={{ fill: "rgba(196,101,74,0.08)" }}
                contentStyle={{
                  background: "rgba(255,255,255,0.9)",
                  border: "1px solid rgba(255,255,255,0.7)",
                  borderRadius: 12,
                  fontSize: 11,
                }}
              />
              <Bar dataKey="vendas" fill="hsl(18 55% 50%)" radius={[6, 6, 0, 0]} name="Vendas" />
              <Bar dataKey="alugueis" fill="hsl(35 60% 65%)" radius={[6, 6, 0, 0]} name="Aluguéis" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 flex gap-4 text-[10px] text-foreground/55">
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-primary" />Vendas</span>
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-orange-300" />Aluguéis</span>
        </div>
      </section>

      <section className="mb-6">
        <SectionHeader title="Imóveis em destaque" href="/imoveis" />
        <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 pb-1">
          {destaques.map((im) => (
            <Link
              key={im.id}
              to="/imoveis"
              className="glass-panel w-60 flex-none overflow-hidden rounded-2xl p-3"
            >
              <img
                src={im.foto}
                alt={im.titulo}
                loading="lazy"
                className="mb-3 aspect-[16/10] w-full rounded-xl object-cover"
              />
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold">{im.titulo}</p>
                  <p className="text-[10px] text-foreground/55">{im.bairro}, {im.cidade}</p>
                </div>
                <StatusBadge status={im.status} />
              </div>
              <p className="mt-2 font-mono text-xs font-bold">{brl(im.valor)}</p>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <SectionHeader title="Atendimentos recentes" href="/atendimentos" />
        <div className="space-y-2">
          {recentes.map((a) => {
            const cli = clientes.find((c) => c.id === a.clienteId);
            const cor = corretores.find((c) => c.id === a.corretorId);
            return (
              <div key={a.id} className="glass-panel flex items-center justify-between gap-3 rounded-2xl p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/12 text-[11px] font-bold text-primary">
                    {cli?.iniciais ?? "?"}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium">{cli?.nome}</p>
                    <p className="truncate text-[10px] text-foreground/55">Corretor: {cor?.nome}</p>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <StatusBadge status={a.status} />
                  <p className="mt-1 font-mono text-[9px] text-foreground/45">{timeAgo(a.criadoEm)}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <Fab onClick={() => setOpen(true)} label="Novo atendimento" />
      <NovoAtendimentoSheet open={open} onOpenChange={setOpen} />
    </>
  );
}