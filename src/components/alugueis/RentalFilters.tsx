import { Search } from "lucide-react";
import type { RentalFilter } from "@/types/rental";

const OPTIONS: { id: RentalFilter; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "ativos", label: "Ativos" },
  { id: "pendentes", label: "Pendentes" },
  { id: "vencidos", label: "Vencidos" },
  { id: "atrasados", label: "Atrasados" },
  { id: "encerrados", label: "Encerrados" },
];

export function RentalFilters({
  filter,
  onFilterChange,
  search,
  onSearchChange,
}: {
  filter: RentalFilter;
  onFilterChange: (f: RentalFilter) => void;
  search: string;
  onSearchChange: (v: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-foreground/45" />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Buscar imóvel, locatário, bairro…"
          className="w-full rounded-2xl border border-white/60 bg-white/70 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
        />
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {OPTIONS.map((o) => (
          <button
            key={o.id}
            onClick={() => onFilterChange(o.id)}
            className={
              "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition " +
              (filter === o.id
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                : "glass-panel text-foreground/65")
            }
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
