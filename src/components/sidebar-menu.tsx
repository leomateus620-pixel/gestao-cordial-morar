import { Link, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CalendarCheck2,
  ChevronDown,
  CircleDollarSign,
  ClipboardCheck,
  FileText,
  ExternalLink,
  Globe,
  Handshake,
  Home,
  KeyRound,
  LayoutDashboard,
  MessagesSquare,
  PanelLeftClose,
  PanelLeftOpen,
  UserCog,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getVisibleModules, type ModuleItem } from "@/components/shared/module-menu";
import { useSession } from "@/lib/auth-mock";
import { roleDefinitions } from "@/lib/mock/permissions";
import { cn } from "@/lib/utils";

export type NavigationChild = Pick<ModuleItem, "to" | "label" | "module" | "exact"> & {
  key?: string;
  icon: LucideIcon;
  href?: string;
  external?: boolean;
};

export type NavigationGroup = {
  type: "group";
  label: string;
  desc: string;
  icon: LucideIcon;
  children: NavigationChild[];
};

export type NavigationDirectItem = Pick<
  ModuleItem,
  "to" | "label" | "desc" | "module" | "exact"
> & {
  type: "item";
  icon: LucideIcon;
};

export type NavigationEntry = NavigationGroup | NavigationDirectItem;

const navigationEntries: NavigationEntry[] = [
  {
    type: "group",
    label: "Painel",
    desc: "Visão executiva",
    icon: LayoutDashboard,
    children: [{ to: "/", label: "Início", icon: Home, module: "dashboard", exact: true }],
  },
  {
    type: "item",
    to: "/agenda",
    label: "Agenda",
    desc: "Visitas, retornos e compromissos",
    icon: CalendarCheck2,
    module: "agenda",
  },
  {
    type: "group",
    label: "Relacionamento",
    desc: "Leads e clientes",
    icon: MessagesSquare,
    children: [
      { to: "/atendimentos", label: "Atendimentos", icon: Handshake, module: "atendimentos" },
      { to: "/clientes", label: "Clientes", icon: Users, module: "clientes" },
    ],
  },
  {
    type: "group",
    label: "Imóveis",
    desc: "Sites das imobiliárias",
    icon: Building2,
    children: [
      {
        key: "site-cordial",
        to: "/imoveis",
        href: "https://www.cordialimoveis.com/",
        external: true,
        label: "Site Cordial Imóveis",
        icon: Globe,
        module: "imoveis",
      },
      {
        key: "site-morar",
        to: "/imoveis",
        href: "https://www.imobiliariamorarimoveis.com.br/",
        external: true,
        label: "Site Morar Imóveis",
        icon: Globe,
        module: "imoveis",
      },
      {
        to: "/agenciamentos",
        label: "Agenciamentos",
        icon: ClipboardCheck,
        module: "agenciamentos",
      },
    ],
  },
  {
    type: "group",
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
    type: "group",
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

function isRouteActive(pathname: string, item: Pick<ModuleItem, "to" | "exact">) {
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
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const session = useSession();
  const isDark = tone === "dark";
  const sessionModules = useMemo(
    () =>
      session
        ? Array.from(new Set([...session.modules, ...roleDefinitions[session.perfil].modules]))
        : undefined,
    [session],
  );
  const visibleEntries = useMemo(
    () =>
      navigationEntries
        .map((entry) => {
          if (entry.type === "item") {
            return getVisibleModules(sessionModules, [entry]).length > 0 ? entry : null;
          }

          const children = getVisibleModules(
            sessionModules,
            entry.children as ModuleItem[],
          ) as NavigationChild[];
          return children.length > 0 ? { ...entry, children } : null;
        })
        .filter((entry): entry is NavigationEntry => entry !== null),
    [sessionModules],
  );
  const activeEntry = visibleEntries.find((entry) =>
    entry.type === "item"
      ? isRouteActive(pathname, entry)
      : entry.children.some((child) => isRouteActive(pathname, child)),
  );
  const activeGroup = activeEntry?.type === "group" ? activeEntry : undefined;
  const firstGroup = visibleEntries.find(
    (entry): entry is NavigationGroup => entry.type === "group",
  );
  const [openGroup, setOpenGroup] = useState(activeGroup?.label ?? firstGroup?.label ?? "");

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
          {visibleEntries.map((entry) => {
            if (entry.type === "item") {
              const active = isRouteActive(pathname, entry);
              const Icon = entry.icon;
              const directLink = (
                <Link
                  to={entry.to as never}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  aria-label={collapsed ? `${entry.label}: ${entry.desc}` : undefined}
                  className={cn(
                    "group relative flex w-full items-center gap-3 rounded-2xl text-left text-sm transition-all duration-200 active:scale-[0.99]",
                    collapsed ? "justify-center px-2 py-3" : "px-3 py-3",
                    isDark && active
                      ? "bg-[linear-gradient(135deg,rgba(95,175,199,0.22),rgba(255,255,255,0.08))] text-white shadow-[inset_3px_0_0_var(--system-primary-light),0_14px_30px_-24px_rgba(95,175,199,0.9)]"
                      : isDark
                        ? "text-white/72 hover:bg-white/[0.07] hover:text-white"
                        : active
                          ? "bg-primary/12 text-primary shadow-[inset_3px_0_0_var(--system-primary)]"
                          : "text-foreground/70 hover:bg-white/65 hover:text-primary",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-9 shrink-0 place-items-center rounded-xl transition-all duration-200",
                      active
                        ? "bg-cyan-300/18 text-cyan-100 ring-1 ring-cyan-200/25"
                        : "bg-white/[0.06] text-white/68 group-hover:bg-white/[0.1] group-hover:text-cyan-100",
                    )}
                  >
                    <Icon className="size-4.5" strokeWidth={active ? 2.35 : 1.9} />
                  </span>
                  {!collapsed && (
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold leading-tight tracking-[-0.01em]">
                        {entry.label}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] font-medium leading-tight text-white/42">
                        {entry.desc}
                      </span>
                    </span>
                  )}
                </Link>
              );

              return collapsed ? (
                <Tooltip key={entry.to}>
                  <TooltipTrigger asChild>{directLink}</TooltipTrigger>
                  <TooltipContent
                    side="right"
                    className="border border-cyan-200/15 bg-[#14212a] text-cyan-50 shadow-xl"
                  >
                    <p className="font-semibold">{entry.label}</p>
                    <p className="text-[10px] text-cyan-50/60">{entry.desc}</p>
                  </TooltipContent>
                </Tooltip>
              ) : (
                <div key={entry.to}>{directLink}</div>
              );
            }

            const groupActive = activeGroup?.label === entry.label;
            const open = openGroup === entry.label && !collapsed;
            const Icon = entry.icon;
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
                    setOpenGroup(entry.label);
                    return;
                  }
                  setOpenGroup(open ? "" : entry.label);
                }}
                aria-expanded={open}
                aria-label={collapsed ? entry.label : undefined}
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
                        {entry.label}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] font-medium leading-tight text-white/42">
                        {entry.desc}
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
                key={entry.label}
                open={open}
                onOpenChange={(value) => setOpenGroup(value ? entry.label : "")}
              >
                <CollapsibleTrigger asChild>
                  {collapsed ? (
                    <Tooltip>
                      <TooltipTrigger asChild>{groupButton}</TooltipTrigger>
                      <TooltipContent
                        side="right"
                        className="border border-cyan-200/15 bg-[#14212a] text-cyan-50 shadow-xl"
                      >
                        {entry.label}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    groupButton
                  )}
                </CollapsibleTrigger>

                {!collapsed && (
                  <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                    <div className="ml-[1.6rem] mt-1 space-y-1 border-l border-cyan-200/12 pl-3">
                      {entry.children.map((child) => {
                        const isExternal = Boolean(child.external && child.href);
                        const active = !isExternal && isRouteActive(pathname, child);
                        const ChildIcon = child.icon;
                        const childClass = cn(
                          "group/sub relative flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium transition-all duration-200 active:scale-[0.99]",
                          active
                            ? "bg-white/[0.09] text-white shadow-[inset_2px_0_0_var(--system-primary-light)]"
                            : "text-white/58 hover:bg-white/[0.055] hover:text-white/88",
                        );
                        const iconClass = cn(
                          "size-3.5 shrink-0 transition-colors",
                          active
                            ? "text-cyan-200"
                            : "text-white/38 group-hover/sub:text-cyan-100/75",
                        );
                        if (isExternal) {
                          return (
                            <a
                              key={child.key ?? child.href}
                              href={child.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={onNavigate}
                              className={childClass}
                            >
                              <ChildIcon className={iconClass} strokeWidth={1.9} />
                              <span className="flex-1 truncate">{child.label}</span>
                              <ExternalLink className="size-3 text-white/35" />
                            </a>
                          );
                        }
                        return (
                          <Link
                            key={child.key ?? child.to}
                            to={child.to as never}
                            onClick={onNavigate}
                            aria-current={active ? "page" : undefined}
                            className={childClass}
                          >
                            <ChildIcon
                              className={iconClass}
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
