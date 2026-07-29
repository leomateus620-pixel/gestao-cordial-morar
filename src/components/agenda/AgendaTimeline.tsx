import { CalendarDays } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { AgendaEventCard } from "@/components/agenda/AgendaEventCard";
import type { AgendaEvent } from "@/types/agenda";

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

  const groups = new Map<string, AgendaEvent[]>();
  events.forEach((event) => {
    const key = localDateKey(new Date(event.inicio));
    groups.set(key, [...(groups.get(key) ?? []), event]);
  });

  // Hoje primeiro, depois os próximos dias em ordem crescente e, por fim,
  // o histórico do mais recente para o mais antigo.
  const todayKey = localDateKey(new Date());
  const orderedGroups = Array.from(groups.entries())
    .map(([day, dayEvents]) => {
      const bucket = day === todayKey ? 0 : day > todayKey ? 1 : 2;
      const sorted = [...dayEvents].sort((a, b) =>
        bucket === 2
          ? new Date(b.inicio).getTime() - new Date(a.inicio).getTime()
          : new Date(a.inicio).getTime() - new Date(b.inicio).getTime(),
      );
      return { day, bucket, events: sorted };
    })
    .sort((a, b) =>
      a.bucket !== b.bucket
        ? a.bucket - b.bucket
        : a.bucket === 2
          ? b.day.localeCompare(a.day)
          : a.day.localeCompare(b.day),
    );

  return (
    <div className="space-y-5">
      {orderedGroups.map(({ day, bucket, events: dayEvents }) => (
        <section key={day} className="space-y-2">
          <div className="sticky top-0 z-10 -mx-1 flex items-center gap-2 rounded-xl bg-background/85 px-2 py-1.5 backdrop-blur supports-[backdrop-filter]:bg-background/65">
            <CalendarDays className="size-3.5 text-teal-700" />
            <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-foreground/65">
              {dayLabel(day)}
            </h2>
            <span className="rounded-full bg-white/50 px-2 py-0.5 text-[9px] font-semibold text-foreground/42">
              {dayEvents.length}
            </span>
            {bucket === 2 ? (
              <span className="ml-auto text-[9px] font-semibold uppercase tracking-[0.12em] text-foreground/35">
                Histórico
              </span>
            ) : null}
          </div>
          <div className="grid gap-2.5 xl:grid-cols-2 2xl:grid-cols-3">

            {dayEvents.map((event) => (
              <AgendaEventCard
                key={event.id}
                event={event}
                onClick={() => onOpen(event)}
                canEdit={canEdit(event)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
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
