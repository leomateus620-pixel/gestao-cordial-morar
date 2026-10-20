import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  Outlet,
  RouterProvider,
  useRouterState,
} from "@tanstack/react-router";
import { Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { BrandMark } from "@/components/brand/BrandMark";
import { SidebarMenu } from "@/components/sidebar-menu";
import { moduleItems } from "@/components/shared/module-menu";
import { roleDefinitions, type UserProfile } from "@/lib/mock/permissions";
import { useRentalFormRequest } from "@/lib/rentals/rental-form-ui";
import { RentalFormModal } from "@/components/alugueis/RentalFormModal";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import "../../src/styles.css";

function Brand({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <>
      <div className="app-sidebar-brand-mark">
        <BrandMark className="size-6" />
      </div>
      <div className="app-sidebar-brand-copy" aria-hidden={collapsed}>
        <span className="app-sidebar-brand-eyebrow">Gestão Cordial</span>
        <p className="app-sidebar-brand-title">Sistema Imobiliário</p>
      </div>
    </>
  );
}

function Footer() {
  return (
    <div className="app-sidebar-footer">
      Cordial Imóveis <span className="app-sidebar-footer-dot">•</span> Morar Imóveis
    </div>
  );
}

function Preview() {
  const [profile, setProfile] = useState<UserProfile>("secretaria");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const modules = roleDefinitions[profile].modules;
  const current = moduleItems.find((item) => item.to === pathname);

  useEffect(() => setMobileOpen(false), [pathname]);

  return (
    <div
      className="app-shell-root min-h-dvh bg-background font-sans text-foreground"
      data-sidebar-state={collapsed ? "collapsed" : "expanded"}
      data-sidebar-ready="true"
    >
      <aside
        id="preview-sidebar"
        className="app-sidebar-shell sidebar-glass fixed z-40 hidden flex-col overflow-hidden lg:flex"
        aria-label="Navegação lateral"
      >
        <div className="app-sidebar-header" data-collapsed={collapsed ? "true" : "false"}>
          <Brand collapsed={collapsed} />
          <button
            className="app-sidebar-toggle"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "Expandir sidebar" : "Recolher sidebar"}
            aria-controls="preview-sidebar"
            aria-expanded={!collapsed}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-[15px]" />
            ) : (
              <PanelLeftClose className="size-[15px]" />
            )}
          </button>
        </div>
        <SidebarMenu allowedModules={modules} collapsed={collapsed} />
        {collapsed ? <div className="app-sidebar-footer">CI • MI</div> : <Footer />}
      </aside>
      <main className="app-shell-content min-h-dvh">
        <div className="mx-auto max-w-4xl p-5 sm:p-8">
          <div className="mb-10 flex flex-wrap items-center justify-between gap-4">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <button
                  className="grid size-11 place-items-center rounded-xl border lg:hidden"
                  aria-label="Abrir menu"
                >
                  <Menu className="size-5" />
                </button>
              </SheetTrigger>
              <SheetContent
                side="left"
                closeLabel="Fechar navegação"
                overlayClassName="!bg-[var(--app-sidebar-backdrop)]"
                className="app-sidebar-drawer sidebar-glass flex h-dvh !w-[min(82vw,var(--app-sidebar-mobile-width))] !max-w-none flex-col overflow-hidden lg:hidden"
              >
                <SheetHeader className="sr-only">
                  <SheetTitle>Navegação principal</SheetTitle>
                  <SheetDescription>Módulos permitidos para este perfil.</SheetDescription>
                </SheetHeader>
                <div className="app-sidebar-mobile-brand">
                  <Brand />
                </div>
                <SidebarMenu allowedModules={modules} onNavigate={() => setMobileOpen(false)} />
                <Footer />
              </SheetContent>
            </Sheet>
            <p className="text-xs font-semibold text-muted-foreground">
              Prévia visual · dados de demonstração
            </p>
            <label className="flex items-center gap-2 text-sm">
              Perfil
              <select
                className="max-w-48 rounded-lg border bg-card p-2"
                value={profile}
                onChange={(event) => setProfile(event.target.value as UserProfile)}
              >
                {Object.entries(roleDefinitions).map(([id, role]) => (
                  <option key={id} value={id}>
                    {role.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary">
            Gestão Cordial
          </p>
          <h1 className="font-display text-3xl font-semibold">{current?.label ?? "Painel"}</h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
            Use o menu para navegar entre os módulos e abrir o cadastro de contrato. Esta prévia
            verifica a navegação sem acessar dados reais.
          </p>
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function Rentals() {
  const [open, setOpen] = useState(false);
  const requested = useRentalFormRequest((state) => state.requested);
  useEffect(() => {
    if (!requested) return;
    useRentalFormRequest.getState().consume();
    setOpen(true);
  }, [requested]);
  return (
    <>
      <button
        className="mt-6 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
        onClick={() => setOpen(true)}
      >
        Novo aluguel
      </button>
      <RentalFormModal
        open={open}
        onOpenChange={setOpen}
        properties={[]}
        tenants={[]}
        onSubmit={async () => {
          throw new Error("Prévia visual: gravação indisponível.");
        }}
        isSaving={false}
      />
    </>
  );
}

const root = createRootRoute({ component: Preview });
const routes = moduleItems.map((item) =>
  createRoute({
    getParentRoute: () => root,
    path: item.to,
    component: item.to === "/alugueis" ? Rentals : () => null,
  }),
);
const router = createRouter({
  routeTree: root.addChildren(routes),
  history: createMemoryHistory({ initialEntries: ["/vistorias"] }),
});
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
