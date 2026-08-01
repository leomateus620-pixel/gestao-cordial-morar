import { Link, Outlet, useRouterState, useNavigate } from "@tanstack/react-router";
import { Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { BrandMark } from "./brand/BrandMark";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MeshBackground } from "./mesh-background";
import { AgencySwitcher } from "./agency-switcher";
import { SidebarMenu } from "./sidebar-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useAuthReady, useHasAuthSession, useSession } from "@/lib/auth-mock";
import { cn } from "@/lib/utils";
import { NotificationBell } from "./notification-bell";
import { getPrimaryItemsForProfile, isModuleItemActive } from "./shared/module-menu";
import { useHydrateCorretores } from "@/hooks/useHydrateCorretores";
import { NotificationCenter } from "./notifications/NotificationCenter";
import { NotificationTransientRegion } from "./notifications/NotificationTransientRegion";
import {
  parseSidebarPreference,
  serializeSidebarPreference,
  SIDEBAR_PREFERENCE_KEY,
} from "@/lib/sidebar-preference";

export function AppShell() {
  useHydrateCorretores();
  const session = useSession();
  const authReady = useAuthReady();
  const hasAuthSession = useHasAuthSession();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarPreferenceReady, setSidebarPreferenceReady] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);
  const sessionModules = useMemo(
    () => (session ? Array.from(new Set(session.modules)) : []),
    [session],
  );

  useEffect(() => {
    let readyFrame = 0;
    try {
      setSidebarCollapsed(
        parseSidebarPreference(window.localStorage.getItem(SIDEBAR_PREFERENCE_KEY)),
      );
    } catch {
      // A preferência é progressiva; a navegação segue expandida se o storage estiver indisponível.
    } finally {
      readyFrame = window.requestAnimationFrame(() => setSidebarPreferenceReady(true));
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key === SIDEBAR_PREFERENCE_KEY) {
        setSidebarCollapsed(parseSidebarPreference(event.newValue));
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => {
      window.cancelAnimationFrame(readyFrame);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const handleSidebarCollapsedChange = useCallback((nextCollapsed: boolean) => {
    setSidebarCollapsed(nextCollapsed);
    try {
      window.localStorage.setItem(
        SIDEBAR_PREFERENCE_KEY,
        serializeSidebarPreference(nextCollapsed),
      );
    } catch {
      // Mantém o estado da sessão mesmo em navegadores com storage bloqueado.
    }
  }, []);

  useEffect(() => {
    // Only redirect when Supabase itself confirms there is no session.
    // A missing profile row (transient DB error) must not log the user out.
    if (authReady && !hasAuthSession) navigate({ to: "/login" });
  }, [authReady, hasAuthSession, navigate]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    let ticking = false;
    let lastValue = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const next = window.scrollY > 12;
        if (next !== lastValue) {
          lastValue = next;
          setScrolled(next);
        }
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const bottomNav = useMemo(
    () => (session ? getPrimaryItemsForProfile(session.perfil, sessionModules) : []),
    [session, sessionModules],
  );

  if (!session) return null;

  return (
    <div
      className="app-shell-root relative mx-auto flex min-h-dvh w-full max-w-full flex-col overflow-x-hidden font-sans text-foreground"
      data-sidebar-state={sidebarCollapsed ? "collapsed" : "expanded"}
      data-sidebar-ready={sidebarPreferenceReady ? "true" : "false"}
    >
      <MeshBackground />

      {/* Sidebar desktop */}
      <aside
        id="app-primary-sidebar"
        className="app-sidebar-shell sidebar-glass fixed z-40 hidden flex-col overflow-hidden rounded-[1.35rem] p-2 lg:flex"
        aria-label="Navegação lateral"
      >
        <div
          className={cn(
            "relative mb-2 flex shrink-0 items-center px-1 py-0.5",
            sidebarCollapsed ? "flex-col gap-1.5" : "gap-2",
          )}
        >
          <div className="relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-xl border border-[#b9dad3]/14 bg-[#bfded7]/8 shadow-[inset_0_1px_0_rgba(225,242,238,0.09)]">
            <BrandMark className="size-6" />
          </div>
          <div
            className={cn(
              "app-sidebar-brand-copy min-w-0 flex-1",
              sidebarCollapsed && "pointer-events-none absolute opacity-0",
            )}
            aria-hidden={sidebarCollapsed}
          >
            <span className="block truncate text-[8px] font-bold uppercase leading-3 tracking-[0.2em] text-[#9ad3c8]">
              Gestão Cordial
            </span>
            <p className="truncate text-[12px] font-semibold leading-4 tracking-[-0.01em] text-[#e8f0ee]">
              Sistema Imobiliário
            </p>
          </div>
          <button
            type="button"
            className="grid size-8 shrink-0 place-items-center rounded-[0.65rem] border border-[#c9ddd8]/10 bg-[#d3e4e0]/5 text-[#b8c8c5] outline-none transition-[background-color,border-color,color,transform] duration-150 hover:border-[#9ed5c9]/22 hover:bg-[#9ed5c9]/10 hover:text-[#e9f4f1] focus-visible:ring-2 focus-visible:ring-[#9bd9cd] focus-visible:ring-offset-1 focus-visible:ring-offset-[#2a373d] active:scale-95 motion-reduce:transform-none motion-reduce:transition-none"
            onClick={() => handleSidebarCollapsedChange(!sidebarCollapsed)}
            aria-label={sidebarCollapsed ? "Expandir sidebar" : "Recolher sidebar"}
            aria-controls="app-primary-sidebar"
            aria-expanded={!sidebarCollapsed}
            title={sidebarCollapsed ? "Expandir sidebar" : "Recolher sidebar"}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="size-[15px]" />
            ) : (
              <PanelLeftClose className="size-[15px]" />
            )}
          </button>
        </div>

        <SidebarMenu allowedModules={sessionModules} collapsed={sidebarCollapsed} />

        <div
          className={cn(
            "mt-2 shrink-0 border-t border-[#c8d8d4]/10 pt-2 text-[8px] font-semibold uppercase leading-3 tracking-[0.12em] text-[#91a29f]",
            sidebarCollapsed ? "text-center" : "px-1.5",
          )}
        >
          {sidebarCollapsed ? "CI · MI" : "Cordial Imóveis · Morar Imóveis"}
        </div>
      </aside>

      <div
        ref={mainRef}
        className="app-shell-content relative z-10 flex min-h-screen w-full flex-col"
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
                      "grid size-9 place-items-center rounded-full text-primary outline-none transition-[background-color,box-shadow,transform] duration-150 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:scale-95 motion-reduce:transform-none motion-reduce:transition-none",
                      scrolled ? "bg-white/70 shadow-sm" : "glass-panel",
                    )}
                    aria-label="Abrir navegação principal"
                    aria-haspopup="dialog"
                    aria-expanded={mobileMenuOpen}
                    type="button"
                  >
                    <Menu className="size-5" />
                  </button>
                </SheetTrigger>
                <SheetContent
                  side="left"
                  closeLabel="Fechar navegação"
                  overlayClassName="bg-[#152229]/55"
                  className="app-sidebar-drawer sidebar-glass flex h-dvh !w-[min(82vw,var(--app-sidebar-mobile-width))] !max-w-none flex-col overflow-hidden border-[#bed6d1]/14 px-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 text-[#edf5f3] lg:hidden [&>button]:right-2 [&>button]:top-2 [&>button]:text-[#b9c9c6] [&>button]:hover:bg-[#c7ddd8]/9 [&>button]:hover:text-[#edf5f3] [&>button]:focus-visible:ring-[#9bd9cd]"
                >
                  <SheetHeader className="sr-only">
                    <SheetTitle>Navegação principal</SheetTitle>
                    <SheetDescription>
                      Acesse os módulos permitidos para o seu perfil.
                    </SheetDescription>
                  </SheetHeader>
                  <div className="mb-3 flex shrink-0 items-center gap-2 px-1 pr-11">
                    <div className="grid size-9 place-items-center overflow-hidden rounded-xl border border-[#b9dad3]/14 bg-[#bfded7]/8 shadow-[inset_0_1px_0_rgba(225,242,238,0.09)]">
                      <BrandMark className="size-6" />
                    </div>
                    <div className="min-w-0">
                      <span className="block truncate text-[8px] font-bold uppercase leading-3 tracking-[0.2em] text-[#9ad3c8]">
                        Gestão Cordial
                      </span>
                      <p className="truncate text-[12px] font-semibold leading-4 tracking-[-0.01em] text-[#e8f0ee]">
                        Sistema Imobiliário
                      </p>
                    </div>
                  </div>
                  <SidebarMenu
                    allowedModules={sessionModules}
                    onNavigate={() => setMobileMenuOpen(false)}
                  />
                  <div className="mt-2 shrink-0 border-t border-[#c8d8d4]/10 px-1.5 pt-2 text-[8px] font-semibold uppercase leading-3 tracking-[0.12em] text-[#91a29f]">
                    Cordial Imóveis · Morar Imóveis
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
          <NotificationTransientRegion />
          <Outlet />
        </main>
      </div>

      {/* Bottom nav mobile */}
      <nav
        className="bottom-nav-glass fixed left-1/2 z-40 flex h-16 w-[calc(100vw-1.5rem)] max-w-[26rem] -translate-x-1/2 items-center justify-around rounded-full px-2 lg:hidden"
        style={{ bottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
        aria-label="Navegação rápida"
      >
        {bottomNav.map((item) => {
          const active = isModuleItemActive(pathname, item);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to as never}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl py-1 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1",
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
      <NotificationCenter />
    </div>
  );
}
