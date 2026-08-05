import {
  BadgeDollarSign,
  BarChart3,
  Building2,
  Cable,
  CalendarCheck2,
  Camera,
  FileText,
  FolderArchive,
  HousePlus,
  Inbox,
  KeyRound,
  LayoutDashboard,
  LayoutGrid,
  Megaphone,
  Search,
  Settings,
  Star,
  UserCog,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { AppModule, UserProfile } from "@/lib/mock/permissions";

export const sidebarSectionOrder = ["operacao", "relacionamento", "gestao", "sistema"] as const;

export type SidebarSectionId = (typeof sidebarSectionOrder)[number];

export const sidebarSectionLabels: Record<SidebarSectionId, string> = {
  operacao: "Operação",
  relacionamento: "Relacionamento e negócios",
  gestao: "Gestão e crescimento",
  sistema: "Sistema",
};

export type SidebarNavigationMeta = {
  section: SidebarSectionId;
  order: number;
  label?: string;
  desc?: string;
};

export type ModuleItem = {
  to: string;
  label: string;
  shortLabel?: string;
  desc: string;
  icon: LucideIcon;
  module: AppModule;
  exact?: boolean;
  /** @deprecated substituído por primaryFor; mantido para retrocompatibilidade. */
  primary?: boolean;
  /** Perfis que devem exibir este item na bottom-nav mobile. */
  primaryFor?: UserProfile[];
  /** Metadados de apresentação para a sidebar e o drawer, sem duplicar a rota. */
  sidebar?: SidebarNavigationMeta;
};

export type SidebarModuleItem = ModuleItem & { sidebar: SidebarNavigationMeta };

export type SidebarNavigationSection = {
  id: SidebarSectionId;
  label: string;
  items: SidebarModuleItem[];
};

/** Fonte única de módulos do app. Bottom nav, sidebar, drawer e "Mais" derivam daqui. */
export const moduleItems: ModuleItem[] = [
  {
    to: "/",
    label: "Início",
    shortLabel: "Início",
    desc: "Painel executivo",
    icon: LayoutDashboard,
    module: "dashboard",
    exact: true,
    primary: true,
    primaryFor: ["admin_owner", "financeiro_admin", "corretor", "secretaria"],
    sidebar: {
      section: "operacao",
      order: 10,
      label: "Painel",
      desc: "Visão geral",
    },
  },
  {
    to: "/atendimentos",
    label: "Atendimentos",
    shortLabel: "Atend.",
    desc: "Funil e histórico",
    icon: Inbox,
    module: "atendimentos",
    primary: true,
    primaryFor: ["admin_owner", "corretor", "secretaria"],
    sidebar: {
      section: "relacionamento",
      order: 10,
      desc: "CRM e próximos passos",
    },
  },
  {
    to: "/imoveis",
    label: "Imóveis",
    shortLabel: "Imóveis",
    desc: "Carteira completa",
    icon: Building2,
    module: "imoveis",
    primary: true,
    primaryFor: ["admin_owner"],
    sidebar: {
      section: "operacao",
      order: 50,
      desc: "Carteira de imóveis",
    },
  },
  {
    to: "/agenciamentos",
    label: "Agenciamentos",
    shortLabel: "Agenc.",
    desc: "Captações, placas e fotos",
    icon: HousePlus,
    module: "agenciamentos",
    primaryFor: ["corretor"],
    sidebar: {
      section: "operacao",
      order: 40,
      desc: "Captação e imóveis",
    },
  },
  {
    to: "/agenda",
    label: "Visitas e compromissos",
    shortLabel: "Agenda",
    desc: "Visitas, retornos e compromissos",
    icon: CalendarCheck2,
    module: "agenda",
    exact: true,
    primary: true,
    primaryFor: ["admin_owner"],
    sidebar: {
      section: "operacao",
      order: 20,
      label: "Agenda",
      desc: "Visitas e retornos",
    },
  },
  {
    to: "/agenda/fotos",
    label: "Agenda de fotos",
    shortLabel: "Fotos",
    desc: "Sessões de fotos e vídeos dos imóveis",
    icon: Camera,
    module: "agenda",
    sidebar: {
      section: "operacao",
      order: 30,
      desc: "Fotos e vídeos",
    },
  },
  {
    to: "/mais",
    label: "Mais",
    shortLabel: "Mais",
    desc: "Outros módulos",
    icon: LayoutGrid,
    module: "dashboard",
    primary: true,
    primaryFor: ["admin_owner", "financeiro_admin", "corretor", "secretaria"],
  },
  {
    to: "/alugueis",
    label: "Aluguéis",
    desc: "Locações e repasses",
    icon: KeyRound,
    module: "alugueis",
    sidebar: { section: "relacionamento", order: 20 },
  },
  {
    to: "/vendas",
    label: "Vendas",
    desc: "Funil e propostas",
    icon: BadgeDollarSign,
    module: "vendas",
    sidebar: { section: "relacionamento", order: 30 },
  },
  {
    to: "/contratos",
    label: "Contratos",
    desc: "Vendas e aluguéis",
    icon: FileText,
    module: "contratos",
    sidebar: {
      section: "relacionamento",
      order: 40,
      desc: "Vendas e locações",
    },
  },
  {
    to: "/corretores",
    label: "Corretores",
    desc: "Equipe e performance",
    icon: UserCog,
    module: "corretores",
    sidebar: { section: "gestao", order: 10 },
  },
  {
    to: "/financeiro",
    label: "Financeiro",
    desc: "Receita e comissões",
    icon: Wallet,
    module: "financeiro",
    sidebar: {
      section: "gestao",
      order: 20,
      desc: "Receitas e comissões",
    },
  },
  {
    to: "/relatorios",
    label: "Relatórios",
    desc: "Indicadores e ranking",
    icon: BarChart3,
    module: "relatorios",
    sidebar: {
      section: "gestao",
      order: 30,
      desc: "Indicadores e resultados",
    },
  },
  {
    to: "/marketing",
    label: "Marketing",
    shortLabel: "Marketing",
    desc: "Campanhas e portais",
    icon: Megaphone,
    module: "marketing",
    primaryFor: ["secretaria"],
    sidebar: { section: "gestao", order: 50 },
  },
  {
    to: "/documentos",
    label: "Documentos internos",
    shortLabel: "Documentos",
    desc: "Arquivos internos da imobiliária",
    icon: FolderArchive,
    module: "documentos",
    sidebar: { section: "gestao", order: 60, desc: "Arquivos internos" },
  },
  {
    to: "/busca",
    label: "Busca",
    shortLabel: "Busca",
    desc: "Busca global com histórico",
    icon: Search,
    module: "busca",
    sidebar: { section: "sistema", order: 5, desc: "Pesquisa em todos os módulos" },
  },
  {
    to: "/integracoes",
    label: "Integrações",
    desc: "Conectores e sincronizações",
    icon: Cable,
    module: "integracoes",
    sidebar: { section: "sistema", order: 10 },
  },
  {
    to: "/pesquisa-satisfacao",
    label: "Pesquisa de satisfação",
    shortLabel: "Pesquisa",
    desc: "Avaliações dos clientes",
    icon: Star,
    module: "pesquisa_satisfacao",
    sidebar: {
      section: "gestao",
      order: 40,
      desc: "Avaliações de clientes",
    },
  },
  {
    to: "/configuracoes",
    label: "Configurações",
    desc: "Preferências operacionais",
    icon: Settings,
    module: "configuracoes",
    sidebar: { section: "sistema", order: 20 },
  },
];

export const primaryModuleItems = moduleItems.filter((item) => item.primary);
export const secondaryModuleItems = moduleItems.filter((item) => !item.primary);

/** Filtra módulos visíveis com base nos módulos permitidos da sessão. */
export function getVisibleModules(
  modules: AppModule[] | undefined,
  items: ModuleItem[] = moduleItems,
) {
  if (!modules?.length) return [];
  return items.filter((item) => modules.includes(item.module));
}

/** Deriva sidebar e drawer do mesmo registro consumido por bottom-nav e “Mais”. */
export function getSidebarSections(modules: AppModule[] | undefined): SidebarNavigationSection[] {
  const items = getVisibleModules(modules).filter(
    (item): item is SidebarModuleItem => item.sidebar !== undefined,
  );

  return sidebarSectionOrder.flatMap((id) => {
    const sectionItems = items
      .filter((item) => item.sidebar.section === id)
      .sort((a, b) => a.sidebar.order - b.sidebar.order);

    return sectionItems.length
      ? [{ id, label: sidebarSectionLabels[id], items: sectionItems }]
      : [];
  });
}

export function isModuleItemActive(
  pathname: string,
  item: Pick<ModuleItem, "to" | "exact">,
): boolean {
  if (item.exact) return pathname === item.to;
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

/**
 * Itens da bottom-nav mobile específicos por perfil.
 * Sempre respeita também os módulos autorizados da sessão.
 */
export function getPrimaryItemsForProfile(
  profile: UserProfile | undefined,
  allowedModules: AppModule[] | undefined,
): ModuleItem[] {
  const items = profile
    ? moduleItems.filter((item) => item.primaryFor?.includes(profile))
    : primaryModuleItems;
  return getVisibleModules(allowedModules, items);
}
