import { Link, Outlet, useRouterState, useNavigate } from "@tanstack/react-router";
import { Home, Inbox, Building2, Calendar, LayoutGrid } from "lucide-react";
import { useEffect } from "react";
import { MeshBackground } from "./mesh-background";
import { AgencySwitcher } from "./agency-switcher";
import { useSession } from "@/lib/auth-mock";
import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; icon: typeof Home; exact?: boolean };
const navItems: NavItem[] = [
  { to: "/", label: "Início", icon: Home, exact: true },
  { to: "/atendimentos", label: "Atend.", icon: Inbox },
  { to: "/imoveis", label: "Imóveis", icon: Building2 },
  { to: "/agenda", label: "Agenda", icon: Calendar },
  { to: "/mais", label: "Mais", icon: LayoutGrid },
];

export function AppShell() {
  const session = useSession();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (session === null) navigate({ to: "/login" });
  }, [session, navigate]);

  if (!session) return null;

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-[480px] flex-col font-sans text-foreground">
      <MeshBackground />

      <header className="sticky top-0 z-30 flex flex-col gap-3 px-5 pt-6 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 flex-col">
            <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
              Gestão Cordial
            </span>
            <h1 className="truncate text-xl font-semibold tracking-tight">
              Olá, {session.nome}
            </h1>
          </div>
          <Link
            to="/mais"
            className="glass-panel grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold text-primary"
            aria-label="Perfil"
          >
            {session.iniciais}
          </Link>
        </div>
        <AgencySwitcher />
      </header>

      <main className="flex-1 px-5 pb-32">
        <Outlet />
      </main>

      <nav className="fixed bottom-5 left-1/2 z-40 flex h-16 w-[calc(100%-2rem)] max-w-[448px] -translate-x-1/2 items-center justify-around rounded-full glass-panel-strong px-2">
        {navItems.map((item) => {
          const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to as never}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 py-1 transition-colors",
                active ? "text-primary" : "text-foreground/45",
              )}
            >
              <Icon className={cn("size-5", active && "drop-shadow-sm")} strokeWidth={active ? 2.4 : 1.8} />
              <span className="text-[9px] font-bold uppercase tracking-tighter">
                {item.label}
              </span>
              {active && <span className="absolute -bottom-1 size-1 rounded-full bg-primary" />}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}