import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Mail, Phone, Search } from "lucide-react";
import { useApp, useFiltered } from "@/store/app-store";
import { Fab } from "@/components/fab";
import { NovoClienteSheet } from "@/components/sheets/novo-cliente";
import { ClientCard } from "@/components/shared/client-card";
import { EmptyState } from "@/components/shared/empty-state";
import { brl } from "@/lib/format";

export const Route = createFileRoute("/_app/clientes")({
  head: () => ({ meta: [{ title: "Clientes — Gestão Cordial" }] }),
  component: Page,
});

function Page() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const clientes = useFiltered(useApp((s) => s.clientes));

  const list = useMemo(
    () => clientes.filter((c) => c.nome.toLowerCase().includes(q.toLowerCase())),
    [clientes, q],
  );

  return (
    <>
      <div className="glass-panel mb-4 flex items-center gap-2 rounded-2xl px-3 py-2">
        <Search className="size-4 text-foreground/50" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar cliente..."
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-foreground/40"
        />
      </div>

      <div className="space-y-2">
        {list.map((c) => (
          <Link
            key={c.id}
            to="/clientes/$clienteId"
            params={{ clienteId: c.id }}
            className="block glass-panel rounded-2xl p-3 transition hover:bg-white/70"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/12 text-xs font-bold text-primary">
                  {c.iniciais}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{c.nome}</p>
                  <p className="truncate text-[11px] text-foreground/55">{c.interesse}</p>
                </div>
              </div>
              <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
                {c.tipo}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-white/40 pt-2 text-[11px] text-foreground/60">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <Phone className="size-3" />
                  {c.telefone}
                </span>
              </div>
              {c.orcamento > 0 && (
                <span className="font-mono font-semibold text-foreground/80">
                  {brl(c.orcamento, { compact: true })}
                </span>
              )}
            </div>
            {c.email && (
              <div className="mt-1 flex items-center gap-1 text-[11px] text-foreground/55">
                <Mail className="size-3" />
                {c.email}
              </div>
            )}
          </Link>
        ))}
        {list.length === 0 && (
          <EmptyState
            title="Nenhum cliente encontrado"
            description="Tente buscar por outro nome ou cadastre um novo cliente."
          />
        )}
      </div>

      <Fab onClick={() => setOpen(true)} label="Novo cliente" />
      <NovoClienteSheet open={open} onOpenChange={setOpen} />
    </>
  );
}
