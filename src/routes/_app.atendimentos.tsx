import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useApp, useFiltered } from "@/store/app-store";
import { StatusBadge } from "@/components/status-badge";
import { Fab } from "@/components/fab";
import { NovoAtendimentoSheet } from "@/components/sheets/novo-atendimento";
import { timeAgo } from "@/lib/format";

const statuses = ["Todos", "Aberto", "Em visita", "Proposta", "Fechado", "Perdido"] as const;

export const Route = createFileRoute("/_app/atendimentos")({
  head: () => ({ meta: [{ title: "Atendimentos — Gestão Cordial" }] }),
  component: Page,
});

function Page() {
  const [open, setOpen] = useState(false);
  const [filtro, setFiltro] = useState<(typeof statuses)[number]>("Todos");
  const [q, setQ] = useState("");
  const atendimentos = useFiltered(useApp((s) => s.atendimentos));
  const clientes = useApp((s) => s.clientes);
  const corretores = useApp((s) => s.corretores);
  const imoveis = useApp((s) => s.imoveis);

  const list = useMemo(() => {
    return atendimentos.filter((a) => {
      if (filtro !== "Todos" && a.status !== filtro) return false;
      if (!q) return true;
      const cli = clientes.find((c) => c.id === a.clienteId)?.nome.toLowerCase() ?? "";
      return cli.includes(q.toLowerCase());
    });
  }, [atendimentos, filtro, q, clientes]);

  return (
    <>
      <div className="glass-panel mb-3 flex items-center gap-2 rounded-2xl px-3 py-2">
        <Search className="size-4 text-foreground/50" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar cliente..."
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-foreground/40"
        />
      </div>

      <div className="no-scrollbar -mx-5 mb-4 flex gap-2 overflow-x-auto px-5">
        {statuses.map((s) => (
          <button
            key={s}
            onClick={() => setFiltro(s)}
            className={
              "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition " +
              (filtro === s
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                : "glass-panel text-foreground/65")
            }
          >
            {s}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {list.map((a) => {
          const cli = clientes.find((c) => c.id === a.clienteId);
          const cor = corretores.find((c) => c.id === a.corretorId);
          const im = imoveis.find((i) => i.id === a.imovelId);
          return (
            <div key={a.id} className="glass-panel rounded-2xl p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/12 text-[11px] font-bold text-primary">
                    {cli?.iniciais}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{cli?.nome}</p>
                    <p className="truncate text-[11px] text-foreground/55">{im?.titulo}</p>
                    <p className="mt-0.5 text-[10px] text-foreground/45">Corretor: {cor?.nome}</p>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <StatusBadge status={a.status} />
                  <p className="mt-1 font-mono text-[9px] text-foreground/45">{timeAgo(a.criadoEm)}</p>
                </div>
              </div>
              {a.observacoes && (
                <p className="mt-2 rounded-xl bg-white/40 p-2 text-[11px] text-foreground/65">
                  {a.observacoes}
                </p>
              )}
            </div>
          );
        })}
        {list.length === 0 && (
          <p className="glass-panel rounded-2xl p-6 text-center text-sm text-foreground/55">
            Nenhum atendimento encontrado.
          </p>
        )}
      </div>

      <Fab onClick={() => setOpen(true)} label="Novo atendimento" />
      <NovoAtendimentoSheet open={open} onOpenChange={setOpen} />
    </>
  );
}