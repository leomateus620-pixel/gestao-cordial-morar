import { createFileRoute } from "@tanstack/react-router";
import { useApp, useFiltered } from "@/store/app-store";
import { brl } from "@/lib/format";

export const Route = createFileRoute("/_app/corretores")({
  head: () => ({ meta: [{ title: "Corretores — Gestão Cordial" }] }),
  component: Page,
});

function Page() {
  const corretores = useFiltered(useApp((s) => s.corretores));
  return (
    <div className="space-y-3">
      {corretores.map((c) => (
        <div key={c.id} className="glass-panel rounded-3xl p-4">
          <div className="flex items-center gap-3">
            <div className="grid size-12 shrink-0 place-items-center rounded-full bg-primary/12 text-sm font-bold text-primary">
              {c.iniciais}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{c.nome}</p>
              <p className="text-[11px] text-foreground/55">{c.creci} · {c.imobiliaria === "cordial" ? "Cordial" : "Morar"}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-white/40 p-2">
              <p className="text-[9px] font-medium uppercase tracking-wider text-foreground/50">Atend.</p>
              <p className="mt-0.5 font-mono text-base font-bold">{c.atendimentosMes}</p>
            </div>
            <div className="rounded-xl bg-white/40 p-2">
              <p className="text-[9px] font-medium uppercase tracking-wider text-foreground/50">Fechad.</p>
              <p className="mt-0.5 font-mono text-base font-bold">{c.contratosFechados}</p>
            </div>
            <div className="rounded-xl bg-primary/10 p-2">
              <p className="text-[9px] font-medium uppercase tracking-wider text-primary/80">Comis.</p>
              <p className="mt-0.5 font-mono text-base font-bold text-primary">{brl(c.comissaoMes, { compact: true })}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}