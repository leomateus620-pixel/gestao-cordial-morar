import { useMemo, useState, type ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  Building2,
  Check,
  CircleDashed,
  DoorClosed,
  Globe,
  Instagram,
  Loader2,
  MessageCircle,
  SlidersHorizontal,
  Store,
  Users,
} from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { ATTENDANCES_QUERY_KEY } from "@/hooks/useAttendances";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSession } from "@/lib/auth-mock";
import { listAttendances } from "@/lib/attendances/attendances.functions";
import { chartCordial, chartMorar, chartMuted, chartSystem } from "@/lib/chart-palette";
import { cn } from "@/lib/utils";
import { useApp } from "@/store/app-store";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  atendimentoOrigemLabel,
  atendimentoOrigemOptions,
  type Atendimento,
  type OrigemLeadAtendimento,
} from "@/types/atendimento";

type OriginKey = OrigemLeadAtendimento | "nao_informado";
type PeriodKey = "sete_dias" | "mes" | "noventa" | "ano" | "todos";
type AgencyKey = "todas" | "cordial" | "morar";
type SourceKey = "todas" | "lead_imobiliaria" | "cliente_particular_corretor" | "nao_informado";

type OriginRow = {
  key: OriginKey;
  label: string;
  value: number;
  percent: number;
  color: string;
  Icon: ComponentType<{ className?: string }>;
};

const PERIODS: Array<{ key: PeriodKey; label: string }> = [
  { key: "sete_dias", label: "7 dias" },
  { key: "mes", label: "Mês" },
  { key: "noventa", label: "90 dias" },
  { key: "ano", label: "Ano" },
  { key: "todos", label: "Tudo" },
];

const AGENCIES: Array<{ key: AgencyKey; label: string }> = [
  { key: "todas", label: "Todas" },
  { key: "cordial", label: "Cordial" },
  { key: "morar", label: "Morar" },
];

const SOURCES: Array<{ key: SourceKey; label: string }> = [
  { key: "todas", label: "Todas" },
  { key: "lead_imobiliaria", label: "Lead da imobiliária" },
  { key: "cliente_particular_corretor", label: "Cliente particular" },
  { key: "nao_informado", label: "Não informado" },
];

const ORIGIN_VISUALS: Record<
  OriginKey,
  { color: string; Icon: ComponentType<{ className?: string }> }
> = {
  whatsapp: { color: "#2F9E68", Icon: MessageCircle },
  instagram: { color: "#C45A8B", Icon: Instagram },
  site: { color: chartSystem, Icon: Globe },
  portal: { color: chartCordial, Icon: Building2 },
  indicacao: { color: chartMorar, Icon: Users },
  presencial: { color: "#D6A437", Icon: Store },
  porta_fria: { color: "#7C6BB0", Icon: DoorClosed },
  outro: { color: chartMuted, Icon: CircleDashed },
  nao_informado: { color: "#B7BCC4", Icon: CircleDashed },
};

const EMPTY: Atendimento[] = [];

