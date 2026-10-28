import { useState } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { compactMarketingRange, validateMarketingPeriod } from "@/lib/marketing/period-control";
import { currentCompetence, shiftCompetence } from "@/services/marketing-insights";
import type { MarketingDashboardQuery } from "@/lib/marketing/query-state";
import type { DateRange } from "@/services/marketing-insights";

export function MarketingPeriodControl({
  query,
  ranges,
  onChange,
  timeZone = "America/Sao_Paulo",
}: {
  query: MarketingDashboardQuery;
  ranges: { current: DateRange; previous: DateRange };
  onChange: (patch: Partial<MarketingDashboardQuery>) => void;
  timeZone?: string;
}) {
  const [open, setOpen] = useState(false);
  const appliedError =
    query.since || query.until
      ? validateMarketingPeriod(query.since ?? "", query.until ?? "")
      : null;
  const [draft, setDraft] = useState(ranges.current);
  const [month, setMonth] = useState(query.competence);
  const [error, setError] = useState<string | null>(null);
  const date = (value: string) => new Date(`${value}T12:00:00`);
  const iso = (value: Date | undefined) =>
    value
      ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`
      : "";
  const monthLabel = date(`${month}-01`).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setDraft(
            appliedError ? { since: query.since ?? "", until: query.until ?? "" } : ranges.current,
          );
          setMonth(query.competence);
          setError(appliedError);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="h-11 min-w-0 gap-2 rounded-xl bg-card px-3 font-normal sm:h-10"
          aria-label={`Período: ${compactMarketingRange(ranges.current)}. Comparação: ${compactMarketingRange(ranges.previous)}`}
        >
          <CalendarDays className="size-4 shrink-0" />
          <span className="truncate tabular-nums">{compactMarketingRange(ranges.current)}</span>
          <ChevronDown className="size-3.5 shrink-0" />
        </Button>
      </PopoverTrigger>
      <span
        className="self-center whitespace-nowrap text-xs text-foreground/65"
        title={`Comparação com ${compactMarketingRange(ranges.previous)}`}
      >
        vs. {compactMarketingRange(ranges.previous, false)}
      </span>
      {appliedError && (
        <span role="alert" className="basis-full text-xs text-red-800">
          Intervalo inválido; exibindo o mês selecionado. Abra o período para revisar as datas.
        </span>
      )}
      <PopoverContent
        align="start"
        className="w-[min(23rem,calc(100vw-2rem))] max-h-[min(44rem,85dvh)] overflow-y-auto rounded-xl p-3"
      >
        <h2 className="text-sm font-semibold">Período e comparação</h2>
        <div className="mt-3 flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Mês anterior"
            onClick={() => setMonth(shiftCompetence(month, -1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-sm font-medium capitalize">{monthLabel}</span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Próximo mês"
            disabled={month >= currentCompetence()}
            onClick={() => setMonth(shiftCompetence(month, 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <Calendar
          locale={ptBR}
          mode="range"
          month={date(`${month}-01`)}
          onMonthChange={(value) => setMonth(iso(value).slice(0, 7))}
          selected={{
            from: draft.since ? date(draft.since) : undefined,
            to: draft.until ? date(draft.until) : undefined,
          }}
          onSelect={(range) => {
            setDraft({ since: iso(range?.from), until: iso(range?.to) });
            setError(null);
          }}
          className="mx-auto"
        />
        <div className="grid grid-cols-2 gap-2">
          <label className="min-w-0 text-xs font-medium">
            Desde
            <Input
              type="date"
              className="mt-1 h-10 w-full min-w-0 px-2 text-xs"
              value={draft.since}
              onChange={(event) => {
                setDraft({ ...draft, since: event.target.value });
                setError(null);
              }}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "marketing-period-error" : undefined}
            />
          </label>
          <label className="min-w-0 text-xs font-medium">
            Até
            <Input
              type="date"
              className="mt-1 h-10 w-full min-w-0 px-2 text-xs"
              value={draft.until}
              onChange={(event) => {
                setDraft({ ...draft, until: event.target.value });
                setError(null);
              }}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "marketing-period-error" : undefined}
            />
          </label>
        </div>
        {error && (
          <p id="marketing-period-error" role="alert" className="mt-2 text-xs text-red-800">
            {error}
          </p>
        )}
        <p className="mt-3 text-xs leading-relaxed text-foreground/70">
          {query.since && query.until
            ? "Intervalos personalizados comparam a mesma quantidade de dias imediatamente anterior."
            : "O mês em andamento compara os mesmos dias do mês anterior, respeitando o último dia disponível."}
        </p>
        <p className="mt-1 text-xs text-foreground/70">
          Aplicado: {compactMarketingRange(ranges.current)} · vs.{" "}
          {compactMarketingRange(ranges.previous)}. Fuso: {timeZone}.
        </p>
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange({ competence: month, since: undefined, until: undefined });
              setOpen(false);
            }}
          >
            Usar mês selecionado
          </Button>
          <Button
            size="sm"
            onClick={() => {
              const problem = validateMarketingPeriod(draft.since, draft.until);
              setError(problem);
              if (!problem) {
                onChange({ since: draft.since, until: draft.until });
                setOpen(false);
              }
            }}
          >
            Aplicar intervalo
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
