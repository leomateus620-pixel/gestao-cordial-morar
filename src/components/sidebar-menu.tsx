import { Link, useRouterState } from "@tanstack/react-router";
import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
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

type PillBox = { x: number; y: number; w: number; h: number };

function ActivePill({
  navRef,
  collapsed,
}: {
  navRef: RefObject<HTMLElement | null>;
  collapsed: boolean;
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [box, setBox] = useState<PillBox | null>(null);
  const [animated, setAnimated] = useState(false);

  useLayoutEffect(() => {
    const measure = () => {
      const nav = navRef.current;
      const row = nav?.querySelector<HTMLElement>('[data-active="true"]');
      if (!nav || !row) {
        setBox(null);
        return;
      }

      const navRect = nav.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      setBox({
        x: rowRect.left - navRect.left + nav.scrollLeft,
        y: rowRect.top - navRect.top + nav.scrollTop,
        w: rowRect.width,
        h: rowRect.height,
      });
    };

    // Mede após a pintura e de novo quando a largura da sidebar termina de transitar.
    const frame = window.requestAnimationFrame(measure);
    const settle = window.setTimeout(measure, 260);
    const observer = new ResizeObserver(() => measure());
    if (navRef.current) observer.observe(navRef.current);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(settle);
      observer.disconnect();
    };
  }, [navRef, pathname, collapsed]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setAnimated(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  if (!box) return null;

  return (
    <span
      aria-hidden="true"
      className="app-sidebar-active-pill"
      data-animated={animated ? "true" : "false"}
      style={{
        transform: `translate3d(${box.x}px, ${box.y}px, 0)`,
        width: box.w,
        height: box.h,
      }}
    />
  );
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
        <ActivePill navRef={navRef} collapsed={collapsed} />
        <div className="app-sidebar-sections">
          {visibleSections.map((section) => {
            const headingId = `sidebar-section-${section.id}`;

            return (
              <section
                key={section.id}
                aria-labelledby={headingId}
                data-navigation-section={section.id}
                className="app-sidebar-card"
              >
                <h2
                  id={headingId}
                  className={cn("app-sidebar-card-label", collapsed && "sr-only")}
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
                                <Icon
                                  className="app-sidebar-nav-icon-fill size-[18px]"
                                  strokeWidth={1.5}
                                />
                                <Icon className="size-[18px]" strokeWidth={1.75} />
                              </span>

                              {!collapsed && (
                                <span className="app-sidebar-nav-copy">
                                  <span className="app-sidebar-nav-title">{copy.label}</span>
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
