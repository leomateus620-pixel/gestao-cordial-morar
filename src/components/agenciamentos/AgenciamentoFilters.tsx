import { Building2, RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getAgenciamentoPeriodLabel, getAgenciamentoStatusLabel } from "@/services/agenciamentos";
import type {
  AgenciamentoChecklistFilter,
  AgenciamentoFiltersState,
  AgenciamentoPeriodFilter,
  AgenciamentoStatusFilter,
  AgenciamentoTipoImovel,
} from "@/types/agenciamento";
import { agenciamentoTipoOptions } from "@/types/agenciamento";
import type { Corretor } from "@/types/corretor";
import { cn } from "@/lib/utils";

type AgenciamentoFiltersProps = {
  filters: AgenciamentoFiltersState;
  corretores: Corretor[];
  isAdmin: boolean;
  onFiltersChange: (filters: Partial<AgenciamentoFiltersState>) => void;
  onReset: () => void;
};

const periodOptions: AgenciamentoPeriodFilter[] = ["mes", "ultimos_30", "trimestre", "ano"];
const statusOptions: AgenciamentoStatusFilter[] = [
  "todos",
  "novo",
  "em_andamento",
  "pendentes",
  "aguardando_validacao",
  "validado",
  "cancelado",
];

const checklistOptions: Array<{ value: AgenciamentoChecklistFilter; label: string }> = [
  { value: "todos", label: "Checklist" },
  { value: "com_placa", label: "Com placa" },
  { value: "sem_placa", label: "Sem placa" },
  { value: "com_fotos", label: "Com fotos" },
  { value: "sem_fotos", label: "Sem fotos" },
  { value: "no_site", label: "No site" },
  { value: "fora_site", label: "Fora do site" },
  { value: "com_drive", label: "Com Drive" },
  { value: "sem_drive", label: "Sem Drive" },
];

export function AgenciamentoFilters({
  filters,
  corretores,
  isAdmin,
  onFiltersChange,
  onReset,
}: AgenciamentoFiltersProps) {
  return (
    <section className="premium-card p-3 sm:p-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-9 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
            <SlidersHorizontal className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-tight">Filtros de agenciamento</p>
            <p className="truncate text-[11px] text-foreground/50">
              Encontre pendencias por imobiliaria, status, checklist e responsavel.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 rounded-2xl bg-white/[0.55] p-1 ring-1 ring-foreground/5 sm:w-fit">
          {[
            { value: "todas", label: "Todas" },
            { value: "cordial", label: "Cordial" },
            { value: "morar", label: "Morar" },
          ].map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() =>
                onFiltersChange({
                  imobiliaria: item.value as AgenciamentoFiltersState["imobiliaria"],
                })
              }
              className={cn(
                "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-bold transition-all active:scale-[0.98]",
                filters.imobiliaria === item.value
                  ? "bg-primary text-white shadow-[0_10px_24px_-14px_rgba(30,100,125,0.75)]"
                  : "text-foreground/55 hover:bg-white/[0.7] hover:text-primary",
              )}
            >
              <Building2 className="size-3.5" />
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-[0.9fr_0.95fr_0.95fr_0.95fr_minmax(180px,1.15fr)_auto]">
        <Select
          value={filters.periodo}
          onValueChange={(periodo) =>
            onFiltersChange({ periodo: periodo as AgenciamentoPeriodFilter })
          }
        >
          <SelectTrigger className="h-11 rounded-2xl border-white/[0.65] bg-white/[0.58]">
            <SelectValue placeholder="Periodo" />
          </SelectTrigger>
          <SelectContent>
            {periodOptions.map((periodo) => (
              <SelectItem key={periodo} value={periodo}>
                {getAgenciamentoPeriodLabel(periodo)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.status}
          onValueChange={(status) =>
            onFiltersChange({ status: status as AgenciamentoStatusFilter })
          }
        >
          <SelectTrigger className="h-11 rounded-2xl border-white/[0.65] bg-white/[0.58]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map((status) => (
              <SelectItem key={status} value={status}>
                {getAgenciamentoStatusLabel(status)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.tipoImovel}
          onValueChange={(tipoImovel) =>
            onFiltersChange({ tipoImovel: tipoImovel as "todos" | AgenciamentoTipoImovel })
          }
        >
          <SelectTrigger className="h-11 rounded-2xl border-white/[0.65] bg-white/[0.58]">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            {agenciamentoTipoOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.checklist}
          onValueChange={(checklist) =>
            onFiltersChange({ checklist: checklist as AgenciamentoChecklistFilter })
          }
        >
          <SelectTrigger className="h-11 rounded-2xl border-white/[0.65] bg-white/[0.58]">
            <SelectValue placeholder="Checklist" />
          </SelectTrigger>
          <SelectContent>
            {checklistOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
          {isAdmin && (
            <Select
              value={filters.corretorId}
              onValueChange={(corretorId) => onFiltersChange({ corretorId })}
            >
              <SelectTrigger className="h-11 rounded-2xl border-white/[0.65] bg-white/[0.58]">
                <SelectValue placeholder="Corretor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os corretores</SelectItem>
                {corretores.map((corretor) => (
                  <SelectItem key={corretor.id} value={corretor.id}>
                    {corretor.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <label className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground/38" />
            <input
              value={filters.busca}
              onChange={(event) => onFiltersChange({ busca: event.target.value })}
              placeholder="Endereco, bairro, proprietario..."
              className="h-11 w-full rounded-2xl border border-white/[0.65] bg-white/[0.58] pl-9 pr-3 text-sm outline-none transition-all placeholder:text-foreground/35 focus:border-primary/30 focus:bg-white/[0.8] focus:ring-2 focus:ring-primary/10"
            />
          </label>
        </div>

        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-11 shrink-0 rounded-2xl border-white/[0.65] bg-white/[0.58] text-foreground/55 hover:text-primary"
          onClick={onReset}
          aria-label="Limpar filtros"
        >
          <RotateCcw className="size-4" />
        </Button>
      </div>
    </section>
  );
}
