import { Link, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  Building2,
  Calendar,
  FileText,
  Handshake,
  Home,
  Inbox,
  Landmark,
  Megaphone,
  PlugZap,
  Settings,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";

type SidebarMenuItem = {
  to: string;
  label: string;
  description: string;
  icon: typeof Home;
  exact?: boolean;
};

export const sidebarMenuItems: SidebarMenuItem[] = [
  { to: "/", label: "Dashboard", description: "Visão geral da operação", icon: Home, exact: true },
  { to: "/atendimentos", label: "Atendimentos", description: "Leads e negociações", icon: Inbox },
  { to: "/clientes", label: "Clientes", description: "Cadastro e relacionamento", icon: Users },
  { to: "/imoveis", label: "Imóveis", description: "Carteira e captações", icon: Building2 },
  { to: "/alugueis", label: "Aluguéis", description: "Locações e repasses", icon: Landmark },
  { to: "/vendas", label: "Vendas", description: "Funil e propostas", icon: Handshake },
  { to: "/contratos", label: "Contratos", description: "Minutas e assinaturas", icon: FileText },
  { to: "/corretores", label: "Corretores", description: "Equipe e performance", icon: UserCog },
  { to: "/agenda", label: "Agenda", description: "Visitas e compromissos", icon: Calendar },
  { to: "/financeiro", label: "Financeiro", description: "Receitas e comissões", icon: Wallet },
  {
    to: "/relatorios",
    label: "Relatórios",
    description: "Indicadores e rankings",
    icon: BarChart3,
  },
  { to: "/marketing", label: "Marketing", description: "Campanhas e portais", icon: Megaphone },
  { to: "/documentos", label: "Documentos", description: "Arquivos e certidões", icon: FileText },
  { to: "/integracoes", label: "Integrações", description: "Portais e automações", icon: PlugZap },
  {
    to: "/configuracoes",
    label: "Configurações",
    description: "Preferências da conta",
    icon: Settings,
  },
];

type SidebarMenuProps = {
  className?: string;
  compact?: boolean;
  onNavigate?: () => void;
};

export function SidebarMenu({ className, compact = false, onNavigate }: SidebarMenuProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav className={cn("flex flex-col gap-1", className)} aria-label="Módulos principais">
      {sidebarMenuItems.map((item) => {
        const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
        const Icon = item.icon;

        return (
          <Link
            key={item.to}
            to={item.to as never}
            onClick={onNavigate}
            className={cn(
              "group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition-all hover:bg-white/65 hover:text-primary",
              active
                ? "bg-primary/12 text-primary shadow-[0_12px_30px_rgba(177,99,73,0.14)]"
                : "text-foreground/68",
              compact && "rounded-xl px-2.5 py-2",
            )}
          >
            <span
              className={cn(
                "grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/15",
                active && "bg-primary text-primary-foreground",
                compact && "size-8 rounded-lg",
              )}
            >
              <Icon
                className={cn("size-4", compact && "size-3.5")}
                strokeWidth={active ? 2.4 : 1.8}
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold leading-tight">{item.label}</span>
              {!compact && (
                <span className="mt-0.5 block truncate text-[11px] leading-tight text-foreground/45">
                  {item.description}
                </span>
              )}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
