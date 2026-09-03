import { CalendarDays } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { AgendaEventCard } from "@/components/agenda/AgendaEventCard";
import type { AgendaEvent } from "@/types/agenda";
import { cn } from "@/lib/utils";

type DayGroup = { day: string; events: AgendaEvent[] };

export function AgendaTimeline({
  events,
  onOpen,
  canEdit,
}: {
  events: AgendaEvent[];
  onOpen: (event: AgendaEvent) => void;
  canEdit: (event: AgendaEvent) => boolean;
}) {
  if (events.length === 0) {
    return (
      <EmptyState
        title="Nenhum compromisso encontrado"
        description="Ajuste os filtros ou registre um novo compromisso."
        icon={<CalendarDays className="size-5" />}
      />
    );
  }

  const todayKey = localDateKey(new Date());
  const groups = new Map<string, AgendaEvent[]>();
  events.forEach((event) => {
    const key = localDateKey(new Date(event.inicio));
    groups.set(key, [...(groups.get(key) ?? []), event]);
  });

  const today: DayGroup[] = [];
  const upcoming: DayGroup[] = [];
  const history: DayGroup[] = [];

  Array.from(groups.entries()).forEach(([day, dayEvents]) => {
    const isPast = day < todayKey;
    const sorted = [...dayEvents].sort((a, b) =>
      isPast
        ? new Date(b.inicio).getTime() - new Date(a.inicio).getTime()
        : new Date(a.inicio).getTime() - new Date(b.inicio).getTime(),
    );
    const bucket = day === todayKey ? today : day > todayKey ? upcoming : history;
    bucket.push({ day, events: sorted });
  });

  upcoming.sort((a, b) => a.day.localeCompare(b.day));
  history.sort((a, b) => b.day.localeCompare(a.day));

  const currentCount =
    today.reduce((total, group) => total + group.events.length, 0) +
    upcoming.reduce((total, group) => total + group.events.length, 0);
  const historyCount = history.reduce((total, group) => total + group.events.length, 0);

  return (
    <div className="space-y-8">
      <section className="space-y-4" aria-label="Hoje e próximos">
        <SectionHeader label="Hoje e próximos" count={currentCount} hint="Ordem cronológica" />
        {currentCount === 0 ? (
          <p className="rounded-2xl border border-dashed border-foreground/12 bg-white/40 px-4 py-3 text-xs font-medium text-foreground/55">
            Nenhum compromisso hoje e nada agendado à frente. O histórico aparece logo abaixo.
          </p>
        ) : (
          <div className="space-y-5">
            {[...today, ...upcoming].map((group) => (
              <DaySection key={group.day} group={group} onOpen={onOpen} canEdit={canEdit} />
            ))}
          </div>
        )}
      </section>

      {history.length > 0 ? (
        <section className="space-y-4" aria-label="Histórico">
          <SectionHeader
            label="Histórico"
            count={historyCount}
            hint="Mais recentes primeiro"
            muted
          />
          <div className="space-y-5">
            {history.map((group) => (
              <DaySection key={group.day} group={group} onOpen={onOpen} canEdit={canEdit} past />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function SectionHeader({
  label,
  count,
  hint,
  muted,
}: {
  label: string;
  count: number;
  hint?: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-0.5">
      <h2
        className={cn(
          "text-[11px] font-bold uppercase tracking-[0.16em]",
          muted ? "text-foreground/45" : "text-teal-800",
        )}
      >
        {label}
      </h2>
      <span className="rounded-full bg-white/60 px-2 py-0.5 font-mono text-[10px] font-semibold text-foreground/50 ring-1 ring-white/70">
        {count}
      </span>
      <span className="h-px flex-1 bg-gradient-to-r from-foreground/10 to-transparent" />
      {hint ? (
        <span className="hidden text-[9.5px] font-semibold uppercase tracking-[0.12em] text-foreground/35 sm:inline">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

function DaySection({
  group,
  onOpen,
  canEdit,
  past,
}: {
  group: DayGroup;
  onOpen: (event: AgendaEvent) => void;
  canEdit: (event: AgendaEvent) => boolean;
  past?: boolean;
}) {
  const date = new Date(`${group.day}T00:00:00`);
  const relative = relativeLabel(date);
  const weekday = date.toLocaleDateString("pt-BR", { weekday: "long" });
  const longDate = date.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
  const showYear = date.getFullYear() !== new Date().getFullYear();

  return (
    <section className="space-y-2.5">
      <header className="flex items-center gap-3 px-0.5">
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-xl text-center leading-none ring-1",
            past
              ? "bg-white/45 text-foreground/55 ring-white/60"
              : relative === "Hoje"
                ? "bg-teal-700 text-white ring-teal-700 shadow-[0_10px_20px_-12px_rgba(15,118,110,0.9)]"
                : "bg-white/65 text-teal-900 ring-white/75",
          )}
          aria-hidden="true"
        >
          <span className="block font-mono text-sm font-semibold tabular-nums">
            {String(date.getDate()).padStart(2, "0")}
          </span>
          <span className="mt-0.5 block text-[8px] font-bold uppercase tracking-[0.12em] opacity-75">
            {date.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}
          </span>
        </span>
        <div className="min-w-0">
          <h3
            className={cn(
              "text-[13px] font-semibold capitalize tracking-tight",
              past ? "text-foreground/60" : "text-foreground",
            )}
          >
            {relative ?? weekday}
          </h3>
          <p className="text-[10.5px] text-foreground/48">
            {relative ? `${weekday} · ` : ""}
            {longDate}
            {showYear ? ` de ${date.getFullYear()}` : ""}
          </p>
        </div>
        <span className="h-px flex-1 bg-foreground/10" aria-hidden="true" />
        <span className="rounded-full bg-white/50 px-2 py-0.5 font-mono text-[10px] font-semibold text-foreground/45">
          {group.events.length}
        </span>
      </header>
      <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,23rem),1fr))]">
        {group.events.map((event) => (
          <AgendaEventCard
            key={event.id}
            event={event}
            onClick={() => onOpen(event)}
            canEdit={canEdit(event)}
            past={past}
          />
        ))}
      </div>
    </section>
  );
}

function relativeLabel(date: Date) {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameDay(date, today)) return "Hoje";
  if (sameDay(date, tomorrow)) return "Amanhã";
  if (sameDay(date, yesterday)) return "Ontem";
  return undefined;
}

function sameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
