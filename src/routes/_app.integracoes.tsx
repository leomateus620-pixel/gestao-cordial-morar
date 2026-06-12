import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Cable, CheckCircle2, Clock3, RefreshCw } from "lucide-react";
import { KpiCard } from "@/components/kpi-card";
import { SectionHeader } from "@/components/section-header";
import { StatusBadge } from "@/components/status-badge";
import { useApp, useFiltered } from "@/store/app-store";

const filters = ["Todas", "Conectada", "Atenção", "Disponível"] as const;

export const Route = createFileRoute("/_app/integracoes")({
  head: () => ({ meta: [{ title: "Integrações — Gestão Cordial" }] }),
  component: Page,
});

function Page() {
  const [filter, setFilter] = useState<(typeof filters)[number]>("Todas");
  const integracoes = useFiltered(useApp((s) => s.integracoes));
  const list = integracoes.filter((i) => filter === "Todas" || i.status === filter);
  const conectadas = integracoes.filter((i) => i.status === "Conectada").length;
  const sincronizacoes = integracoes.reduce(
    (total, integracao) => total + integracao.sincronizacoes,
    0,
  );
  const alertas = integracoes.filter((i) => i.status === "Atenção").length;

  return (
    <>
      <section className="mb-5 grid grid-cols-3 gap-3">
        <KpiCard
          label="Conectadas"
          value={conectadas.toString()}
          tone="primary"
          delta="ativas"
          accent="up"
        />
        <KpiCard label="Syncs" value={sincronizacoes.toString()} delta="mês" />
        <KpiCard label="Alertas" value={alertas.toString()} delta="revisar" accent="down" />
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
        <SectionHeader title="Conectores" />
        <div className="space-y-3">
          {list.map((integracao) => (
            <article key={integracao.id} className="glass-panel rounded-3xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-sky-500/15 text-sky-700">
                    {integracao.status === "Conectada" ? (
                      <CheckCircle2 className="size-5" />
                    ) : (
                      <Cable className="size-5" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{integracao.nome}</p>
                    <p className="text-[11px] text-foreground/55">{integracao.categoria}</p>
                  </div>
                </div>
                <StatusBadge status={integracao.status} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/40 pt-3 text-[11px] text-foreground/60">
                <span className="flex items-center gap-1">
                  <RefreshCw className="size-3" />
                  {integracao.sincronizacoes} sincronizações
                </span>
                <span className="flex items-center justify-end gap-1">
                  <Clock3 className="size-3" />
                  {new Date(integracao.ultimaSync).toLocaleDateString("pt-BR")}
                </span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
