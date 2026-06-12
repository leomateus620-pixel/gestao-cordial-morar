import { Link, Outlet, useRouterState, useNavigate } from "@tanstack/react-router";
import { Building2, Menu } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MeshBackground } from "./mesh-background";
import { AgencySwitcher } from "./agency-switcher";
import { SidebarMenu } from "./sidebar-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useSession } from "@/lib/auth-mock";
import { cn } from "@/lib/utils";
import { NotificationBell } from "./notification-bell";
import { getVisibleModules, primaryModuleItems } from "./shared/module-menu";

export function AppShell() {
  const session = useSession();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (session === null) navigate({ to: "/login" });
  }, [session, navigate]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!session) return null;

  const bottomNav = getVisibleModules(session.modules, primaryModuleItems);

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-full flex-col overflow-x-hidden font-sans text-foreground">
      <MeshBackground />

      {/* Sidebar desktop */}
      <aside
        className={cn(
          "sidebar-glass fixed inset-y-4 left-4 z-40 hidden max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-[1.75rem] p-3 transition-[width] duration-300 ease-out lg:flex",
          sidebarCollapsed ? "w-20" : "w-64",
        )}
      >
        <div
          className={cn(
            "mb-4 flex items-center gap-3 px-1 pt-1",
            sidebarCollapsed && "justify-center",
          )}
        >
          <div className="relative grid size-11 shrink-0 place-items-center rounded-2xl bg-[linear-gradient(145deg,rgba(95,175,199,0.26),rgba(255,255,255,0.06))] text-cyan-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_14px_34px_-22px_rgba(95,175,199,0.9)] ring-1 ring-cyan-200/15">
            <Building2 className="size-5" />
            <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-cyan-300 shadow-[0_0_16px_rgba(103,232,249,0.75)]" />
          </div>
          {!sidebarCollapsed && (
            <div className="min-w-0">
              <span className="text-[9px] font-bold uppercase tracking-[0.26em] text-cyan-200/82">
                Gestão Cordial
              </span>
              <p className="truncate text-sm font-semibold leading-tight tracking-[-0.01em] text-white/90">
                Sistema Imobiliário
              </p>
            </div>
          )}
        </div>

        <SidebarMenu
          collapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
          showToggle
          tone="dark"
        />

        <div
          className={cn(
            "mt-3 border-t border-white/10 pt-3 text-[9px] font-semibold uppercase leading-relaxed tracking-[0.16em] text-white/35",
            sidebarCollapsed ? "text-center" : "px-1",
          )}
        >
          {sidebarCollapsed ? "CI + MI" : "Cordial Imóveis + Morar Imóveis"}
        </div>
      </aside>

      <div
        ref={mainRef}
        className={cn(
          "relative z-10 flex min-h-screen w-full flex-col transition-[padding] duration-300 ease-out",
          sidebarCollapsed ? "lg:pl-28" : "lg:pl-72",
        )}
      >
        {/* Header mobile — sticky com blur ao rolar */}
        <header
          className={cn(
            "sticky top-0 z-30 flex flex-col gap-2 px-4 pt-3 pb-2 transition-all duration-300 lg:hidden",
            scrolled
              ? "bg-background/80 shadow-sm shadow-foreground/5 backdrop-blur-xl backdrop-saturate-150"
              : "bg-transparent",
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
                Gestão Cordial
              </span>
              <h1 className="truncate text-base font-semibold tracking-tight leading-tight">
                Olá, {session.nome}
              </h1>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <SheetTrigger asChild>
                  <button
                    className={cn(
                      "grid size-9 place-items-center rounded-full text-primary transition-all",
                      scrolled ? "bg-white/70 shadow-sm" : "glass-panel",
                    )}
                    aria-label="Abrir módulos"
                    type="button"
                  >
                    <Menu className="size-5" />
                  </button>
                </SheetTrigger>
                <SheetContent
                  side="left"
                  className="sidebar-glass flex h-dvh w-[88vw] max-w-[340px] flex-col overflow-hidden border-white/10 bg-[#141a20] p-4 text-white backdrop-blur-2xl lg:hidden [&>button]:text-white/70 [&>button]:hover:text-white"
                >
                  <div className="mb-5 flex items-center gap-3 pr-8">
                    <div className="grid size-11 place-items-center rounded-2xl bg-cyan-300/16 text-cyan-100 ring-1 ring-cyan-200/15">
                      <Building2 className="size-5" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[9px] font-bold uppercase tracking-[0.26em] text-cyan-200/82">
                        Gestão Cordial
                      </span>
                      <p className="truncate text-sm font-semibold leading-tight text-white/90">
                        Sistema Imobiliário
                      </p>
                    </div>
                  </div>
                  <SidebarMenu onNavigate={() => setMobileMenuOpen(false)} tone="dark" />
                  <div className="mt-3 border-t border-white/10 px-1 pt-3 text-[9px] font-semibold uppercase tracking-[0.16em] text-white/35">
                    Cordial Imóveis + Morar Imóveis
                  </div>
                </SheetContent>
              </Sheet>
              <NotificationBell />
              <Link
                to="/mais"
                className={cn(
                  "grid size-9 place-items-center rounded-full text-xs font-bold text-primary transition-all",
                  scrolled ? "bg-white/70 shadow-sm" : "glass-panel",
                )}
                aria-label="Perfil"
              >
                {session.iniciais}
              </Link>
            </div>
          </div>
          <AgencySwitcher />
        </header>

        {/* Header desktop — sticky com blur ao rolar */}
        <header
          className={cn(
            "sticky top-0 z-30 hidden px-6 py-3 transition-all duration-300 lg:block",
            scrolled && "backdrop-blur-xl backdrop-saturate-150",
          )}
        >
          <div
            className={cn(
              "mx-auto flex max-w-screen-2xl items-center justify-between gap-4 rounded-[1.75rem] border px-4 py-2.5 transition-all duration-300",
              scrolled
                ? "border-white/60 bg-white/75 shadow-lg shadow-foreground/8 backdrop-blur-xl"
                : "glass-panel-strong border-white/50 shadow-xl shadow-primary/5",
            )}
          >
            <div className="min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-primary/80">
                Bem-vindo de volta
              </span>
              <h1 className="truncate text-base font-semibold tracking-tight leading-tight">
                Olá, {session.nome}
              </h1>
            </div>

            <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
              <div className="w-full max-w-xs">
                <AgencySwitcher />
              </div>
              <NotificationBell />
              <Link
                to="/mais"
                className="glass-panel flex shrink-0 items-center gap-2.5 rounded-full py-1.5 pr-4 pl-1.5 text-sm font-semibold text-primary transition-all hover:scale-[1.02] hover:bg-white/70"
                aria-label="Perfil do usuário"
              >
                <span className="grid size-8 place-items-center rounded-full bg-primary/15 text-xs font-bold">
                  {session.iniciais}
                </span>
                <span className="hidden text-left xl:block">
                  <span className="block text-sm leading-tight text-foreground">
                    {session.nome}
                  </span>
                  <span className="block text-[11px] leading-tight text-foreground/50">
                    {session.cargo}
                  </span>
                </span>
              </Link>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-full min-w-0 flex-1 overflow-x-hidden px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] lg:max-w-screen-2xl lg:px-8 lg:pt-2 lg:pb-10 xl:px-10">
          <Outlet />
        </main>
      </div>

      {/* Bottom nav mobile */}
      <nav
        className="bottom-nav-glass fixed left-1/2 z-40 flex h-16 w-[calc(100vw-1.5rem)] max-w-[26rem] -translate-x-1/2 items-center justify-around rounded-full px-2 lg:hidden"
        style={{ bottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        {bottomNav.map((item) => {
          const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to as never}
              className={cn(
                "relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 py-1 transition-colors",
                active ? "text-primary" : "text-foreground/45",
              )}
            >
              <Icon
                className={cn("size-5", active && "drop-shadow-sm")}
                strokeWidth={active ? 2.4 : 1.8}
              />
              <span className="max-w-full truncate text-[9px] font-bold uppercase tracking-tighter">
                {item.shortLabel ?? item.label}
              </span>
              {active && <span className="absolute -bottom-1 size-1 rounded-full bg-primary" />}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
