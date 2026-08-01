import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useRef } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  getSidebarSections,
  isModuleItemActive,
  type SidebarModuleItem,
} from "@/components/shared/module-menu";
import type { AppModule } from "@/lib/mock/permissions";
import { cn } from "@/lib/utils";

type SidebarMenuProps = {
  allowedModules: AppModule[];
  className?: string;
  collapsed?: boolean;
  onNavigate?: () => void;
};

function getItemCopy(item: SidebarModuleItem) {
  return {
    label: item.sidebar.label ?? item.label,
    desc: item.sidebar.desc ?? item.desc,
  };
}

export function SidebarMenu({
  allowedModules,
  className,
  collapsed = false,
  onNavigate,
}: SidebarMenuProps) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navRef = useRef<HTMLElement>(null);
  const visibleSections = useMemo(() => getSidebarSections(allowedModules), [allowedModules]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const nav = navRef.current;
      const activeItem = nav?.querySelector<HTMLElement>('[aria-current="page"]');
      if (!nav || !activeItem) return;

      const navRect = nav.getBoundingClientRect();
      const itemRect = activeItem.getBoundingClientRect();
      const isOutsideViewport = itemRect.top < navRect.top || itemRect.bottom > navRect.bottom;

      if (isOutsideViewport) {
        activeItem.scrollIntoView({
          block: "nearest",
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "auto"
            : "smooth",
        });
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  return (
    <TooltipProvider delayDuration={collapsed ? 100 : 500}>
      <nav
        ref={navRef}
        className={cn(
          "premium-sidebar-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-0.5",
          className,
        )}
        aria-label="Navegação principal"
        data-collapsed={collapsed ? "true" : "false"}
      >
        <div className="space-y-3 pb-1">
          {visibleSections.map((section, sectionIndex) => {
            const headingId = `sidebar-section-${section.id}`;

            return (
              <section
                key={section.id}
                aria-labelledby={headingId}
                data-navigation-section={section.id}
              >
                {collapsed && sectionIndex > 0 && (
                  <div className="mx-auto mb-2 h-px w-7 bg-[#c8d8d4]/12" aria-hidden="true" />
                )}
                <h2
                  id={headingId}
                  className={cn(
                    "px-2 pb-1.5 text-[9px] font-bold uppercase leading-none tracking-[0.18em] text-[#9fb0ad]",
                    collapsed && "sr-only",
                  )}
                >
                  {section.label}
                </h2>

                <ul className="space-y-1" role="list">
                  {section.items.map((item) => {
                    const active = isModuleItemActive(pathname, item);
                    const Icon = item.icon;
                    const copy = getItemCopy(item);

                    return (
                      <li key={item.to}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Link
                              to={item.to as never}
                              onClick={onNavigate}
                              aria-current={active ? "page" : undefined}
                              aria-label={collapsed ? `${copy.label}: ${copy.desc}` : undefined}
                              data-navigation-item={item.module}
                              data-navigation-path={item.to}
                              className={cn(
                                "group relative flex w-full items-center overflow-hidden rounded-xl border text-left outline-none",
                                "before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:origin-center before:rounded-r-full before:bg-[#72cdbb] before:transition-transform before:duration-150",
                                "transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out",
                                "focus-visible:ring-2 focus-visible:ring-[#9bd9cd] focus-visible:ring-offset-1 focus-visible:ring-offset-[#2a373d]",
                                "active:scale-[0.985] motion-reduce:transform-none motion-reduce:transition-none",
                                collapsed
                                  ? "min-h-11 justify-center px-1"
                                  : "min-h-11 gap-2.5 px-2 py-1.5",
                                active
                                  ? "border-[#b7ddd5]/18 bg-[#43535a] text-[#f1f7f5] shadow-[0_8px_20px_-17px_rgba(5,18,22,0.78),inset_0_1px_0_rgba(229,244,240,0.08)] before:scale-y-100"
                                  : "border-transparent text-[#d5e0dd] before:scale-y-0 hover:border-[#c9ddd8]/10 hover:bg-[#39474d] hover:text-[#f0f6f4] hover:shadow-[0_7px_18px_-18px_rgba(5,18,22,0.85)]",
                              )}
                            >
                              <span
                                className={cn(
                                  "grid size-8 shrink-0 place-items-center rounded-[0.65rem] border transition-[background-color,border-color,color,box-shadow] duration-150 motion-reduce:transition-none",
                                  active
                                    ? "border-[#99d8ca]/24 bg-[#75c8b7]/15 text-[#a9e1d5] shadow-[inset_0_1px_0_rgba(224,244,239,0.1)]"
                                    : "border-[#d7e4e1]/8 bg-[#d9e7e4]/5 text-[#b7c7c4] group-hover:border-[#b8d8d1]/14 group-hover:bg-[#c9ddd8]/9 group-hover:text-[#d9ebe7]",
                                )}
                                aria-hidden="true"
                              >
                                <Icon className="size-[17px]" strokeWidth={active ? 2.2 : 1.85} />
                              </span>

                              {!collapsed && (
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-[13px] font-semibold leading-4 tracking-[-0.005em]">
                                    {copy.label}
                                  </span>
                                  <span className="mt-0.5 block truncate text-[10.5px] font-medium leading-3 text-[#aebdb9]">
                                    {copy.desc}
                                  </span>
                                </span>
                              )}
                            </Link>
                          </TooltipTrigger>
                          <TooltipContent
                            side="right"
                            sideOffset={10}
                            className="max-w-56 border border-[#bfd6d1]/16 bg-[#2d3b42] px-3 py-2 text-[#edf5f3] shadow-[0_16px_34px_-20px_rgba(4,14,18,0.78)]"
                          >
                            <p className="text-xs font-semibold">{copy.label}</p>
                            <p className="mt-0.5 text-[10px] leading-snug text-[#b8c7c4]">
                              {copy.desc}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      </nav>
    </TooltipProvider>
  );
}
