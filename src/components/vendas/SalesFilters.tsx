import { Search, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SalesFilter } from "@/types/sale";

const filters: Array<{ id: SalesFilter; label: string }> = [
  { id: "todos", label: "Todos" },
  { id: "mes", label: "Este mês" },
  { id: "com_contrato", label: "Com contrato" },
  { id: "sem_contrato", label: "Contrato pendente" },
  { id: "maior_valor", label: "Maior valor" },
  { id: "recentes", label: "Recentes" },
  { id: "concluidas", label: "Concluídas" },
  { id: "em_analise", label: "Em revisão" },
];

export function SalesFilters({
  filter,
  onFilterChange,
  search,
  onSearchChange,
}: {
  filter: SalesFilter;
  onFilterChange: (filter: SalesFilter) => void;
  search: string;
  onSearchChange: (value: string) => void;
}) {
  return (
    <section className="glass-panel-strong rounded-3xl p-3" aria-label="Busca e filtros de vendas">
      <div className="grid gap-3 lg:grid-cols-[minmax(18rem,1fr)_auto] lg:items-center">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-foreground/45" />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Buscar comprador, imóvel, endereço, cidade, valor ou responsável"
            className="h-11 w-full rounded-2xl border border-white/65 bg-white/72 pl-10 pr-3 text-sm font-medium text-foreground shadow-sm outline-none transition placeholder:text-foreground/38 focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
            aria-label="Buscar vendas realizadas"
          />
        </div>

        <div className="flex min-w-0 items-center gap-2">
          <span className="hidden size-9 shrink-0 place-items-center rounded-2xl bg-white/55 text-foreground/50 ring-1 ring-white/70 sm:grid">
            <SlidersHorizontal className="size-4" />
          </span>
          <div className="no-scrollbar flex min-w-0 gap-2 overflow-x-auto pb-1 lg:pb-0">
            {filters.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onFilterChange(item.id)}
                className={cn(
                  "h-9 shrink-0 rounded-full px-3.5 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-[0.98]",
                  filter === item.id
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                    : "bg-white/62 text-foreground/62 ring-1 ring-white/70 hover:bg-white/80 hover:text-foreground",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
