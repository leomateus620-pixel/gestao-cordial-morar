import { useEffect, useState } from "react";
import { Link, Outlet, useRouter, useRouterState } from "@tanstack/react-router";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowUpRight, Heart, Menu, Phone, X, ChevronDown } from "lucide-react";
import type { SiteBootstrap } from "@/lib/cordial-site/contract";
import { searchSchema } from "@/lib/cordial-site/contract";
import { sitePath } from "@/lib/cordial-site/presentation";

import { getSiteBrand, type SiteBrand } from "@/lib/cordial-site/brand";
import { WhatsAppIcon, InstagramIcon } from "./SocialIcons";
import { SiteContext, SiteBrandContext, useSiteBrand } from "@/lib/cordial-site/context";
const destinationsFor = (name: string) => [
  [`Sobre a ${name}`, "/sobre"],
  ["Bairros", "/bairros"],
  ["Financiamento", "/financiamento"],
  ["Correspondente bancário", "/correspondente"],
  ["Notícias", "/noticias"],
  ["Pesquisa completa", "/buscar"],
];
export function SiteLink({
  to,
  children,
  ...rest
}: Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { to: string }) {
  const brand = useSiteBrand();
  const config = getSiteBrand(brand);
  const scoped =
    brand === "morar" && (to === "/site" || to.startsWith("/site/") || to.startsWith("/site?"))
      ? config.basePath + to.slice(5)
      : to;
  const { pathname: path, search: query, hash } = new URL(scoped, "https://cordial.invalid");
  const raw = Object.fromEntries(new URLSearchParams(query));
  const parsed = path.endsWith("/buscar") ? searchSchema.safeParse(raw) : null;
  const search = parsed?.success
    ? Object.fromEntries(
        Object.keys(raw).map((key) => [key, parsed.data[key as keyof typeof parsed.data]]),
      )
    : raw;
  return (
    <Link to={path} search={search} hash={hash.slice(1)} {...rest}>
      {children}
    </Link>
  );
}
export function SiteShell({ data, brand = "cordial" }: { data: SiteBootstrap; brand?: SiteBrand }) {
  const config = getSiteBrand(brand);
  const destinations = destinationsFor(config.shortName);
  const pathFor = (path = "") => sitePath(path, brand);
  const [open, setOpen] = useState(false);
  const path = useRouterState({ select: (s) => s.location.pathname });
  const router = useRouter();
  useEffect(() => {
    setOpen(false);
  }, [path]);
  useEffect(() => {
    // Refresh visible offers after withdrawal. The server and image endpoints always recheck eligibility.
    // Contact/CMS pages have no live offers; refreshing their parent can interrupt form input.
    const relative = path.slice(config.basePath.length);
    if (
      !["", "/", "/buscar", "/favoritos", "/bairros"].includes(relative) &&
      !relative.startsWith("/imovel/")
    )
      return;
    const refresh = () => {
      if (document.visibilityState === "visible") void router.invalidate();
    };
    const timer = window.setInterval(refresh, 45_000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [router, path, config.basePath]);
  useEffect(() => {
    const nodes = document.querySelectorAll(".cs-reveal");
    if (
      !("IntersectionObserver" in window) ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("cs-in-view");
            observer.unobserve(entry.target);
          }
        }),
      { threshold: 0.08 },
    );
    nodes.forEach((node) => {
      node.classList.add("cs-observed");
      observer.observe(node);
    });
    return () => observer.disconnect();
  }, [path]);
  const { settings } = data;
  return (
    <SiteBrandContext.Provider value={brand}>
      <SiteContext.Provider value={data}>
        <div className={config.themeClass}>
          <a className="cs-skip" href="#conteudo">
            Ir para o conteúdo
          </a>
          {!data.indexable && (
            <div className="cs-preview">{config.name} · Ambiente de homologação</div>
          )}
          <header className="cs-header">
            <div className="cs-container cs-header-inner">
              <SiteLink
                to={pathFor("/")}
                className="cs-brand"
                aria-label={`${config.name}, início`}
              >
                <img
                  src={config.logo}
                  width={config.logoWidth}
                  height={config.logoHeight}
                  alt={config.name}
                />
              </SiteLink>
              <nav className="cs-desktop-nav" aria-label="Navegação principal">
                <SiteLink to={pathFor("/buscar?finalidade=venda")}>Comprar</SiteLink>
                <SiteLink to={pathFor("/buscar?finalidade=aluguel")}>Alugar</SiteLink>
                <SiteLink to={pathFor("/anuncie")}>Anunciar meu imóvel</SiteLink>
                <details
                  className="cs-menu"
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.currentTarget.open = false;
                      e.currentTarget.querySelector("summary")?.focus();
                    }
                  }}
                >
                  <summary>
                    A {config.shortName} <ChevronDown size={14} />
                  </summary>
                  <div>
                    {destinations.map(([label, to]) => (
                      <SiteLink
                        key={to}
                        to={pathFor(to)}
                        onClick={(e) => {
                          const details = e.currentTarget.closest("details");
                          if (details) details.open = false;
                        }}
                      >
                        {label}
                      </SiteLink>
                    ))}
                  </div>
                </details>
                <SiteLink to={pathFor("/contato")}>Contato</SiteLink>
              </nav>
              <div className="cs-header-actions">
                <SiteLink
                  to={pathFor("/favoritos")}
                  className="cs-icon-button"
                  aria-label="Meus favoritos"
                >
                  <Heart size={20} />
                </SiteLink>
                <Dialog.Root open={open} onOpenChange={setOpen}>
                  <Dialog.Trigger
                    className="cs-icon-button cs-mobile-toggle"
                    aria-label="Abrir menu"
                  >
                    <Menu />
                  </Dialog.Trigger>
                  <Dialog.Portal>
                    <Dialog.Overlay className={`${config.themeClass} cs-dialog-overlay`} />
                    <Dialog.Content
                      className={`${config.themeClass} cs-drawer cs-navigation-drawer`}
                    >
                      <Dialog.Title>Encontre seu lugar</Dialog.Title>
                      <Dialog.Description>
                        Navegue pelo site da {config.shortName}.
                      </Dialog.Description>
                      <Dialog.Close
                        className="cs-icon-button cs-dialog-close"
                        aria-label="Fechar menu"
                      >
                        <X />
                      </Dialog.Close>
                      <nav aria-label="Menu móvel">
                        {[
                          ["Comprar", "/buscar?finalidade=venda"],
                          ["Alugar", "/buscar?finalidade=aluguel"],
                          ["Anunciar meu imóvel", "/anuncie"],
                          ...destinations,
                          ["Contato", "/contato"],
                          ["Favoritos", "/favoritos"],
                        ].map(([label, to]) => (
                          <SiteLink key={to} to={pathFor(to)} onClick={() => setOpen(false)}>
                            {label}
                            <ArrowUpRight size={18} />
                          </SiteLink>
                        ))}
                        {brand === "morar" && settings.whatsapp && (
                          <a
                            className="ms-nav-whatsapp"
                            href={`https://wa.me/${settings.whatsapp}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <WhatsAppIcon width={22} height={22} />
                            Conversar pelo WhatsApp
                            <ArrowUpRight size={18} />
                          </a>
                        )}
                      </nav>
                    </Dialog.Content>
                  </Dialog.Portal>
                </Dialog.Root>
              </div>
            </div>
          </header>
          <main id="conteudo" tabIndex={-1}>
            <Outlet />
          </main>
          <footer className="cs-footer">
            <div className="cs-container">
              <div className="cs-footer-grid">
                <div>
                  <img
                    src={config.logo}
                    width={config.logoWidth}
                    height={config.logoHeight}
                    alt={config.name}
                  />
                  <p>{settings.tagline}</p>
                  {settings.creci && <p>{settings.creci}</p>}
                </div>
                <div>
                  <h2>Seu próximo endereço</h2>
                  <SiteLink to={pathFor("/buscar?finalidade=venda")}>Imóveis para comprar</SiteLink>
                  <SiteLink to={pathFor("/buscar?finalidade=aluguel")}>
                    Imóveis para alugar
                  </SiteLink>
                  <SiteLink to={pathFor("/bairros")}>Encontre por bairro</SiteLink>
                  <SiteLink to={pathFor("/buscar")}>Pesquisa completa</SiteLink>
                </div>
                <div>
                  <h2>Conte com a {config.shortName}</h2>
                  <SiteLink to={pathFor("/anuncie")}>Anuncie seu imóvel</SiteLink>
                  {destinations
                    .filter((x) => !["/bairros", "/buscar"].includes(x[1]))
                    .map(([label, to]) => (
                      <SiteLink to={pathFor(to)} key={to}>
                        {label}
                      </SiteLink>
                    ))}
                </div>
                <div>
                  <h2>Vamos conversar</h2>
                  {settings.phone && (
                    <a href={`tel:${settings.phone.replace(/[^+\d]/g, "")}`}>
                      <Phone size={16} />
                      {settings.phone}
                    </a>
                  )}
                  {settings.email && <a href={`mailto:${settings.email}`}>{settings.email}</a>}
                  {settings.address && <p>{settings.address}</p>}
                  {settings.hours && <p>{settings.hours}</p>}
                  <SiteLink to={pathFor("/contato")}>
                    Entre em contato <ArrowUpRight size={16} />
                  </SiteLink>
                </div>
              </div>
              <div className="cs-footer-bottom">
                <span>
                  © {new Date().getFullYear()} {settings.brand}
                </span>
                <SiteLink to={pathFor("/privacidade")}>Privacidade</SiteLink>
                {settings.instagram && (
                  <a href={settings.instagram} target="_blank" rel="noopener noreferrer">
                    <InstagramIcon width={18} height={18} /> Instagram <ArrowUpRight size={14} />
                  </a>
                )}
              </div>
            </div>
          </footer>
          {settings.whatsapp && (
            <a
              className="cs-whatsapp"
              href={`https://wa.me/${settings.whatsapp}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Conversar com a ${config.shortName} no WhatsApp`}
            >
              <WhatsAppIcon width={23} height={23} />
              <span>Vamos conversar</span>
            </a>
          )}
        </div>
      </SiteContext.Provider>
    </SiteBrandContext.Provider>
  );
}
export function SiteError({ reset }: { reset?: () => void }) {
  const router = useRouter();
  return (
    <div className="cs-container cs-state" role="alert">
      <span className="cs-eyebrow">Vamos tentar novamente</span>
      <h1>Não foi possível carregar esta página.</h1>
      <p>
        O serviço está temporariamente indisponível. Seus filtros continuam no endereço da página.
      </p>
      <button
        className="cs-button"
        onClick={async () => {
          await router.invalidate();
          reset?.();
        }}
      >
        Tentar novamente
      </button>
    </div>
  );
}
export function SitePending() {
  return (
    <div className="cs-container cs-state" role="status">
      <div className="cs-loading-line" />
      <p>Preparando os imóveis para você…</p>
    </div>
  );
}
export function SiteNotFound() {
  const brand = useSiteBrand();
  const config = getSiteBrand(brand);
  return (
    <div className="cs-container cs-state">
      <p className="cs-eyebrow">Página não encontrada</p>
      <h1>Vamos encontrar um novo caminho.</h1>
      <p>Este endereço não existe no site da {config.shortName}.</p>
      <SiteLink className="cs-button" to={sitePath("/", brand)}>
        Voltar ao início
      </SiteLink>
    </div>
  );
}
