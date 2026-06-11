import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useApp, useFiltered } from "@/store/app-store";
import { StatusBadge } from "@/components/status-badge";
import { brl } from "@/lib/format";

const tabs = ["Todos", "Venda", "Aluguel"] as const;

export const Route = createFileRoute("/_app/contratos")({
  head: () => ({ meta: [{ title: "Contratos — Gestão Cordial" }] }),
  component: Page,
});

function Page() {
  const [tab, setTab] = useState<(typeof tabs)[number]>("Todos");
  const contratos = useFiltered(useApp((s) => s.contratos));
  const clientes = useApp((s) => s.clientes);
  const imoveis = useApp((s) => s.imoveis);
  const list = contratos.filter((c) => tab === "Todos" || c.tipo === tab);

  return (
    <>
      <div className="mb-4 flex gap-2">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              "rounded-full px-3 py-1.5 text-xs font-medium transition " +
              (tab === t ? "bg-primary text-primary-foreground shadow-md shadow-primary/25" : "glass-panel text-foreground/65")
            }
          >
            {t}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {list.map((c) => {
          const cli = clientes.find((x) => x.id === c.clienteId);
          const im = imoveis.find((x) => x.id === c.imovelId);
          return (
            <div key={c.id} className="glass-panel rounded-2xl p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-foreground/50">{c.numero}</p>
                  <p className="mt-0.5 truncate text-sm font-semibold">{im?.titulo}</p>
                  <p className="truncate text-[11px] text-foreground/55">{cli?.nome}</p>
                </div>
                <StatusBadge status={c.status} />
              </div>
              <div className="mt-3 flex items-end justify-between border-t border-white/40 pt-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-foreground/45">{c.tipo}</p>
                  <p className="text-[11px] text-foreground/60">
                    {new Date(c.inicio).toLocaleDateString("pt-BR")}
                    {c.tipo === "Aluguel" && <> → {new Date(c.fim).toLocaleDateString("pt-BR")}</>}
                  </p>
                </div>
                <p className="font-mono text-sm font-bold text-primary">
                  {brl(c.valor)}
                  {c.tipo === "Aluguel" && <span className="text-[10px] font-medium text-foreground/55">/mês</span>}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}