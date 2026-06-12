import { Link, Outlet, useRouterState, useNavigate } from "@tanstack/react-router";
import { Bell, Building2, Calendar, Home, Inbox, LayoutGrid, Menu } from "lucide-react";
import { useEffect, useState } from "react";
import { MeshBackground } from "./mesh-background";
import { AgencySwitcher } from "./agency-switcher";
import { SidebarMenu } from "./sidebar-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useSession } from "@/lib/auth-mock";
import { cn } from "@/lib/utils";
import { NotificationBell } from "./notification-bell";
import type { AppModule } from "@/lib/mock/permissions";

type NavItem = { to: string; label: string; icon: typeof Home; module: AppModule; exact?: boolean };
const navItems: NavItem[] = [
  { to: "/", label: "Início", icon: Home, exact: true },
  { to: "/atendimentos", label: "Atend.", icon: Inbox },
  { to: "/imoveis", label: "Imóveis", icon: Building2 },
  { to: "/alugueis", label: "Aluguéis", icon: KeyRound },
  { to: "/vendas", label: "Vendas", icon: BadgeDollarSign },
  { to: "/clientes", label: "Clientes", icon: Users },
  { to: "/agenda", label: "Agenda", icon: Calendar },
  { to: "/corretores", label: "Equipe", icon: UserCog },
  { to: "/contratos", label: "Contratos", icon: FileText },
  { to: "/financeiro", label: "Finanças", icon: Wallet },
  { to: "/marketing", label: "Marketing", icon: Megaphone },
  { to: "/documentos", label: "Docs", icon: FileText },
  { to: "/integracoes", label: "Integrações", icon: Cable },
  { to: "/configuracoes", label: "Config.", icon: Settings },
  { to: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { to: "/mais", label: "Mais", icon: LayoutGrid },
];

export function AppShell() {
  const session = useSession();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (session === null) navigate({ to: "/login" });
  }, [session, navigate]);

  if (!session) return null;

  const visibleNav = navItems.filter((item) => session.modules.includes(item.module));

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-[1180px] flex-col font-sans text-foreground">
      <MeshBackground />

      <aside className="glass-panel-strong fixed inset-y-4 left-4 z-40 hidden w-72 flex-col overflow-hidden rounded-[2rem] border border-white/50 p-4 shadow-2xl shadow-primary/10 lg:flex">
        <div className="mb-5 flex items-center gap-3 px-2 pt-1">
          <div className="grid size-11 place-items-center rounded-2xl bg-primary/15 text-primary shadow-inner">
            <Building2 className="size-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-primary">
              Gestão Cordial
            </span>
            <p className="truncate text-sm font-semibold text-foreground/80">Painel imobiliário</p>
          </div>
        </div>

        <SidebarMenu className="min-h-0 flex-1 overflow-y-auto pr-1" compact />
      </aside>

      <div className="relative z-10 flex min-h-screen w-full flex-col lg:pl-80">
        <header className="sticky top-0 z-30 flex flex-col gap-3 px-5 pt-6 pb-3 lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-col">
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
                Gestão Cordial
              </span>
              <h1 className="truncate text-xl font-semibold tracking-tight">Olá, {session.nome}</h1>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <SheetTrigger asChild>
                  <button
                    className="glass-panel grid size-10 place-items-center rounded-full text-primary"
                    aria-label="Abrir módulos"
                    type="button"
                  >
                    <Menu className="size-5" />
                  </button>
                </SheetTrigger>
                <SheetContent
                  side="left"
                  className="glass-panel-strong w-[88vw] max-w-[360px] overflow-y-auto border-white/60 bg-background/90 p-5 backdrop-blur-2xl lg:hidden"
                >
                  <SheetHeader className="mb-4 text-left">
                    <SheetTitle className="text-base">Módulos</SheetTitle>
                  </SheetHeader>
                  <SidebarMenu onNavigate={() => setMobileMenuOpen(false)} />
                </SheetContent>
              </Sheet>
              <Link
                to="/mais"
                className="glass-panel grid size-10 place-items-center rounded-full text-sm font-semibold text-primary"
                aria-label="Perfil"
              >
                {session.iniciais}
              </Link>
            </div>
          </div>
          <AgencySwitcher />
        </header>

        <header className="sticky top-0 z-30 hidden px-6 py-4 lg:block">
          <div className="glass-panel-strong mx-auto flex max-w-screen-2xl items-center justify-between gap-4 rounded-[1.75rem] border border-white/50 px-4 py-3 shadow-xl shadow-primary/5">
            <div className="min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-primary">
                Bem-vindo de volta
              </span>
              <h1 className="truncate text-lg font-semibold tracking-tight">Olá, {session.nome}</h1>
            </div>

            <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
              <div className="w-full max-w-sm">
                <AgencySwitcher />
              </div>
              <button
                type="button"
                className="glass-panel grid size-10 shrink-0 place-items-center rounded-full text-primary transition-transform hover:scale-105"
                aria-label="Notificações"
              >
                <Bell className="size-4" />
              </button>
              <Link
                to="/mais"
                className="glass-panel flex shrink-0 items-center gap-3 rounded-full py-1.5 pr-4 pl-1.5 text-sm font-semibold text-primary transition-transform hover:scale-[1.02]"
                aria-label="Perfil do usuário"
              >
                <span className="grid size-9 place-items-center rounded-full bg-primary/15 text-xs font-bold">
                  {session.iniciais}
                </span>
                <span className="hidden text-left xl:block">
                  <span className="block leading-tight text-foreground">{session.nome}</span>
                  <span className="block text-[11px] leading-tight text-foreground/50">
                    {session.cargo}
                  </span>
                </span>
              </Link>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-screen-2xl flex-1 px-5 pb-32 lg:px-8 lg:pt-2 lg:pb-10 xl:px-10">
          <Outlet />
        </main>
      </div>

      <nav className="glass-panel-strong fixed bottom-5 left-1/2 z-40 flex h-16 w-[calc(100%-2rem)] max-w-[448px] -translate-x-1/2 items-center justify-around rounded-full px-2 lg:hidden">
        {navItems.map((item) => {
          const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to as never}
              className={cn(
                "relative flex flex-1 flex-col items-center justify-center gap-1 py-1 transition-colors",
                active ? "text-primary" : "text-foreground/45",
              )}
            >
              <Icon
                className={cn("size-5", active && "drop-shadow-sm")}
                strokeWidth={active ? 2.4 : 1.8}
              />
              <span className="text-[9px] font-bold uppercase tracking-tighter">{item.label}</span>
              {active && <span className="absolute -bottom-1 size-1 rounded-full bg-primary" />}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
