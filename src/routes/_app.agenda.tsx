import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Calendar, Clock } from "lucide-react";
import { useApp, useFiltered } from "@/store/app-store";
import { Fab } from "@/components/fab";
import { NovoCompromissoSheet } from "@/components/sheets/novo-compromisso";
import { shortTime } from "@/lib/format";

const tipoCor: Record<string, string> = {
  Visita: "bg-primary/15 text-primary",
  Reunião: "bg-sky-500/15 text-sky-700",
  Vistoria: "bg-amber-500/15 text-amber-700",
  Assinatura: "bg-emerald-500/15 text-emerald-700",
};

export const Route = createFileRoute("/_app/agenda")({
  head: () => ({ meta: [{ title: "Agenda — Gestão Cordial" }] }),
  component: Page,
});

function Page() {
  const [open, setOpen] = useState(false);
  const agenda = useFiltered(useApp((s) => s.agenda));
  const clientes = useApp((s) => s.clientes);
  const imoveis = useApp((s) => s.imoveis);
  const corretores = useApp((s) => s.corretores);

  const grupos = useMemo(() => {
    const map = new Map<string, typeof agenda>();
    [...agenda]
      .sort((a, b) => a.data.localeCompare(b.data))
      .forEach((c) => {
        const k = c.data.slice(0, 10);
        if (!map.has(k)) map.set(k, []);
        map.get(k)!.push(c);
      });
    return Array.from(map.entries());
  }, [agenda]);

  return (
    <>
      <div className="space-y-5">
        {grupos.map(([dia, items]) => {
          const d = new Date(dia + "T00:00:00");
          const label = d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
          return (
            <section key={dia}>
              <div className="mb-2 flex items-center gap-2 px-1">
                <Calendar className="size-3.5 text-primary" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground/70">{label}</h3>
              </div>
              <div className="space-y-2">
                {items.map((c) => {
                  const cli = clientes.find((x) => x.id === c.clienteId);
                  const im = imoveis.find((x) => x.id === c.imovelId);
                  const cor = corretores.find((x) => x.id === c.corretorId);
                  return (
                    <div key={c.id} className="glass-panel flex gap-3 rounded-2xl p-3">
                      <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-white/40 py-2">
                        <span className="font-mono text-sm font-bold">{shortTime(c.data)}</span>
                        <span className="text-[9px] text-foreground/55">{c.duracaoMin}min</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-sm font-semibold">{c.titulo}</p>
                          <span className={"rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider " + (tipoCor[c.tipo] ?? "")}>
                            {c.tipo}
                          </span>
                        </div>
                        <p className="truncate text-[11px] text-foreground/55">{cli?.nome} · {im?.titulo}</p>
                        <p className="mt-0.5 flex items-center gap-1 text-[10px] text-foreground/45">
                          <Clock className="size-3" />{cor?.nome}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      <Fab onClick={() => setOpen(true)} label="Novo compromisso" />
      <NovoCompromissoSheet open={open} onOpenChange={setOpen} />
    </>
  );
}