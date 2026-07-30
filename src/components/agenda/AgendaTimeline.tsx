import { CalendarDays } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { AgendaEventCard } from "@/components/agenda/AgendaEventCard";
import type { AgendaEvent } from "@/types/agenda";

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
        description="Ajuste os filtros ou registre um novo compromisso no card acima."
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

  return (
    <div className="space-y-8">
      <section className="space-y-5">
        <SectionHeader
          label="Hoje e próximos"
          count={currentCount}
          hint="Ordem cronológica"
        />
        {currentCount === 0 ? (
          <p className="rounded-2xl border border-dashed border-foreground/12 bg-white/45 px-4 py-3 text-xs font-medium text-foreground/55">
            Nenhum compromisso hoje e nada agendado à frente. O histórico aparece logo abaixo.
          </p>
        ) : (
          <div className="space-y-5">
            {[...today, ...upcoming].map((group) => (
              <DaySection
                key={group.day}
                group={group}
                onOpen={onOpen}
                canEdit={canEdit}
              />
            ))}
          </div>
        )}
      </section>

      {history.length > 0 ? (
        <section className="space-y-5 border-t border-foreground/10 pt-6">
          <SectionHeader
            label="Histórico"
            count={history.reduce((total, group) => total + group.events.length, 0)}
            hint="Mais recentes primeiro"
            muted
          />
          <div className="space-y-5">
            {history.map((group) => (
              <DaySection
                key={group.day}
                group={group}
                onOpen={onOpen}
                canEdit={canEdit}
                past
              />
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
    <div className="flex items-center gap-2">
      <h2
        className={`text-[11px] font-bold uppercase tracking-[0.16em] ${muted ? "text-foreground/45" : "text-teal-800"}`}
      >
        {label}
      </h2>
      <span className="rounded-full bg-white/60 px-2 py-0.5 text-[9px] font-semibold text-foreground/45">
        {count}
      </span>
      {hint ? (
        <span className="ml-auto text-[9px] font-semibold uppercase tracking-[0.12em] text-foreground/35">
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
  return (
    <section className="space-y-2">
      <div className="sticky top-0 z-10 -mx-1 flex items-center gap-2 rounded-xl bg-background/85 px-2 py-1.5 backdrop-blur supports-[backdrop-filter]:bg-background/65">
        <CalendarDays className={`size-3.5 ${past ? "text-foreground/40" : "text-teal-700"}`} />
        <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-foreground/65">
          {dayLabel(group.day)}
        </h3>
        <span className="rounded-full bg-white/50 px-2 py-0.5 text-[9px] font-semibold text-foreground/42">
          {group.events.length}
        </span>
      </div>
      <div className="grid gap-2.5 xl:grid-cols-2 2xl:grid-cols-3">
        {group.events.map((event) => (
          <AgendaEventCard
            key={event.id}
            event={event}
            onClick={() => onOpen(event)}
            canEdit={canEdit(event)}
          />
        ))}
      </div>
    </section>
  );
}

function dayLabel(value: string) {
  const date = new Date(`${value}T00:00:00`);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const formatted = date.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  if (sameDay(date, today)) return `Hoje · ${formatted}`;
  if (sameDay(date, tomorrow)) return `Amanhã · ${formatted}`;
  return formatted;
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
