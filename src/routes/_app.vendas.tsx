import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BadgeDollarSign, Bed, Maximize2 } from "lucide-react";
import { KpiCard } from "@/components/kpi-card";
import { SectionHeader } from "@/components/section-header";
import { StatusBadge } from "@/components/status-badge";
import { brl } from "@/lib/format";
import { useApp, useFiltered } from "@/store/app-store";

const filters = ["Todos", "Disponível", "Reservado", "Vendido"] as const;

export const Route = createFileRoute("/_app/vendas")({
  head: () => ({ meta: [{ title: "Vendas — Gestão Cordial" }] }),
  component: Page,
});

function Page() {
  const [filter, setFilter] = useState<(typeof filters)[number]>("Todos");
  const imoveis = useFiltered(useApp((s) => s.imoveis));
  const contratos = useFiltered(useApp((s) => s.contratos));
  const atendimentos = useFiltered(useApp((s) => s.atendimentos));
  const vendas = imoveis.filter((i) => i.finalidade === "Venda");
  const contratosVenda = contratos.filter((c) => c.tipo === "Venda");
  const pipeline = atendimentos.filter(
    (a) => a.status === "Proposta" || a.status === "Em visita",
  ).length;
  const vgv = vendas.reduce((total, imovel) => total + imovel.valor, 0);

  const list = useMemo(
    () => vendas.filter((i) => filter === "Todos" || i.status === filter),
    [filter, vendas],
  );

  return (
    <>
      <section className="mb-5 grid grid-cols-3 gap-3">
        <KpiCard label="VGV" value={brl(vgv, { compact: true })} tone="primary" delta="carteira" />
        <KpiCard label="Pipeline" value={pipeline.toString()} delta="negócios" />
        <KpiCard
          label="Fechadas"
          value={contratosVenda.length.toString()}
          delta="contratos"
          accent="up"
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

      <section>
        <SectionHeader title="Oportunidades de venda" />
        <div className="space-y-3">
          {list.map((imovel) => (
            <article key={imovel.id} className="glass-panel overflow-hidden rounded-3xl">
              <img
                src={imovel.foto}
                alt={imovel.titulo}
                loading="lazy"
                className="aspect-[16/9] w-full object-cover"
              />
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{imovel.titulo}</p>
                    <p className="truncate text-[11px] text-foreground/55">
                      {imovel.bairro} · {imovel.cidade}
                    </p>
                  </div>
                  <StatusBadge status={imovel.status} />
                </div>
                <div className="mt-3 flex items-end justify-between">
                  <div className="flex gap-3 text-[11px] text-foreground/60">
                    <span className="flex items-center gap-1">
                      <Bed className="size-3" />
                      {imovel.quartos} qts
                    </span>
                    <span className="flex items-center gap-1">
                      <Maximize2 className="size-3" />
                      {imovel.area} m²
                    </span>
                  </div>
                  <p className="flex items-center gap-1 font-mono text-sm font-bold text-primary">
                    <BadgeDollarSign className="size-4" />
                    {brl(imovel.valor)}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
