import {
  BadgeDollarSign,
  BarChart3,
  Building2,
  Cable,
  CalendarCheck2,
  ClipboardCheck,
  FileText,
  FolderArchive,
  Home,
  Inbox,
  KeyRound,
  LayoutGrid,
  Megaphone,
  Settings,
  Star,
  UserCog,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { AppModule, UserProfile } from "@/lib/mock/permissions";

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
};

/** Fonte única de módulos do app. Bottom nav, sidebar, drawer e "Mais" derivam daqui. */
export const moduleItems: ModuleItem[] = [
  {
    to: "/",
    label: "Início",
    shortLabel: "Início",
    desc: "Painel executivo",
    icon: Home,
    module: "dashboard",
    exact: true,
    primary: true,
    primaryFor: ["admin_owner", "financeiro_admin", "corretor", "secretaria"],
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
  },
  {
    to: "/agenciamentos",
    label: "Agenciamentos",
    shortLabel: "Agenc.",
    desc: "Captações, placas e fotos",
    icon: ClipboardCheck,
    module: "agenciamentos",
    primaryFor: ["corretor"],
  },
  {
    to: "/agenda",
    label: "Agenda",
    shortLabel: "Agenda",
    desc: "Visitas, retornos e compromissos",
    icon: CalendarCheck2,
    module: "agenda",
    primary: true,
    primaryFor: ["admin_owner"],
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
    to: "/clientes",
    label: "Clientes",
    shortLabel: "Clientes",
    desc: "Cadastro e relacionamento",
    icon: Users,
    module: "clientes",
    primaryFor: ["corretor", "secretaria"],
  },
  {
    to: "/alugueis",
    label: "Aluguéis",
    desc: "Locações e repasses",
    icon: KeyRound,
    module: "alugueis",
  },
  {
    to: "/vendas",
    label: "Vendas",
    desc: "Funil e propostas",
    icon: BadgeDollarSign,
    module: "vendas",
  },
  {
    to: "/contratos",
    label: "Contratos",
    desc: "Vendas e aluguéis",
    icon: FileText,
    module: "contratos",
  },
  {
    to: "/corretores",
    label: "Corretores",
    desc: "Equipe e performance",
    icon: UserCog,
    module: "corretores",
  },
  {
    to: "/financeiro",
    label: "Financeiro",
    desc: "Receita e comissões",
    icon: Wallet,
    module: "financeiro",
  },
  {
    to: "/relatorios",
    label: "Relatórios",
    desc: "Indicadores e ranking",
    icon: BarChart3,
    module: "relatorios",
  },
  {
    to: "/marketing",
    label: "Marketing",
    shortLabel: "Marketing",
    desc: "Campanhas e portais",
    icon: Megaphone,
    module: "marketing",
    primaryFor: ["secretaria"],
  },
  {
    to: "/documentos",
    label: "Documentos",
    desc: "Arquivos e certidões",
    icon: FolderArchive,
    module: "documentos",
  },
  {
    to: "/integracoes",
    label: "Integrações",
    desc: "Conectores e sincronizações",
    icon: Cable,
    module: "integracoes",
  },
  {
    to: "/pesquisa-satisfacao",
    label: "Pesquisa de satisfação",
    shortLabel: "Pesquisa",
    desc: "Avaliações dos clientes",
    icon: Star,
    module: "pesquisa_satisfacao",
  },
  {
    to: "/configuracoes",
    label: "Configurações",
    desc: "Preferências operacionais",
    icon: Settings,
    module: "configuracoes",
  },
];

export const primaryModuleItems = moduleItems.filter((item) => item.primary);
export const secondaryModuleItems = moduleItems.filter((item) => !item.primary);

/** Filtra módulos visíveis com base nos módulos permitidos da sessão. */
export function getVisibleModules(
  modules: AppModule[] | undefined,
  items: ModuleItem[] = moduleItems,
) {
  if (!modules || modules.length === 0) return items;
  return items.filter((item) => modules.includes(item.module));
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

