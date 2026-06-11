import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Bed, Maximize2 } from "lucide-react";
import { useApp, useFiltered } from "@/store/app-store";
import { StatusBadge } from "@/components/status-badge";
import { Fab } from "@/components/fab";
import { NovoImovelSheet } from "@/components/sheets/novo-imovel";
import { brl } from "@/lib/format";

const filters = ["Todos", "Venda", "Aluguel"] as const;

export const Route = createFileRoute("/_app/imoveis")({
  head: () => ({ meta: [{ title: "Imóveis — Gestão Cordial" }] }),
  component: Page,
});

function Page() {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<(typeof filters)[number]>("Todos");
  const imoveis = useFiltered(useApp((s) => s.imoveis));

  const list = useMemo(() => imoveis.filter((i) => f === "Todos" || i.finalidade === f), [imoveis, f]);

  return (
    <>
      <div className="mb-4 flex gap-2">
        {filters.map((x) => (
          <button
            key={x}
            onClick={() => setF(x)}
            className={
              "rounded-full px-3 py-1.5 text-xs font-medium transition " +
              (f === x
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                : "glass-panel text-foreground/65")
            }
          >
            {x}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {list.map((im) => (
          <article key={im.id} className="glass-panel overflow-hidden rounded-3xl">
            <img src={im.foto} alt={im.titulo} loading="lazy" className="aspect-[16/10] w-full object-cover" />
            <div className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{im.titulo}</p>
                  <p className="truncate text-[11px] text-foreground/55">{im.endereco} · {im.bairro}, {im.cidade}</p>
                </div>
                <StatusBadge status={im.status} />
              </div>
              <div className="mt-3 flex items-end justify-between">
                <div className="flex gap-3 text-[11px] text-foreground/60">
                  <span className="flex items-center gap-1"><Bed className="size-3" />{im.quartos} qts</span>
                  <span className="flex items-center gap-1"><Maximize2 className="size-3" />{im.area} m²</span>
                  <span className="rounded-full bg-foreground/8 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-foreground/60">
                    {im.finalidade}
                  </span>
                </div>
                <p className="font-mono text-sm font-bold text-primary">
                  {brl(im.valor)}
                  {im.finalidade === "Aluguel" && <span className="text-[10px] font-medium text-foreground/55">/mês</span>}
                </p>
              </div>
            </div>
          </article>
        ))}
      </div>

      <Fab onClick={() => setOpen(true)} label="Novo imóvel" />
      <NovoImovelSheet open={open} onOpenChange={setOpen} />
    </>
  );
}