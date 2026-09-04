import { Link } from "@tanstack/react-router";
import { LayoutGrid, Loader2, Plus, Rows3 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CatalogView } from "../PropertyCatalogCard";

export function CatalogViewToggle({
  value,
  onChange,
  className,
}: {
  value: CatalogView;
  onChange: (view: CatalogView) => void;
  className?: string;
}) {
  const options: Array<{ value: CatalogView; label: string; icon: typeof LayoutGrid }> = [
    { value: "grid", label: "Cartões", icon: LayoutGrid },
    { value: "list", label: "Lista", icon: Rows3 },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Modo de visualização"
      className={cn(
        "inline-flex h-9 items-center gap-0.5 rounded-full border border-white/70 bg-white/60 p-0.5 backdrop-blur-md",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={option.label}
            title={option.label}
            onClick={() => onChange(option.value)}
            className={cn(
              "grid size-8 place-items-center rounded-full transition-colors",
              active
                ? "bg-primary text-white shadow-[0_6px_14px_-6px_rgba(30,100,125,0.6)]"
                : "text-foreground/50 hover:text-foreground",
            )}
          >
            <option.icon className="size-4" strokeWidth={active ? 2.4 : 2} />
          </button>
        );
      })}
    </div>
  );
}

export function CatalogToolbar({
  total,
  loading,
  summary,
  view,
  onViewChange,
}: {
  total: number;
  loading?: boolean;
  /** Complemento do contador (ex.: "Catálogo ativo · Cordial"). */
  summary?: string;
  view: CatalogView;
  onViewChange: (view: CatalogView) => void;
}) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold tracking-tight leading-none text-foreground lg:text-2xl">
          Imóveis
        </h1>
        <p
          className="mt-1.5 flex items-center gap-1.5 text-[12px] font-medium text-foreground/50"
          aria-live="polite"
        >
          {loading ? (
            <Loader2 className="size-3.5 animate-spin text-primary/70" aria-label="Atualizando" />
          ) : null}
          <span className="tabular-nums text-foreground/75">{total.toLocaleString("pt-BR")}</span>
          {total === 1 ? "imóvel" : "imóveis"}
          {summary ? <span className="truncate text-foreground/40">· {summary}</span> : null}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <CatalogViewToggle value={view} onChange={onViewChange} />
        <Link
          to="/imoveis/novo"
          className="system-button hidden h-9 items-center gap-1.5 rounded-full pl-3 pr-4 text-[13px] font-semibold transition hover:brightness-110 active:scale-[0.98] lg:inline-flex"
        >
          <Plus className="size-4" strokeWidth={2.6} /> Novo imóvel
        </Link>
      </div>
    </div>
  );
}
