import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/auth-mock";
import { getVisibleModules, moduleItems, type ModuleItem } from "@/components/shared/module-menu";

type SidebarMenuProps = {
  className?: string;
  compact?: boolean;
  onNavigate?: () => void;
  items?: ModuleItem[];
};

export function SidebarMenu({ className, compact = false, onNavigate, items }: SidebarMenuProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const session = useSession();
  const baseItems = items ?? moduleItems.filter((item) => item.to !== "/mais");
  const visible = getVisibleModules(session?.modules, baseItems);

  return (
    <nav className={cn("flex flex-col gap-1", className)} aria-label="Módulos principais">
      {visible.map((item) => {
        const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
        const Icon = item.icon;

        return (
          <Link
            key={item.to}
            to={item.to as never}
            onClick={onNavigate}
            className={cn(
              "group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition-all hover:bg-white/65 hover:text-primary",
              active
                ? "bg-primary/12 text-primary shadow-[0_12px_30px_rgba(177,99,73,0.14)]"
                : "text-foreground/68",
              compact && "rounded-xl px-2.5 py-2",
            )}
          >
            <span
              className={cn(
                "grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/15",
                active && "bg-primary text-primary-foreground",
                compact && "size-8 rounded-lg",
              )}
            >
              <Icon
                className={cn("size-4", compact && "size-3.5")}
                strokeWidth={active ? 2.4 : 1.8}
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold leading-tight">{item.label}</span>
              {!compact && (
                <span className="mt-0.5 block truncate text-[11px] leading-tight text-foreground/45">
                  {item.desc}
                </span>
              )}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
