import { useNavigate } from "@tanstack/react-router";
import { useIsMobile } from "@/hooks/use-mobile";
import { chartCordial, chartMorar } from "@/lib/chart-palette";
import { cn } from "@/lib/utils";
import type {
  PortfolioOperationFilter,
  PortfolioProviderFilter,
  PortfolioRegion,
} from "@/types/portfolio";

/** Ranking de bairros e loteamentos — cada linha abre o catálogo já filtrado. */
export function PortfolioRegionChart({
  regions,
  provider,
  operation,
}: {
  regions: PortfolioRegion[];
  provider: PortfolioProviderFilter;
  operation: PortfolioOperationFilter;
}) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const items = regions.slice(0, isMobile ? 5 : 6);
  const max = items.reduce((acc, item) => Math.max(acc, item.uniqueCount), 0) || 1;

  const open = (region: PortfolioRegion) => {
    const search: Record<string, unknown> = { bairro: region.label };
    if (provider === "cordial" || provider === "morar") search["carteira"] = provider;
    if (provider === "ambos") search["carteira"] = "ambas";
    if (operation !== "todos") search["operacao"] = operation;
    navigate({ to: "/imoveis", search });
  };

  if (items.length === 0) {
    return (
      <p className="rounded-2xl bg-foreground/[0.04] px-4 py-6 text-center text-[12px] font-semibold text-foreground/50">
        Nenhum bairro informado neste recorte.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((region, index) => {
        const width = Math.max(6, Math.round((region.uniqueCount / max) * 100));
        return (
          <li key={region.key}>
            <button
              type="button"
              onClick={() => open(region)}
              title={`${region.label} · ${region.uniqueCount} imóveis — Venda ${region.saleCount} · Aluguel ${region.rentalCount} · Cordial ${region.cordialCount} · Morar ${region.morarCount} · Nos dois sites ${region.bothProvidersCount}`}
              className="group w-full rounded-2xl px-2 py-1.5 text-left transition hover:bg-foreground/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="font-mono text-[10px] font-bold tabular-nums text-foreground/35">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="truncate text-[12.5px] font-bold tracking-tight text-foreground">
                    {region.label}
                  </span>
                </span>
                <span className="flex shrink-0 items-baseline gap-1.5">
                  <span className="font-mono text-[13px] font-black tabular-nums text-foreground">
                    {region.uniqueCount}
                  </span>
                  <span className="font-mono text-[10px] font-bold tabular-nums text-foreground/40">
                    {region.percentage.toLocaleString("pt-BR")}%
                  </span>
                </span>
              </div>
              <span className="mt-1.5 block h-2 w-full overflow-hidden rounded-full bg-foreground/[0.06]">
                <span
                  className={cn("block h-full rounded-full transition-[width] duration-500")}
                  style={{
                    width: `${width}%`,
                    background: `linear-gradient(90deg, ${chartCordial} 0%, ${chartMorar} 100%)`,
                  }}
                />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
