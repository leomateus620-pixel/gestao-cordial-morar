import { Link, useRouterState } from "@tanstack/react-router";
import { memo, useEffect, useMemo, useRef, type RefObject } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getSidebarSections, type SidebarModuleItem } from "@/components/shared/module-menu";
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

function ActiveItemVisibility({ navRef }: { navRef: RefObject<HTMLElement | null> }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const nav = navRef.current;
      const activeItem = nav?.querySelector<HTMLElement>('[aria-current="page"]');
      if (!nav || !activeItem) return;

      const navRect = nav.getBoundingClientRect();
      const itemRect = activeItem.getBoundingClientRect();
      const edgePadding = 4;
      const topDelta = itemRect.top - (navRect.top + edgePadding);
      const bottomDelta = itemRect.bottom - (navRect.bottom - edgePadding);
      const scrollDelta = topDelta < 0 ? topDelta : bottomDelta > 0 ? bottomDelta : 0;

      if (scrollDelta !== 0) {
        nav.scrollTo({
          top: nav.scrollTop + scrollDelta,
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "auto"
            : "smooth",
        });
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [navRef, pathname]);

  return null;
}

export const SidebarMenu = memo(function SidebarMenu({
  allowedModules,
  className,
  collapsed = false,
  onNavigate,
}: SidebarMenuProps) {
  const navRef = useRef<HTMLElement>(null);
  const visibleSections = useMemo(() => getSidebarSections(allowedModules), [allowedModules]);

  return (
    <TooltipProvider delayDuration={collapsed ? 100 : 500}>
      <nav
        ref={navRef}
        className={cn(
          "premium-sidebar-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden",
          className,
        )}
        aria-label="Navegação principal"
        data-collapsed={collapsed ? "true" : "false"}
      >
        <ActiveItemVisibility navRef={navRef} />
        <div className="app-sidebar-sections">
          {visibleSections.map((section, sectionIndex) => {
            const headingId = `sidebar-section-${section.id}`;

            return (
              <section
                key={section.id}
                aria-labelledby={headingId}
                data-navigation-section={section.id}
              >
                {collapsed && sectionIndex > 0 && (
                  <div className="app-sidebar-section-divider" aria-hidden="true" />
                )}
                <h2
                  id={headingId}
                  className={cn("app-sidebar-section-label", collapsed && "sr-only")}
                >
                  {section.label}
                </h2>

                <ul className="app-sidebar-list" role="list">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const copy = getItemCopy(item);

                    return (
                      <li key={item.to}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Link
                              to={item.to as never}
                              onClick={onNavigate}
                              aria-label={collapsed ? `${copy.label}: ${copy.desc}` : undefined}
                              activeOptions={{ exact: item.exact, includeSearch: false }}
                              activeProps={{ "data-active": "true" }}
                              data-navigation-item={item.module}
                              data-navigation-path={item.to}
                              className="app-sidebar-nav-row group"
                            >
                              <span className="app-sidebar-nav-icon" aria-hidden="true">
                                <Icon className="size-[17px]" strokeWidth={2} />
                              </span>

                              {!collapsed && (
                                <span className="app-sidebar-nav-copy">
                                  <span className="app-sidebar-nav-title">{copy.label}</span>
                                  <span className="app-sidebar-nav-description">{copy.desc}</span>
                                </span>
                              )}
                            </Link>
                          </TooltipTrigger>
                          <TooltipContent
                            side="right"
                            sideOffset={10}
                            className="app-sidebar-tooltip"
                          >
                            <p className="app-sidebar-tooltip-title">{copy.label}</p>
                            <p className="app-sidebar-tooltip-description">{copy.desc}</p>
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
});

SidebarMenu.displayName = "SidebarMenu";
