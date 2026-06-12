import { Link, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CalendarCheck2,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  FileText,
  Handshake,
  Home,
  House,
  KeyRound,
  LayoutDashboard,
  MessagesSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  Star,
  UserCog,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/auth-mock";
import { getVisibleModules, moduleItems, type ModuleItem } from "@/components/shared/module-menu";

export type NavigationChild = Pick<ModuleItem, "to" | "label" | "module" | "exact"> & {
  key?: string;
  icon: LucideIcon;
};

export type NavigationGroup = {
  label: string;
  desc: string;
  icon: LucideIcon;
  children: NavigationChild[];
};

const navigationGroups: NavigationGroup[] = [
  {
    label: "Painel",
    desc: "Visão executiva",
    icon: LayoutDashboard,
    children: [
      { to: "/", label: "Início", icon: Home, module: "dashboard", exact: true },
      { to: "/agenda", label: "Agenda do dia", icon: CalendarCheck2, module: "agenda" },
      { to: "/imoveis-destaque", label: "Em Destaque", icon: Sparkles, module: "imoveis" },
    ],
  },
  {
    label: "Relacionamento",
    desc: "Leads e clientes",
    icon: MessagesSquare,
    children: [
      { to: "/atendimentos", label: "Atendimentos", icon: Handshake, module: "atendimentos" },
      { to: "/clientes", label: "Clientes", icon: Users, module: "clientes" },
      {
        key: "agenda-relacionamento",
        to: "/agenda",
        label: "Agenda",
        icon: CalendarCheck2,
        module: "agenda",
      },
    ],
  },
  {
    label: "Imóveis",
    desc: "Carteira e status",
    icon: Building2,
    children: [
      { to: "/imoveis", label: "Todos os imóveis", icon: House, module: "imoveis" },
      { to: "/imoveis-destaque", label: "Imóveis em destaque", icon: Star, module: "imoveis" },
      {
        key: "status-imoveis",
        to: "/imoveis",
        label: "Disponibilidade / status",
        icon: ClipboardList,
        module: "imoveis",
      },
    ],
  },
  {
    label: "Negócios",
    desc: "Operações e contratos",
    icon: BriefcaseBusiness,
    children: [
      { to: "/alugueis", label: "Aluguéis", icon: KeyRound, module: "alugueis" },
      { to: "/vendas", label: "Vendas", icon: CircleDollarSign, module: "vendas" },
      { to: "/contratos", label: "Contratos", icon: FileText, module: "contratos" },
    ],
  },
  {
    label: "Gestão",
    desc: "Equipe e resultados",
    icon: BarChart3,
    children: [
      { to: "/corretores", label: "Corretores", icon: UserCog, module: "corretores" },
      { to: "/financeiro", label: "Financeiro", icon: Wallet, module: "financeiro" },
      { to: "/relatorios", label: "Relatórios", icon: BarChart3, module: "relatorios" },
    ],
  },
];

type SidebarMenuProps = {
  className?: string;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  onNavigate?: () => void;
  showToggle?: boolean;
  tone?: "light" | "dark";
};

function isRouteActive(pathname: string, item: Pick<NavigationChild, "to" | "exact">) {
  if (item.exact) return pathname === item.to;
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

export function SidebarMenu({
  className,
  collapsed = false,
  onCollapsedChange,
  onNavigate,
  showToggle = false,
  tone = "dark",
}: SidebarMenuProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const session = useSession();
  const isDark = tone === "dark";
  const visibleGroups = useMemo(
    () =>
      navigationGroups
        .map((group) => ({
          ...group,
          children: getVisibleModules(
            session?.modules,
            group.children as ModuleItem[],
          ) as NavigationChild[],
        }))
        .filter((group) => group.children.length > 0),
    [session?.modules],
  );
  const activeGroup = visibleGroups.find((group) =>
    group.children.some((child) => isRouteActive(pathname, child)),
  );
  const [openGroup, setOpenGroup] = useState(activeGroup?.label ?? visibleGroups[0]?.label ?? "");

  useEffect(() => {
    if (activeGroup?.label) setOpenGroup(activeGroup.label);
  }, [activeGroup?.label]);

  return (
    <TooltipProvider delayDuration={120}>
      <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
        {showToggle && (
          <div className={cn("mb-3 flex", collapsed ? "justify-center" : "justify-end")}>
            <button
              type="button"
              className="grid size-9 place-items-center rounded-2xl border border-white/10 bg-white/[0.06] text-white/70 transition-all hover:border-cyan-300/30 hover:bg-cyan-300/10 hover:text-white active:scale-95"
              onClick={() => onCollapsedChange?.(!collapsed)}
              aria-label={collapsed ? "Expandir sidebar" : "Recolher sidebar"}
            >
              {collapsed ? (
                <PanelLeftOpen className="size-4" />
              ) : (
                <PanelLeftClose className="size-4" />
              )}
            </button>
          </div>
        )}

        <nav
          className="premium-sidebar-scroll min-h-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden pr-1"
          aria-label="Navegação principal"
        >
          {visibleGroups.map((group) => {
            const groupActive = activeGroup?.label === group.label;
            const open = openGroup === group.label && !collapsed;
            const Icon = group.icon;
            const groupButton = (
              <button
                type="button"
                className={cn(
                  "group relative flex w-full items-center gap-3 rounded-2xl text-left text-sm transition-all duration-200 active:scale-[0.99]",
                  collapsed ? "justify-center px-2 py-3" : "px-3 py-3",
                  isDark && groupActive
                    ? "bg-[linear-gradient(135deg,rgba(95,175,199,0.22),rgba(255,255,255,0.08))] text-white shadow-[inset_3px_0_0_var(--system-primary-light),0_14px_30px_-24px_rgba(95,175,199,0.9)]"
                    : isDark
                      ? "text-white/72 hover:bg-white/[0.07] hover:text-white"
                      : groupActive
                        ? "bg-primary/12 text-primary shadow-[inset_3px_0_0_var(--system-primary)]"
                        : "text-foreground/70 hover:bg-white/65 hover:text-primary",
                )}
                onClick={() => {
                  if (collapsed) {
                    onCollapsedChange?.(false);
                    setOpenGroup(group.label);
                    return;
                  }
                  setOpenGroup(open ? "" : group.label);
                }}
                aria-expanded={open}
              >
                <span
                  className={cn(
                    "grid size-9 shrink-0 place-items-center rounded-xl transition-all duration-200",
                    groupActive
                      ? "bg-cyan-300/18 text-cyan-100 ring-1 ring-cyan-200/25"
                      : "bg-white/[0.06] text-white/68 group-hover:bg-white/[0.1] group-hover:text-cyan-100",
                  )}
                >
                  <Icon className="size-4.5" strokeWidth={groupActive ? 2.35 : 1.9} />
                </span>
                {!collapsed && (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold leading-tight tracking-[-0.01em]">
                        {group.label}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] font-medium leading-tight text-white/42">
                        {group.desc}
                      </span>
                    </span>
                    <ChevronDown
                      className={cn(
                        "size-4 text-white/45 transition-transform duration-300",
                        open && "rotate-180 text-cyan-100/75",
                      )}
                    />
                  </>
                )}
              </button>
            );

            return (
              <Collapsible
                key={group.label}
                open={open}
                onOpenChange={(value) => setOpenGroup(value ? group.label : "")}
              >
                <CollapsibleTrigger asChild>
                  {collapsed ? (
                    <Tooltip>
                      <TooltipTrigger asChild>{groupButton}</TooltipTrigger>
                      <TooltipContent
                        side="right"
                        className="border border-cyan-200/15 bg-[#14212a] text-cyan-50 shadow-xl"
                      >
                        {group.label}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    groupButton
                  )}
                </CollapsibleTrigger>

                {!collapsed && (
                  <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                    <div className="ml-[1.6rem] mt-1 space-y-1 border-l border-cyan-200/12 pl-3">
                      {group.children.map((child) => {
                        const active = isRouteActive(pathname, child);
                        const ChildIcon = child.icon;
                        return (
                          <Link
                            key={child.key ?? child.to}
                            to={child.to as never}
                            onClick={onNavigate}
                            className={cn(
                              "group/sub relative flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium transition-all duration-200 active:scale-[0.99]",
                              active
                                ? "bg-white/[0.09] text-white shadow-[inset_2px_0_0_var(--system-primary-light)]"
                                : "text-white/58 hover:bg-white/[0.055] hover:text-white/88",
                            )}
                          >
                            <ChildIcon
                              className={cn(
                                "size-3.5 shrink-0 transition-colors",
                                active
                                  ? "text-cyan-200"
                                  : "text-white/38 group-hover/sub:text-cyan-100/75",
                              )}
                              strokeWidth={active ? 2.4 : 1.9}
                            />
                            <span className="truncate">{child.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </CollapsibleContent>
                )}
              </Collapsible>
            );
          })}
        </nav>
      </div>
    </TooltipProvider>
  );
}
