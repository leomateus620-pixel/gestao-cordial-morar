import { Link, useRouterState } from "@tanstack/react-router";
import { CalendarCheck2, Camera } from "lucide-react";
import { cn } from "@/lib/utils";

const options = [
  {
    to: "/agenda",
    label: "Visitas e compromissos",
    shortLabel: "Visitas",
    description: "Visitas, retornos, reuniões, assinaturas e compromissos internos.",
    icon: CalendarCheck2,
    matchExact: true,
  },
  {
    to: "/agenda/fotos",
    label: "Agenda de fotos",
    shortLabel: "Fotos",
    description: "Sessões de fotos e vídeos dos imóveis, visíveis para toda a equipe operacional.",
    icon: Camera,
    matchExact: false,
  },
] as const;

export function AgendaViewSwitcher() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const activeIndex = pathname.startsWith("/agenda/fotos") ? 1 : 0;

  return (
    <nav
      aria-label="Selecionar área da agenda"
      className="glass-panel rounded-2xl p-1.5"
    >
      <div
        role="tablist"
        aria-orientation="horizontal"
        className="grid grid-cols-2 gap-1"
      >
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
                "group relative flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-center text-[13px] font-semibold tracking-tight transition",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white/60",
                active
                  ? "bg-gradient-to-br from-teal-700 to-teal-600 text-white shadow-md shadow-teal-900/20"
                  : "text-foreground/65 hover:bg-white/60 hover:text-foreground",
              )}
            >
              <Icon className={cn("size-4 shrink-0", active ? "text-white" : "text-teal-700/70")} />
              <span className="hidden sm:inline">{option.label}</span>
              <span className="sm:hidden">{option.shortLabel}</span>
            </Link>
          );
        })}
      </div>
      <p className="mt-2 px-2 pb-1 text-[11px] leading-snug text-foreground/55">
        {options[activeIndex].description}
      </p>
    </nav>
  );
}