export function LeadOriginCard({ className }: { className?: string }) {
  const session = useSession();
  const selectedAgency = useApp((state) => state.agency) as AgencyKey;
  const isMobile = useIsMobile();

  const [period, setPeriod] = useState<PeriodKey>("mes");
  const [agency, setAgency] = useState<AgencyKey>("todas");
  const [source, setSource] = useState<SourceKey>("todas");
  const [broker, setBroker] = useState<string>("todos");
  const [focused, setFocused] = useState<OriginKey | null>(null);

  const query = useQuery({
    queryKey: ATTENDANCES_QUERY_KEY,
    queryFn: () => listAttendances(),
    enabled: Boolean(session),
    staleTime: 15_000,
  });

  const atendimentos = (query.data ?? EMPTY) as Atendimento[];
  const effectiveAgency: AgencyKey = agency === "todas" ? selectedAgency : agency;

  const brokerOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of atendimentos) {
      if (item.corretorId) map.set(item.corretorId, item.corretorNome ?? "Corretor");
    }
    return [...map.entries()]
      .map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [atendimentos]);

  const filtered = useMemo(() => {
    const start = periodStart(period);
    return atendimentos.filter((item) => {
      if (start) {
        const created = new Date(item.criadoEm);
        if (Number.isNaN(created.getTime()) || created < start) return false;
      }
      if (effectiveAgency !== "todas") {
        if (item.imobiliaria !== effectiveAgency && item.imobiliaria !== "ambas") return false;
      }
      if (source !== "todas") {
        const value = item.fonteProspeccao ?? "nao_informado";
        if (value !== source) return false;
      }
      if (broker !== "todos" && item.corretorId !== broker) return false;
      return true;
    });
  }, [atendimentos, broker, effectiveAgency, period, source]);

  const { rows, total } = useMemo(() => {
    const counts = new Map<OriginKey, number>();
    for (const item of filtered) {
      const key = (item.origem ?? "nao_informado") as OriginKey;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const sum = filtered.length;
    const list: OriginRow[] = [...counts.entries()]
      .map(([key, value]) => ({
        key,
        label:
          key === "nao_informado"
            ? "Não informado"
            : atendimentoOrigemLabel(key as OrigemLeadAtendimento),
        value,
        percent: sum > 0 ? (value / sum) * 100 : 0,
        color: ORIGIN_VISUALS[key]?.color ?? chartMuted,
        Icon: ORIGIN_VISUALS[key]?.Icon ?? CircleDashed,
      }))
      .sort((a, b) => b.value - a.value);
    return { rows: list, total: sum };
  }, [filtered]);

  const leader = rows[0] ?? null;
  const filtersActive =
    period !== "mes" || agency !== "todas" || source !== "todas" || broker !== "todos";

  const filtersBody = (
    <div className="space-y-4">
      <FilterGroup label="Período">
        {PERIODS.map((option) => (
          <Chip
            key={option.key}
            active={period === option.key}
            onClick={() => setPeriod(option.key)}
          >
            {option.label}
          </Chip>
        ))}
      </FilterGroup>
      <FilterGroup label="Imobiliária">
        {AGENCIES.map((option) => (
          <Chip
            key={option.key}
            active={agency === option.key}
            onClick={() => setAgency(option.key)}
          >
            {option.label}
          </Chip>
        ))}
      </FilterGroup>
      <FilterGroup label="Fonte de prospecção">
        {SOURCES.map((option) => (
          <Chip
            key={option.key}
            active={source === option.key}
            onClick={() => setSource(option.key)}
          >
            {option.label}
          </Chip>
        ))}
      </FilterGroup>
      {brokerOptions.length > 1 ? (
        <FilterGroup label="Corretor">
          <Chip active={broker === "todos"} onClick={() => setBroker("todos")}>
            Todos
          </Chip>
          {brokerOptions.map((option) => (
            <Chip
              key={option.id}
              active={broker === option.id}
              onClick={() => setBroker(option.id)}
            >
              {option.nome.split(" ")[0]}
            </Chip>
          ))}
        </FilterGroup>
      ) : null}
      {filtersActive ? (
        <button
          type="button"
          className="text-[11px] font-bold text-primary underline-offset-4 hover:underline"
          onClick={() => {
            setPeriod("mes");
            setAgency("todas");
            setSource("todas");
            setBroker("todos");
          }}
        >
          Limpar filtros
        </button>
      ) : null}
    </div>
  );

  const trigger = (
    <button
      type="button"
      aria-label="Filtros da origem dos leads"
      className="relative inline-flex size-9 items-center justify-center rounded-full border border-white/70 bg-white/70 text-foreground/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] transition hover:text-foreground"
    >
      <SlidersHorizontal className="size-4" />
      {filtersActive ? (
        <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-primary" />
      ) : null}
    </button>
  );

  return (
    <section
      className={cn(
        "relative w-full min-w-0 overflow-hidden rounded-3xl border border-white/70 bg-white/70 p-4 shadow-[0_24px_60px_-32px_rgba(23,27,33,0.28)] backdrop-blur-xl sm:p-5",
        className,
      )}
    >
      <header className="relative z-10 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-stretch gap-3">
          <span
            aria-hidden="true"
            className="mt-1 w-1 shrink-0 rounded-full"
            style={{ background: leader?.color ?? chartSystem }}
          />
          <div className="min-w-0">
            <h3 className="text-[1.45rem] font-black leading-[1.05] tracking-[-0.03em] text-foreground sm:text-[1.7rem]">
              Origem dos leads
            </h3>
            <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.16em] text-foreground/40">
              {PERIODS.find((p) => p.key === period)?.label} · {total} {total === 1 ? "lead" : "leads"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {query.isFetching && !query.isLoading ? (
            <Loader2 className="size-4 animate-spin text-primary motion-reduce:animate-none" />
          ) : null}
          {isMobile ? (
            <Sheet>
              <SheetTrigger asChild>{trigger}</SheetTrigger>
              <SheetContent
                side="bottom"
                className="rounded-t-[2rem] border-white/60 bg-background/95 p-5 backdrop-blur-2xl"
              >
                <SheetHeader className="mb-4 text-left">
                  <SheetTitle>Filtros</SheetTitle>
                </SheetHeader>
                {filtersBody}
              </SheetContent>
            </Sheet>
          ) : (
            <Popover>
              <PopoverTrigger asChild>{trigger}</PopoverTrigger>
              <PopoverContent align="end" className="w-72 rounded-2xl p-4">
                {filtersBody}
              </PopoverContent>
            </Popover>
          )}
        </div>
      </header>

      <div className="relative z-10 mt-5">
        {query.isLoading ? (
          <div className="h-56 animate-pulse rounded-2xl bg-foreground/5" />
        ) : query.isError ? (
          <div className="flex items-center gap-2 rounded-2xl bg-destructive/10 px-4 py-3 text-[12px] font-semibold text-destructive">
            <AlertCircle className="size-4" />
            {query.error instanceof Error
              ? query.error.message
              : "Não foi possível carregar os leads."}
          </div>
        ) : total === 0 ? (
          <p className="rounded-2xl bg-foreground/[0.04] px-4 py-6 text-center text-[12px] font-semibold text-foreground/50">
            Sem leads no filtro selecionado.
          </p>
        ) : (
          <div className="@container grid gap-5 @[34rem]:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] @[34rem]:items-center">
            <div className="relative mx-auto h-52 w-full max-w-[15rem]">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <PieChart accessibilityLayer>
                  <Pie
                    data={rows}
                    dataKey="value"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={62}
                    outerRadius={92}
                    paddingAngle={rows.length > 1 ? 2 : 0}
                    cornerRadius={6}
                    stroke="none"
                    isAnimationActive={false}
                  >
                    {rows.map((row) => (
                      <Cell
                        key={row.key}
                        fill={row.color}
                        fillOpacity={!focused || focused === row.key ? 1 : 0.28}
                        onMouseEnter={() => setFocused(row.key)}
                        onMouseLeave={() => setFocused(null)}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-foreground/40">
                  {focused ? rows.find((r) => r.key === focused)?.label : "Total"}
                </span>
                <span className="text-3xl font-black tabular-nums tracking-tight text-foreground">
                  {focused ? (rows.find((r) => r.key === focused)?.value ?? 0) : total}
                </span>
              </div>
            </div>

            <ul className="min-w-0 space-y-2">
              {rows.map((row) => (
                <li
                  key={row.key}
                  onMouseEnter={() => setFocused(row.key)}
                  onMouseLeave={() => setFocused(null)}
                  className={cn(
                    "flex min-w-0 items-center gap-3 rounded-2xl px-2.5 py-2 transition",
                    focused === row.key ? "bg-foreground/[0.05]" : "bg-transparent",
                  )}
                >
                  <span
                    className="flex size-8 shrink-0 items-center justify-center rounded-xl"
                    style={{ background: `${row.color}1f`, color: row.color }}
                  >
                    <row.Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[13px] font-bold text-foreground">
                        {row.label}
                      </span>
                      <span className="shrink-0 text-[13px] font-black tabular-nums text-foreground">
                        {row.value}
                        <span className="ml-1.5 text-[11px] font-bold text-foreground/40">
                          {Math.round(row.percent)}%
                        </span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-foreground/[0.07]">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${Math.max(row.percent, 2)}%`, background: row.color }}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-foreground/40">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold transition",
        active
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-border/60 bg-background text-foreground/60 hover:text-foreground",
      )}
    >
      {active ? <Check className="size-3" /> : null}
      {children}
    </button>
  );
}

function periodStart(period: PeriodKey): Date | null {
  const now = new Date();
  switch (period) {
    case "sete_dias": {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return d;
    }
    case "mes":
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case "noventa": {
      const d = new Date(now);
      d.setDate(d.getDate() - 90);
      return d;
    }
    case "ano":
      return new Date(now.getFullYear(), 0, 1);
    default:
      return null;
  }
}
