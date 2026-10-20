import { CordialBotWordmark } from "@/components/brand/CordialBotBrand";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { FilePlus2, Plus } from "lucide-react";
import { memo, useEffect, useId, useMemo, useRef, type RefObject } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getSidebarSections, type SidebarModuleItem } from "@/components/shared/module-menu";
import type { AppModule } from "@/lib/mock/permissions";
import { cn } from "@/lib/utils";
import { useRentalFormRequest } from "@/lib/rentals/rental-form-ui";

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
  const navigationId = useId();
  const navigate = useNavigate();
  const visibleSections = useMemo(() => getSidebarSections(allowedModules), [allowedModules]);

  async function openNewRentalContract() {
    await navigate({ to: "/alugueis" });
    useRentalFormRequest.getState().request();
    onNavigate?.();
  }

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
          {visibleSections.map((section) => {
            const headingId = `${navigationId}-section-${section.id}`;

            return (
              <section
                key={section.id}
                aria-labelledby={headingId}
                data-navigation-section={section.id}
                className="app-sidebar-card"
              >
                <h2 id={headingId} className={cn("app-sidebar-card-label", collapsed && "sr-only")}>
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
                                  <span className="app-sidebar-nav-title">
                                    {item.to === "/assistente" ? (
                                      <CordialBotWordmark className="!text-[length:inherit] !text-inherit" />
                                    ) : (
                                      copy.label
                                    )}
                                  </span>
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
                  {section.newRentalContract && (
                    <li className="app-sidebar-action-item">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={openNewRentalContract}
                            aria-label={
                              collapsed ? "Novo contrato: abrir cadastro de locação" : undefined
                            }
                            className="app-sidebar-nav-row app-sidebar-contract-action group"
                            data-navigation-action="novo-contrato"
                          >
                            <span className="app-sidebar-nav-icon" aria-hidden="true">
                              <FilePlus2 className="size-[18px]" strokeWidth={1.75} />
                            </span>
                            {!collapsed && (
                              <>
                                <span className="app-sidebar-nav-copy">
                                  <span className="app-sidebar-nav-title">Novo contrato</span>
                                </span>
                                <Plus
                                  className="app-sidebar-action-indicator size-3.5"
                                  aria-hidden="true"
                                />
                              </>
                            )}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent
                          side="right"
                          sideOffset={10}
                          className="app-sidebar-tooltip"
                        >
                          <p className="app-sidebar-tooltip-title">Novo contrato</p>
                          <p className="app-sidebar-tooltip-description">
                            Abrir cadastro de contrato em Aluguéis
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </li>
                  )}
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
