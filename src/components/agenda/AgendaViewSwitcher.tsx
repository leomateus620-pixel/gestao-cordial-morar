import { Link, useRouterState } from "@tanstack/react-router";
import { CalendarCheck2, Camera } from "lucide-react";
import { cn } from "@/lib/utils";

const options = [
  {
    to: "/agenda",
    label: "Visitas e compromissos",
    shortLabel: "Visitas",
    icon: CalendarCheck2,
  },
  {
    to: "/agenda/fotos",
    label: "Agenda de fotos",
    shortLabel: "Fotos",
    icon: Camera,
  },
] as const;

export function AgendaViewSwitcher({ activeCount }: { activeCount?: number }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const activeIndex = pathname.startsWith("/agenda/fotos") ? 1 : 0;

  return (
    <nav aria-label="Selecionar área da agenda">
      <div role="tablist" aria-orientation="horizontal" className="grid grid-cols-2 gap-2.5">
        {options.map((option, index) => {
          const active = index === activeIndex;
          const Icon = option.icon;
          return (
            <Link
              key={option.to}
              to={option.to}
              role="tab"
              aria-selected={active}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative flex min-h-[68px] flex-col justify-center gap-1 rounded-2xl px-4 py-3 transition",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white/60",
                active
                  ? "bg-gradient-to-br from-teal-700 to-teal-600 text-white shadow-lg shadow-teal-900/20"
                  : "glass-panel text-foreground/70 hover:-translate-y-0.5 hover:bg-white/80 hover:text-foreground hover:shadow-md",
              )}
            >
              <span className="flex items-center gap-2.5">
                <span
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-xl transition",
                    active ? "bg-white/18 text-white" : "bg-teal-700/10 text-teal-700",
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold tracking-tight">
                  <span className="hidden sm:inline">{option.label}</span>
                  <span className="sm:hidden">{option.shortLabel}</span>
                </span>
              </span>
              <span
                className={cn(
                  "pl-[42px] text-[10.5px] font-semibold uppercase tracking-[0.1em]",
                  active ? "text-white/75" : "text-foreground/40",
                )}
              >
                {active && typeof activeCount === "number"
                  ? `${activeCount} no período`
                  : "Abrir agenda"}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
