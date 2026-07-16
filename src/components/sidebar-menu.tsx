import { Link, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  BriefcaseBusiness,
  Cable,
  CalendarCheck2,
  ChartNoAxesCombined,
  ChevronDown,
  CircleDollarSign,
  FileText,
  FolderArchive,
  Handshake,
  HousePlus,
  KeyRound,
  LayoutDashboard,
  Megaphone,
  MessageCircleMore,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Star,
  TrendingUp,
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

type Accent = "cyan" | "indigo" | "violet" | "emerald" | "amber" | "rose" | "teal" | "slate";

type AccentTokens = {
  ring: string;
  iconBg: string;
  iconText: string;
  iconRing: string;
  activeBg: string;
  activeShadow: string;
  activeText: string;
  activeIndicator: string;
  hoverIcon: string;
};

const accentMap: Record<Accent, AccentTokens> = {
  cyan: {
    ring: "ring-cyan-200/25",
    iconBg: "bg-cyan-200/16",
    iconText: "text-cyan-100",
    iconRing: "ring-1 ring-cyan-200/25",
    activeBg: "bg-[linear-gradient(135deg,rgba(103,232,249,0.17),rgba(255,255,255,0.055))]",
    activeShadow: "shadow-[0_18px_32px_-26px_rgba(103,232,249,0.78)]",
    activeText: "text-white",
    activeIndicator: "before:bg-cyan-300",
    hoverIcon: "group-hover:text-cyan-100",
  },
  indigo: {
    ring: "ring-indigo-200/25",
    iconBg: "bg-indigo-300/16",
    iconText: "text-indigo-100",
    iconRing: "ring-1 ring-indigo-300/25",
    activeBg: "bg-[linear-gradient(135deg,rgba(165,180,252,0.17),rgba(255,255,255,0.055))]",
    activeShadow: "shadow-[0_18px_32px_-26px_rgba(129,140,248,0.78)]",
    activeText: "text-white",
    activeIndicator: "before:bg-indigo-300",
    hoverIcon: "group-hover:text-indigo-100",
  },
  violet: {
    ring: "ring-violet-200/25",
    iconBg: "bg-violet-300/16",
    iconText: "text-violet-100",
    iconRing: "ring-1 ring-violet-300/25",
    activeBg: "bg-[linear-gradient(135deg,rgba(196,181,253,0.18),rgba(255,255,255,0.055))]",
    activeShadow: "shadow-[0_18px_32px_-26px_rgba(167,139,250,0.78)]",
    activeText: "text-white",
    activeIndicator: "before:bg-violet-300",
    hoverIcon: "group-hover:text-violet-100",
  },
  emerald: {
    ring: "ring-emerald-200/25",
    iconBg: "bg-emerald-300/16",
    iconText: "text-emerald-100",
    iconRing: "ring-1 ring-emerald-300/25",
    activeBg: "bg-[linear-gradient(135deg,rgba(110,231,183,0.18),rgba(255,255,255,0.055))]",
    activeShadow: "shadow-[0_18px_32px_-26px_rgba(52,211,153,0.78)]",
    activeText: "text-white",
    activeIndicator: "before:bg-emerald-300",
    hoverIcon: "group-hover:text-emerald-100",
  },
  amber: {
    ring: "ring-amber-200/25",
    iconBg: "bg-amber-300/16",
    iconText: "text-amber-100",
    iconRing: "ring-1 ring-amber-300/25",
    activeBg: "bg-[linear-gradient(135deg,rgba(252,211,77,0.18),rgba(255,255,255,0.055))]",
    activeShadow: "shadow-[0_18px_32px_-26px_rgba(251,191,36,0.76)]",
    activeText: "text-white",
    activeIndicator: "before:bg-amber-300",
    hoverIcon: "group-hover:text-amber-100",
  },
  rose: {
    ring: "ring-rose-200/25",
    iconBg: "bg-rose-300/16",
    iconText: "text-rose-100",
    iconRing: "ring-1 ring-rose-300/25",
    activeBg: "bg-[linear-gradient(135deg,rgba(253,164,175,0.17),rgba(255,255,255,0.055))]",
    activeShadow: "shadow-[0_18px_32px_-26px_rgba(251,113,133,0.76)]",
    activeText: "text-white",
    activeIndicator: "before:bg-rose-300",
    hoverIcon: "group-hover:text-rose-100",
  },
  teal: {
    ring: "ring-teal-200/25",
    iconBg: "bg-teal-300/16",
    iconText: "text-teal-100",
    iconRing: "ring-1 ring-teal-300/25",
    activeBg: "bg-[linear-gradient(135deg,rgba(94,234,212,0.18),rgba(255,255,255,0.055))]",
    activeShadow: "shadow-[0_18px_32px_-26px_rgba(45,212,191,0.78)]",
    activeText: "text-white",
    activeIndicator: "before:bg-teal-300",
    hoverIcon: "group-hover:text-teal-100",
  },
  slate: {
    ring: "ring-slate-200/20",
    iconBg: "bg-slate-300/12",
    iconText: "text-slate-100",
    iconRing: "ring-1 ring-slate-200/20",
    activeBg: "bg-[linear-gradient(135deg,rgba(203,213,225,0.16),rgba(255,255,255,0.05))]",
    activeShadow: "shadow-[0_18px_32px_-26px_rgba(148,163,184,0.68)]",
    activeText: "text-white",
    activeIndicator: "before:bg-slate-300",
    hoverIcon: "group-hover:text-slate-100",
  },
};

export type NavigationChild = Pick<ModuleItem, "to" | "label" | "module" | "exact"> & {
  key?: string;
  icon: LucideIcon;
};

export type NavigationGroup = {
  type: "group";
  label: string;
  desc: string;
  icon: LucideIcon;
  accent: Accent;
  children: NavigationChild[];
};

export type NavigationDirectItem = Pick<
  ModuleItem,
  "to" | "label" | "desc" | "module" | "exact"
> & {
  type: "item";
  icon: LucideIcon;
  accent: Accent;
};

export type NavigationEntry = NavigationGroup | NavigationDirectItem;

type Section = {
  label: string;
  entries: NavigationEntry[];
};

const sections: Section[] = [
  {
    label: "Operação",
    entries: [
      {
        type: "item",
        to: "/",
        label: "Painel",
        desc: "Visão geral",
        icon: LayoutDashboard,
        module: "dashboard",
        exact: true,
        accent: "cyan",
      },
      {
        type: "item",
        to: "/agenda",
        label: "Agenda",
        desc: "Visitas e retornos",
        icon: CalendarCheck2,
        module: "agenda",
        accent: "teal",
      },
      {
        type: "item",
        to: "/agenciamentos",
        label: "Agenciamentos",
        desc: "Captação e imóveis",
        icon: HousePlus,
        module: "agenciamentos",
        accent: "emerald",
      },
    ],
  },
  {
    label: "Relacionamento & Negócios",
    entries: [
      {
        type: "group",
        label: "Relacionamento",
        desc: "Leads e clientes",
        icon: MessageCircleMore,
        accent: "indigo",
        children: [
          { to: "/atendimentos", label: "Atendimentos", icon: Handshake, module: "atendimentos" },
          { to: "/clientes", label: "Clientes", icon: Users, module: "clientes" },
        ],
      },
      {
        type: "group",
        label: "Negócios",
        desc: "Contratos e operações",
        icon: BriefcaseBusiness,
        accent: "amber",
        children: [
          { to: "/alugueis", label: "Aluguéis", icon: KeyRound, module: "alugueis" },
          { to: "/vendas", label: "Vendas", icon: CircleDollarSign, module: "vendas" },
          { to: "/contratos", label: "Contratos", icon: FileText, module: "contratos" },
        ],
      },
    ],
  },
  {
    label: "Gestão & Crescimento",
    entries: [
      {
        type: "group",
        label: "Gestão",
        desc: "Equipe e resultados",
        icon: ChartNoAxesCombined,
        accent: "violet",
        children: [
          { to: "/corretores", label: "Corretores", icon: UserCog, module: "corretores" },
          { to: "/financeiro", label: "Financeiro", icon: Wallet, module: "financeiro" },
          { to: "/relatorios", label: "Relatórios", icon: BarChart3, module: "relatorios" },
        ],
      },
      {
        type: "item",
        to: "/pesquisa-satisfacao",
        label: "Pesquisa de satisfação",
        desc: "Avaliações dos clientes",
        icon: Star,
        module: "pesquisa_satisfacao",
        accent: "amber",
      },
      {
        type: "group",
        label: "Crescimento",
        desc: "Marketing e evolução",
        icon: TrendingUp,
        accent: "rose",
        children: [
          { to: "/marketing", label: "Marketing", icon: Megaphone, module: "marketing" },
          { to: "/documentos", label: "Documentos", icon: FolderArchive, module: "documentos" },
          { to: "/integracoes", label: "Integrações", icon: Cable, module: "integracoes" },
        ],
      },
    ],
  },
  {
    label: "Sistema",
    entries: [
      {
        type: "item",
        to: "/configuracoes",
        label: "Configurações",
        desc: "Preferências operacionais",
        icon: Settings,
        module: "configuracoes",
        accent: "slate",
      },
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

  const visibleSections = useMemo(() => {
    return sections
      .map((section) => {
        const entries = section.entries
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
          .filter((entry): entry is NavigationEntry => entry !== null);
        return entries.length > 0 ? { ...section, entries } : null;
      })
      .filter((section): section is Section => section !== null);
  }, [sessionModules]);

  const allEntries = useMemo(() => visibleSections.flatMap((s) => s.entries), [visibleSections]);

  const activeEntry = allEntries.find((entry) =>
    entry.type === "item"
      ? isRouteActive(pathname, entry)
      : entry.children.some((child) => isRouteActive(pathname, child)),
  );
  const activeGroup = activeEntry?.type === "group" ? activeEntry : undefined;
  const [openGroup, setOpenGroup] = useState(activeGroup?.label ?? "");

  useEffect(() => {
    if (activeGroup?.label) setOpenGroup(activeGroup.label);
  }, [activeGroup?.label]);

  const focusRing =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-100/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111719]";
  const itemBase =
    "group relative flex w-full items-center gap-3 rounded-2xl border text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.045)] transition-[background,border-color,box-shadow,color,transform] duration-200 ease-out active:scale-[0.985]";
  const indicatorBase =
    "before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:rounded-r-full before:transition-all before:duration-200";
  const itemSizing = collapsed
    ? "min-h-[2.75rem] justify-center px-2 py-2.5"
    : "min-h-[3.35rem] px-3 py-2.5 hover:translate-x-[1px]";
  const inactiveTone = isDark
    ? "border-white/[0.065] bg-white/[0.025] text-white/74 hover:border-white/[0.13] hover:bg-white/[0.065] hover:text-white hover:shadow-[0_14px_26px_-24px_rgba(0,0,0,0.9)] before:h-0 before:w-0"
    : "border-foreground/8 bg-white/45 text-foreground/70 hover:border-primary/15 hover:bg-white/75 hover:text-primary before:h-0 before:w-0";
  const activeTone = (accent: AccentTokens) =>
    cn(
      accent.activeBg,
      accent.activeShadow,
      accent.activeText,
      accent.activeIndicator,
      accent.ring,
      "border-white/[0.16] ring-1 before:h-7 before:w-[3px]",
    );
  const iconClass = (active: boolean, accent: AccentTokens) =>
    cn(
      "grid size-9 shrink-0 place-items-center rounded-xl transition-[background,color,box-shadow,transform] duration-200",
      active
        ? cn(
            accent.iconBg,
            accent.iconText,
            accent.iconRing,
            "shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]",
          )
        : cn("bg-white/[0.045] text-white/66 group-hover:bg-white/[0.09]", accent.hoverIcon),
    );
  const textBlock = (label: string, desc: string) => (
    <span className="min-w-0 flex-1">
      <span className="block truncate text-[13.5px] font-semibold leading-tight tracking-normal">
        {label}
      </span>
      <span className="mt-0.5 block truncate text-[11px] font-medium leading-tight tracking-normal text-white/52">
        {desc}
      </span>
    </span>
  );

  return (
    <TooltipProvider delayDuration={120}>
      <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
        {showToggle && (
          <div className={cn("mb-3 flex", collapsed ? "justify-center" : "justify-end")}>
            <button
              type="button"
              className={cn(
                "grid size-9 place-items-center rounded-2xl border border-white/[0.085] bg-white/[0.045] text-white/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-all duration-200 hover:border-teal-100/25 hover:bg-teal-100/10 hover:text-white active:scale-95",
                focusRing,
              )}
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
          className="premium-sidebar-scroll min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden pr-1"
          aria-label="Navegação principal"
        >
          {visibleSections.map((section, sectionIndex) => (
            <div key={section.label} className="space-y-1.5">
              {!collapsed && (
                <div
                  className={cn(
                    "px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.22em]",
                    isDark ? "text-white/32" : "text-foreground/38",
                    sectionIndex === 0 && "pt-0",
                  )}
                >
                  {section.label}
                </div>
              )}
              {collapsed && sectionIndex > 0 && (
                <div className="mx-3 h-px bg-white/[0.06]" aria-hidden="true" />
              )}

              <div className="space-y-1">
                {section.entries.map((entry) => {
                  const accent = accentMap[entry.accent];
                  if (entry.type === "item") {
                    const active = isRouteActive(pathname, entry);
                    const Icon = entry.icon;
                    const directLink = (
                      <Link
                        to={entry.to as never}
                        onClick={() => {
                          setOpenGroup("");
                          onNavigate?.();
                        }}
                        aria-current={active ? "page" : undefined}
                        aria-label={`${entry.label}: ${entry.desc}`}
                        className={cn(
                          itemBase,
                          indicatorBase,
                          itemSizing,
                          focusRing,
                          active ? activeTone(accent) : inactiveTone,
                        )}
                      >
                        <span className={iconClass(active, accent)}>
                          <Icon className="size-[18px]" strokeWidth={active ? 2.35 : 1.9} />
                        </span>
                        {!collapsed && textBlock(entry.label, entry.desc)}
                      </Link>
                    );

                    return collapsed ? (
                      <Tooltip key={entry.to}>
                        <TooltipTrigger asChild>{directLink}</TooltipTrigger>
                        <TooltipContent
                          side="right"
                          className="border border-white/10 bg-[#14212a] text-white shadow-xl"
                        >
                          <p className="font-semibold">{entry.label}</p>
                          <p className="text-[10px] text-white/60">{entry.desc}</p>
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
                        itemBase,
                        indicatorBase,
                        itemSizing,
                        focusRing,
                        groupActive ? activeTone(accent) : inactiveTone,
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
                      aria-label={
                        collapsed
                          ? `${entry.label}: ${entry.desc}`
                          : `${open ? "Recolher" : "Expandir"} ${entry.label}`
                      }
                    >
                      <span className={iconClass(groupActive, accent)}>
                        <Icon className="size-[18px]" strokeWidth={groupActive ? 2.35 : 1.9} />
                      </span>
                      {!collapsed && (
                        <>
                          {textBlock(entry.label, entry.desc)}
                          <ChevronDown
                            className={cn(
                              "size-4 text-white/42 transition-transform duration-300 ease-out",
                              open && "rotate-180 text-white/75",
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
                              className="border border-white/10 bg-[#14212a] text-white shadow-xl"
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
                          <div
                            className={cn(
                              "ml-[1.6rem] mt-1.5 space-y-1 border-l pl-3",
                              "border-white/[0.075]",
                            )}
                          >
                            {entry.children.map((child) => {
                              const active = isRouteActive(pathname, child);
                              const ChildIcon = child.icon;
                              const childClass = cn(
                                "group/sub relative flex min-h-10 items-center gap-2.5 rounded-xl border px-3 py-2 text-[13px] font-medium tracking-normal transition-[background,border-color,color,transform,box-shadow] duration-200 ease-out active:scale-[0.99]",
                                focusRing,
                                active
                                  ? cn(
                                      "border-white/[0.12] bg-white/[0.085] text-white shadow-[inset_2px_0_0_currentColor]",
                                      accent.iconText,
                                    )
                                  : "border-transparent text-white/64 hover:translate-x-[1px] hover:border-white/[0.08] hover:bg-white/[0.045] hover:text-white/95",
                              );
                              const iconClass = cn(
                                "size-3.5 shrink-0 transition-colors",
                                active
                                  ? accent.iconText
                                  : "text-white/40 group-hover/sub:text-white/80",
                              );
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
              </div>
            </div>
          ))}
        </nav>
      </div>
    </TooltipProvider>
  );
}
