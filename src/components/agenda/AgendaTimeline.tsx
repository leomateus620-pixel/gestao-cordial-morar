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

  return (
    <div className="space-y-5">
      {Array.from(groups.entries()).map(([day, dayEvents]) => (
        <section key={day} className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <CalendarDays className="size-3.5 text-teal-700" />
            <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-foreground/65">
              {dayLabel(day)}
            </h2>
            <span className="rounded-full bg-white/50 px-2 py-0.5 text-[9px] font-semibold text-foreground/42">
              {dayEvents.length}
            </span>
          </div>
          <div className="grid gap-2.5 xl:grid-cols-2">
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
