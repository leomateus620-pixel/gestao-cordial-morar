import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CalendarClock, Home, Wallet } from "lucide-react";
import { KpiCard } from "@/components/kpi-card";
import { SectionHeader } from "@/components/section-header";
import { StatusBadge } from "@/components/status-badge";
import { brl } from "@/lib/format";
import { useApp, useFiltered } from "@/store/app-store";

const filters = ["Todos", "Disponíveis", "Contratos", "Atrasos"] as const;

export const Route = createFileRoute("/_app/alugueis")({
  head: () => ({ meta: [{ title: "Aluguéis — Gestão Cordial" }] }),
  component: Page,
});

function Page() {
  const [filter, setFilter] = useState<(typeof filters)[number]>("Todos");
  const imoveis = useFiltered(useApp((s) => s.imoveis));
  const contratos = useFiltered(useApp((s) => s.contratos));
  const lancamentos = useFiltered(useApp((s) => s.lancamentos));
  const clientes = useApp((s) => s.clientes);

  const imoveisAluguel = imoveis.filter((i) => i.finalidade === "Aluguel");
  const contratosAluguel = contratos.filter((c) => c.tipo === "Aluguel");
  const recebimentos = lancamentos.filter((l) => l.categoria === "Aluguel recebido");
  const atrasados = recebimentos.filter((l) => l.status === "Atrasado");
  const receitaMensal = recebimentos.reduce((total, l) => total + l.valor, 0);

  const cards = useMemo(() => {
    if (filter === "Disponíveis") return imoveisAluguel.filter((i) => i.status === "Disponível");
    if (filter === "Contratos")
      return imoveisAluguel.filter((i) => contratosAluguel.some((c) => c.imovelId === i.id));
    if (filter === "Atrasos")
      return imoveisAluguel.filter((i) => atrasados.some((l) => l.descricao.includes(i.titulo)));
    return imoveisAluguel;
  }, [atrasados, contratosAluguel, filter, imoveisAluguel]);

  return (
    <>
      <section className="mb-5 grid grid-cols-3 gap-3">
        <KpiCard
          label="Receita"
          value={brl(receitaMensal, { compact: true })}
          tone="primary"
          delta="mês"
        />
        <KpiCard label="Contratos" value={contratosAluguel.length.toString()} delta="ativos" />
        <KpiCard
          label="Atrasos"
          value={atrasados.length.toString()}
          delta="alertas"
          accent="down"
        />
      </section>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {filters.map((item) => (
          <button
            key={item}
            onClick={() => setFilter(item)}
            className={
              "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition " +
              (filter === item
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                : "glass-panel text-foreground/65")
            }
          >
            {item}
          </button>
        ))}
      </div>

      <section className="mb-5">
        <SectionHeader title="Carteira de locação" />
        <div className="space-y-3">
          {cards.map((imovel) => {
            const contrato = contratosAluguel.find((c) => c.imovelId === imovel.id);
            const cliente = clientes.find((c) => c.id === contrato?.clienteId);
            return (
              <article key={imovel.id} className="glass-panel rounded-3xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{imovel.titulo}</p>
                    <p className="truncate text-[11px] text-foreground/55">
                      {imovel.bairro} · {imovel.cidade}
                    </p>
                  </div>
                  <StatusBadge status={contrato?.status ?? imovel.status} />
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/40 pt-3 text-[11px] text-foreground/60">
                  <span className="flex items-center gap-1">
                    <Wallet className="size-3" />
                    {brl(imovel.valor)}/mês
                  </span>
                  <span className="flex items-center gap-1">
                    <Home className="size-3" />
                    {imovel.area} m²
                  </span>
                  <span className="flex items-center gap-1">
                    <CalendarClock className="size-3" />
                    {cliente?.nome ?? "Sem locatário"}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}
