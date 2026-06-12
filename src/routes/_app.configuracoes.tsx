import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Building2, SlidersHorizontal, UsersRound } from "lucide-react";
import { KpiCard } from "@/components/kpi-card";
import { SectionHeader } from "@/components/section-header";
import { StatusBadge } from "@/components/status-badge";
import { agencies } from "@/lib/mock/data";
import { useApp, useFiltered } from "@/store/app-store";

const filters = ["Todos", "Equipe", "Comercial", "Financeiro", "Sistema"] as const;

export const Route = createFileRoute("/_app/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Gestão Cordial" }] }),
  component: Page,
});

function Page() {
  const [filter, setFilter] = useState<(typeof filters)[number]>("Todos");
  const configuracoes = useFiltered(useApp((s) => s.configuracoes));
  const corretores = useFiltered(useApp((s) => s.corretores));
  const list = configuracoes.filter((c) => filter === "Todos" || c.grupo === filter);
  const revisar = configuracoes.filter((c) => c.status === "Revisar").length;

  return (
    <>
      <section className="mb-5 grid grid-cols-3 gap-3">
        <KpiCard
          label="Parâmetros"
          value={configuracoes.length.toString()}
          tone="primary"
          delta="ativos"
        />
        <KpiCard label="Equipe" value={corretores.length.toString()} delta="corretores" />
        <KpiCard label="Revisar" value={revisar.toString()} delta="pendências" accent="down" />
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
        <SectionHeader title="Imobiliárias" />
        <div className="glass-panel rounded-3xl p-4">
          {agencies.map((agency) => (
            <div
              key={agency.id}
              className="flex items-center gap-3 border-b border-white/40 py-3 last:border-0 last:pb-0 first:pt-0"
            >
              <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <Building2 className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{agency.nome}</p>
                <p className="text-[11px] text-foreground/55">Operação habilitada</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionHeader title="Preferências operacionais" />
        <div className="space-y-2">
          {list.map((configuracao) => (
            <article key={configuracao.id} className="glass-panel rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    {configuracao.grupo === "Equipe" ? (
                      <UsersRound className="size-5" />
                    ) : (
                      <SlidersHorizontal className="size-5" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{configuracao.nome}</p>
                    <p className="text-[11px] text-foreground/55">
                      {configuracao.grupo} · {configuracao.valor}
                    </p>
                  </div>
                </div>
                <StatusBadge status={configuracao.status} />
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
