import { useNavigate } from "@tanstack/react-router";
import { brl } from "@/lib/format";
import { chartCordial, chartMorar } from "@/lib/chart-palette";
import { cn } from "@/lib/utils";
import type { PortfolioTopValueItem } from "@/types/portfolio";

/** Top 5 valores — Venda e Aluguel nunca aparecem na mesma lista. */
export function PortfolioTopValues({
  items,
  operationLabel,
}: {
  items: PortfolioTopValueItem[];
  operationLabel: string;
}) {
  const navigate = useNavigate();

  if (items.length === 0) {
    return (
      <p className="rounded-2xl bg-foreground/[0.04] px-4 py-6 text-center text-[12px] font-semibold text-foreground/50">
        Sem valores publicados para {operationLabel.toLowerCase()} neste recorte.
      </p>
    );
  }

  return (
    <ol className="space-y-1.5">
      {items.map((item) => {
        const codigo = item.codigoCordial ?? item.codigoMorar ?? item.codigo;
        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => navigate({ to: "/imoveis/$imovelId", params: { imovelId: item.id } })}
              className="flex w-full items-center gap-2.5 rounded-2xl px-2 py-1.5 text-left transition hover:bg-foreground/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <span className="font-mono text-[10px] font-bold tabular-nums text-foreground/35">
                {String(item.rank).padStart(2, "0")}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-mono text-[13px] font-black tabular-nums leading-none text-foreground">
                  {brl(item.valor, { compact: true })}
                </span>
                <span className="mt-1 truncate text-[10.5px] font-semibold text-foreground/45">
                  {[item.tipo, item.regionLabel].filter(Boolean).join(" · ") || "Sem descrição"}
                  {codigo ? ` · ${codigo}` : ""}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                {item.inCordial && <Dot color={chartCordial} label="Cordial" />}
                {item.inMorar && <Dot color={chartMorar} label="Morar" />}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function Dot({ color, label }: { color: string; label: string }) {
  return (
    <span
      aria-label={label}
      title={label}
      className={cn("size-2 rounded-full ring-1 ring-white")}
      style={{ background: color }}
    />
  );
}
