import {
  BadgeDollarSign,
  BarChart3,
  Building2,
  Cable,
  Calendar,
  FileText,
  FolderArchive,
  Home,
  Inbox,
  KeyRound,
  LayoutGrid,
  Megaphone,
  Settings,
  UserCog,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { AppModule } from "@/lib/mock/permissions";

export type ModuleItem = {
  to: string;
  label: string;
  shortLabel?: string;
  desc: string;
  icon: LucideIcon;
  module: AppModule;
  exact?: boolean;
  primary?: boolean;
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
  },
  {
    to: "/atendimentos",
    label: "Atendimentos",
    shortLabel: "Atend.",
    desc: "Funil e histórico",
    icon: Inbox,
    module: "atendimentos",
    primary: true,
  },
  {
    to: "/imoveis",
    label: "Imóveis",
    shortLabel: "Imóveis",
    desc: "Carteira completa",
    icon: Building2,
    module: "imoveis",
    primary: true,
  },
  {
    to: "/agenda",
    label: "Agenda",
    shortLabel: "Agenda",
    desc: "Visitas e compromissos",
    icon: Calendar,
    module: "agenda",
    primary: true,
  },
  {
    to: "/mais",
    label: "Mais",
    shortLabel: "Mais",
    desc: "Outros módulos",
    icon: LayoutGrid,
    module: "dashboard",
    primary: true,
  },
  {
    to: "/clientes",
    label: "Clientes",
    desc: "Cadastro e relacionamento",
    icon: Users,
    module: "clientes",
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
    desc: "Campanhas e portais",
    icon: Megaphone,
    module: "marketing",
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
