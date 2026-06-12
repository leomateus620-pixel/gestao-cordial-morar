import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Megaphone, MousePointerClick, Wallet } from "lucide-react";
import { KpiCard } from "@/components/kpi-card";
import { SectionHeader } from "@/components/section-header";
import { StatusBadge } from "@/components/status-badge";
import { brl } from "@/lib/format";
import { useApp, useFiltered } from "@/store/app-store";

const filters = ["Todas", "Ativa", "Planejada", "Pausada"] as const;

export const Route = createFileRoute("/_app/marketing")({
  head: () => ({ meta: [{ title: "Marketing — Gestão Cordial" }] }),
  component: Page,
});

function Page() {
  const [filter, setFilter] = useState<(typeof filters)[number]>("Todas");
  const campanhas = useFiltered(useApp((s) => s.campanhasMarketing));
  const list = campanhas.filter((c) => filter === "Todas" || c.status === filter);
  const investimento = campanhas.reduce((total, campanha) => total + campanha.investimento, 0);
  const leads = campanhas.reduce((total, campanha) => total + campanha.leads, 0);
  const cpl = leads ? investimento / leads : 0;

  return (
    <>
      <section className="mb-5 grid grid-cols-3 gap-3">
        <KpiCard
          label="Leads"
          value={leads.toString()}
          tone="primary"
          delta="gerados"
          accent="up"
        />
        <KpiCard label="Invest." value={brl(investimento, { compact: true })} delta="mídia" />
        <KpiCard label="CPL" value={brl(cpl)} delta="médio" />
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
        <SectionHeader title="Campanhas" />
        <div className="space-y-3">
          {list.map((campanha) => (
            <article key={campanha.id} className="glass-panel rounded-3xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                    <Megaphone className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{campanha.nome}</p>
                    <p className="text-[11px] text-foreground/55">
                      {campanha.canal} · {campanha.objetivo}
                    </p>
                  </div>
                </div>
                <StatusBadge status={campanha.status} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/40 pt-3 text-[11px] text-foreground/60">
                <span className="flex items-center gap-1">
                  <MousePointerClick className="size-3" />
                  {campanha.leads} leads
                </span>
                <span className="flex items-center justify-end gap-1">
                  <Wallet className="size-3" />
                  {brl(campanha.investimento)}
                </span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
