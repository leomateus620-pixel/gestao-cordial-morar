import type React from "react";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Bath,
  BedDouble,
  CarFront,
  HousePlus,
  Landmark,
  MapPin,
  Ruler,
  Search,
  X,
} from "lucide-react";
import { Await } from "@tanstack/react-router";
import type { PublicProperty } from "@/lib/cordial-site/contract";
import { areaLabel, priceLabel, propertyPath, sitePath } from "@/lib/cordial-site/presentation";
import { SiteLink } from "./SiteShell";
import { useSite, useSiteBrand } from "@/lib/cordial-site/context";
import { FavoriteButton, PropertyImage } from "./PropertyCard";
import { SearchForm } from "./SearchForm";
import { useCardPhotos } from "./useCardPhotos";
import { CardPhotoControls } from "./CardPhotoControls";
import { RecentProperties } from "./RecentProperties";
import { propertyUrl, propertyWhatsapp } from "@/lib/cordial-site/experience";
import { WhatsAppIcon } from "./SocialIcons";

export type HomeData = {
  featured: PublicProperty[];
  more: PublicProperty[];
  hero: PublicProperty | null;
  total: number;
  /** Imagem da semana aprovada (edição por IA) e ponto de foco; null usa a foto original. */
  heroImage?: { url: string | null; focalX: number; focalY: number } | null;
};

const HOME_COPY = {
  cordial: {
    lead: "Sentir-se em casa.",
    accent: "Esse é o nosso compromisso com você.",
    sub: "Comprar ou alugar começa com o que importa para você.",
    about: "Conte com a Cordial.",
    aboutText:
      "Cada mudança começa com uma escolha. Nossa equipe acompanha você para comprar, alugar ou anunciar seu imóvel.",
  },
  morar: {
    lead: "O seu próximo lar.",
    accent: "Mais perto de você.",
    sub: "Comprar ou alugar, com uma equipe por perto.",
    about: "Conte com a Morar.",
    aboutText:
      "Conte para a nossa equipe o que você procura. Juntos, encontramos caminhos para comprar, alugar ou anunciar seu imóvel.",
  },
} as const;

const opLabel = (p: PublicProperty) => (p.operation === "venda" ? "Venda" : "Aluguel");
const place = (p: PublicProperty) => [p.district, p.city].filter(Boolean).join(" · ");
const mainArea = (p: PublicProperty) =>
  p.areas.construida ?? p.areas.util ?? p.areas.total ?? p.areas.terreno ?? null;

function Attributes({ p, max = 3 }: { p: PublicProperty; max?: number }) {
  const items = [
    p.bedrooms ? { icon: BedDouble, text: `${p.bedrooms} dorm.` } : null,
    p.bathrooms ? { icon: Bath, text: `${p.bathrooms} banh.` } : null,
    p.parking ? { icon: CarFront, text: `${p.parking} vaga${p.parking > 1 ? "s" : ""}` } : null,
    mainArea(p) ? { icon: Ruler, text: areaLabel(mainArea(p)!) } : null,
  ]
    .filter(Boolean)
    .slice(0, max) as Array<{ icon: typeof Bath; text: string }>;
  if (!items.length) return null;
  return (
    <ul className="cs-hx-attrs">
      {items.map((i) => (
        <li key={i.text}>
          <i.icon size={14} strokeWidth={1.7} aria-hidden />
          {i.text}
        </li>
      ))}
    </ul>
  );
}

/** Card compacto da home: foto + dados essenciais, uma ação principal e favorito. */
function HomeCard({
  p,
  variant,
  sizes,
}: {
  p: PublicProperty;
  variant: "lg" | "sm" | "compact";
  sizes: string;
}) {
  const brand = useSiteBrand();
  const title = `${p.type ?? "Imóvel"}${p.district ? ` no ${p.district}` : ""}`;
  const photoRoot = useRef<HTMLDivElement | null>(null);
  const photos = useCardPhotos(p, brand, photoRoot, sizes);
  return (
    <article className={`cs-hx-card cs-hx-card-${variant}`}>
      <div className="cs-hx-card-media" ref={photoRoot} {...photos.swipeHandlers}>
        <SiteLink
          to={propertyPath(p, brand)}
          className="cs-hx-card-media-link"
          aria-label={title}
          tabIndex={-1}
        >
          <PropertyImage media={photos.media} alt={title} sizes={sizes} />
          <span className="cs-hx-badge">{opLabel(p)}</span>
        </SiteLink>
        {photos.enabled && (
          <CardPhotoControls
            reference={p.reference}
            index={photos.index}
            count={photos.galleryState === "ready" ? photos.images.length : p.photoCount}
            switching={photos.switching}
            failed={photos.failed}
            onMove={(d) => void photos.move(d)}
            onPrepare={() => photos.prepare(true)}
          />
        )}
      </div>
      <div className="cs-hx-fav">
        <FavoriteButton id={p.id} />
      </div>
      <div className="cs-hx-card-body">
        <strong className="cs-hx-price">{priceLabel(p)}</strong>
        <h3>
          <SiteLink to={propertyPath(p, brand)}>{p.type ?? "Imóvel"}</SiteLink>
        </h3>
        <p className="cs-hx-place">
          <MapPin size={13} aria-hidden /> {place(p) || "Localização sob consulta"}
        </p>
        <Attributes p={p} max={variant === "sm" ? 2 : 3} />
        {variant === "compact" && <small className="cs-hx-ref">Ref. {p.reference}</small>}
      </div>
    </article>
  );
}

function HeroImage({ hero, image }: { hero: PublicProperty; image?: HomeData["heroImage"] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const save = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
      ?.saveData;
    if (reduce || save) return;
    let visible = false;
    let frame = 0;
    let tx = 0,
      ty = 0,
      mx = 0,
      my = 0;
    const apply = () => {
      frame = 0;
      const r = el.getBoundingClientRect();
      const scrollShift = Math.max(-1, Math.min(1, -r.top / Math.max(1, r.height))) * 28;
      tx += (mx * 14 - tx) * 0.12;
      ty += (my * 10 + scrollShift - ty) * 0.12;
      el.style.setProperty("--cs-hx-px", `${tx.toFixed(2)}px`);
      el.style.setProperty("--cs-hx-py", `${ty.toFixed(2)}px`);
      if (visible && (Math.abs(mx * 14 - tx) > 0.2 || Math.abs(my * 10 + scrollShift - ty) > 0.2))
        frame = requestAnimationFrame(apply);
    };
    const kick = () => {
      if (visible && !frame) frame = requestAnimationFrame(apply);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      mx = e.clientX / innerWidth - 0.5;
      my = e.clientY / innerHeight - 0.5;
      kick();
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting && !document.hidden;
      el.classList.toggle("is-moving", visible);
      kick();
    });
    io.observe(el);
    addEventListener("pointermove", onMove, { passive: true });
    addEventListener("scroll", kick, { passive: true });
    const vis = () => {
      if (document.hidden) el.classList.remove("is-moving");
    };
    document.addEventListener("visibilitychange", vis);
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
      removeEventListener("pointermove", onMove);
      removeEventListener("scroll", kick);
      document.removeEventListener("visibilitychange", vis);
    };
  }, []);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return (
    <div
      className="cs-hx-hero-media"
      ref={ref}
      aria-hidden
      style={
        image
          ? ({
              "--cs-hx-focal": `${Math.round(image.focalX * 100)}% ${Math.round(image.focalY * 100)}%`,
            } as React.CSSProperties)
          : undefined
      }
    >
      <div className="cs-hx-hero-layer">
        {image?.url && failedUrl !== image.url ? (
          // Edited derivative failed → fall back once to the authorized original of the same property.
          <img
            src={image.url}
            alt=""
            width={1536}
            height={1024}
            fetchPriority="high"
            decoding="async"
            className="cs-hx-showcase-img"
            onError={() => setFailedUrl(image.url)}
          />
        ) : (
          <PropertyImage media={hero.cover} alt="" priority size="full" sizes="100vw" />
        )}
      </div>
      <span className="cs-hx-hero-light" />
    </div>
  );
}

function HeroCard({ hero }: { hero: PublicProperty }) {
  const brand = useSiteBrand();
  const site = useSite();
  const [origin, setOrigin] = useState(site.canonicalOrigin ?? "");
  useEffect(() => setOrigin(site.canonicalOrigin ?? location.origin), [site.canonicalOrigin]);
  const whatsapp = propertyWhatsapp(hero, site.settings.whatsapp, propertyUrl(hero, origin, brand));
  return (
    <aside className="cs-hx-hero-card" aria-label="Imóvel da semana">
      <p className="cs-hx-kicker">Imóvel da semana</p>
      <h2>{hero.type ?? "Imóvel"}</h2>
      <p className="cs-hx-place">
        <MapPin size={14} aria-hidden /> {place(hero)}
      </p>
      <strong className="cs-hx-price">{priceLabel(hero)}</strong>
      <Attributes p={hero} />
      <div className="cs-hx-hero-actions">
        <SiteLink to={propertyPath(hero, brand)} className="cs-button cs-hx-primary">
          <span className="cs-hx-long">Conhecer este imóvel</span>
          <span className="cs-hx-short">Ver detalhes</span> <ArrowUpRight size={17} />
        </SiteLink>
        {whatsapp && (
          <a
            className="cs-hx-wa"
            href={whatsapp}
            target="_blank"
            rel="noreferrer"
            aria-label="Conversar no WhatsApp sobre este imóvel"
          >
            <WhatsAppIcon /> WhatsApp
          </a>
        )}
      </div>
    </aside>
  );
}

function DistrictsBody({ idPrefix }: { idPrefix: string }) {
  const brand = useSiteBrand();
  const { facets } = useSite();
  const cities = useMemo(
    () =>
      [...new Set(facets.districts.map((d) => d.city))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [facets.districts],
  );
  const [city, setCity] = useState("");
  const [q, setQ] = useState("");
  const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const list = facets.districts
    .filter((d) => (!city || d.city === city) && (!q || norm(d.value).includes(norm(q))))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, "pt-BR"))
    .slice(0, idPrefix === "drawer" ? 30 : 6);
  return (
    <>
      {cities.length > 1 && (
        <label className="cs-hx-field">
          <span>Cidade</span>
          <select value={city} onChange={(e) => setCity(e.target.value)}>
            <option value="">Todas</option>
            {cities.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      )}
      <label className="cs-hx-field">
        <span>Buscar bairro</span>
        <span className="cs-hx-input">
          <Search size={15} aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ex.: Centro"
            data-autofocus={idPrefix === "drawer" ? "" : undefined}
          />
        </span>
      </label>
      <ul>
        {list.map((d) => (
          <li key={`${d.city}:${d.value}`}>
            <SiteLink
              to={sitePath(
                `/buscar?${new URLSearchParams({ cidade: d.city, bairro: d.value })}`,
                brand,
              )}
            >
              <span>
                <b>{d.value}</b>
                {!city && cities.length > 1 && <small>{d.city}</small>}
              </span>
              <em
                aria-label={`${d.count} ${d.count === 1 ? "imóvel publicado" : "imóveis publicados"}`}
              >
                {d.count}
              </em>
            </SiteLink>
          </li>
        ))}
        {!list.length && <li className="cs-hx-note">Nenhum bairro encontrado.</li>}
      </ul>
      <SiteLink to={sitePath("/bairros", brand)} className="cs-text-link">
        Ver todos <ArrowUpRight size={16} />
      </SiteLink>
    </>
  );
}

function DistrictsPanel() {
  return (
    <aside className="cs-hx-districts" aria-labelledby="cs-hx-districts-title">
      <h2 id="cs-hx-districts-title">Bairros</h2>
      <DistrictsBody idPrefix="panel" />
    </aside>
  );
}

/** Compact access for phones/narrow tablets: native modal dialog (focus containment + Escape). */
function DistrictsDrawer() {
  const ref = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const show = () => {
    setOpen(true);
    requestAnimationFrame(() => {
      ref.current?.showModal();
      ref.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    });
  };
  const close = () => ref.current?.close();
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="cs-hx-districts-trigger"
        aria-haspopup="dialog"
        onClick={show}
      >
        <MapPin size={16} aria-hidden /> Buscar por bairro
      </button>
      <dialog
        ref={ref}
        className="cs-hx-drawer"
        aria-labelledby="cs-hx-drawer-title"
        onClose={() => {
          setOpen(false);
          trigger.current?.focus();
        }}
        onClick={(e) => {
          if (e.target === ref.current) close();
        }}
      >
        <div className="cs-hx-drawer-head">
          <h2 id="cs-hx-drawer-title">Buscar por bairro</h2>
          <button type="button" className="cs-icon-button" onClick={close} aria-label="Fechar">
            <X size={20} aria-hidden />
          </button>
        </div>
        {open && (
          <div className="cs-hx-districts cs-hx-drawer-body">
            <DistrictsBody idPrefix="drawer" />
          </div>
        )}
      </dialog>
    </>
  );
}

/** The search stays mounted while the shared home promise streams photos and offers. */
export function MorarHomeHero({ home }: { home: Promise<HomeData | null> }) {
  const copy = HOME_COPY.morar;
  return (
    <section className="cs-hx-hero">
      <Suspense fallback={null}>
        <Await promise={home}>
          {(data) => (data?.hero ? <HeroImage hero={data.hero} image={data.heroImage} /> : null)}
        </Await>
      </Suspense>
      <div className="cs-container cs-hx-hero-grid">
        <div className="cs-hx-hero-copy">
          <h1>
            {copy.lead} <em>{copy.accent}</em>
          </h1>
          <p>
            <span className="cs-hx-long">{copy.sub}</span>
            <span className="cs-hx-short">Comprar ou alugar, perto de você.</span>
          </p>
          <div className="cs-hx-search">
            <SearchForm compact initial={{ finalidade: "venda" }} />
          </div>
        </div>
        <Suspense fallback={null}>
          <Await promise={home}>
            {(data) => (data?.hero ? <HeroCard hero={data.hero} /> : null)}
          </Await>
        </Suspense>
      </div>
    </section>
  );
}

export function HomePage({ home }: { home: Promise<HomeData | null> }) {
  const { settings, available } = useSite();
  const brand = useSiteBrand();
  const copy = HOME_COPY[brand];
  return (
    <>
      {brand === "morar" && <MorarHomeHero home={home} />}
      <Await
        promise={home}
        fallback={
          brand === "morar" ? (
            <p className="cs-container cs-home-loading" role="status">
              Carregando os imóveis…
            </p>
          ) : (
            <HomeSkeleton />
          )
        }
      >
        {(data) => (
          <>
            {brand === "cordial" && (
              <section className={`cs-hx-hero ${data?.hero ? "" : "is-neutral"}`}>
                {data?.hero && <HeroImage hero={data.hero} image={data.heroImage} />}
                <div className="cs-container cs-hx-hero-grid">
                  <div className="cs-hx-hero-copy">
                    <h1>
                      {copy.lead} <em>{copy.accent}</em>
                    </h1>
                    <p>
                      <span className="cs-hx-long">{copy.sub}</span>
                      <span className="cs-hx-short">Comprar ou alugar, do seu jeito.</span>
                    </p>
                    <div className="cs-hx-search">
                      <SearchForm compact initial={{ finalidade: "venda" }} />
                    </div>
                  </div>
                  {data?.hero && <HeroCard hero={data.hero} />}
                </div>
              </section>
            )}

            <section className="cs-container cs-hx-featured" aria-labelledby="cs-hx-featured-title">
              <div className="cs-hx-heading">
                <h2 id="cs-hx-featured-title">Imóveis em destaque</h2>
                <DistrictsDrawer />
                <SiteLink className="cs-text-link" to={sitePath("/buscar", brand)}>
                  Explorar imóveis <ArrowUpRight size={18} />
                </SiteLink>
              </div>
              <div className="cs-hx-featured-layout">
                {!available || !data ? (
                  <div className="cs-inline-state" role="status">
                    <h3>Não foi possível atualizar os destaques.</h3>
                    <button className="cs-button cs-button-light" onClick={() => location.reload()}>
                      Tentar novamente
                    </button>
                  </div>
                ) : data.featured.length ? (
                  <div className={`cs-hx-mosaic is-count-${data.featured.length}`}>
                    {data.featured.map((p, i) => (
                      <HomeCard
                        key={p.id}
                        p={p}
                        variant={i === 0 ? "lg" : "sm"}
                        sizes={
                          i === 0
                            ? "(max-width: 560px) 45vw, (max-width: 1100px) 100vw, 40vw"
                            : "(max-width: 1100px) 50vw, 20vw"
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <div className="cs-inline-state">
                    <h3>Encontre seu imóvel na busca.</h3>
                    <SiteLink className="cs-button cs-button-light" to={sitePath("/buscar", brand)}>
                      Buscar imóveis <ArrowRight size={17} />
                    </SiteLink>
                  </div>
                )}
                <DistrictsPanel />
              </div>
            </section>

            {!!data?.more.length && (
              <section className="cs-container cs-hx-more" aria-labelledby="cs-hx-more-title">
                <div className="cs-hx-heading">
                  <h2 id="cs-hx-more-title">Mais imóveis para você</h2>
                </div>
                <div className="cs-hx-more-grid">
                  {data.more.map((p) => (
                    <HomeCard
                      key={p.id}
                      p={p}
                      variant="compact"
                      sizes="(max-width: 340px) 40vw, (max-width: 560px) 50vw, (max-width: 900px) 33vw, (max-width: 1200px) 25vw, 20vw"
                    />
                  ))}
                </div>
                <div className="cs-hx-more-footer">
                  <SiteLink className="cs-button cs-button-light" to={sitePath("/buscar", brand)}>
                    Ver todos os imóveis <ArrowRight size={17} />
                  </SiteLink>
                </div>
              </section>
            )}
          </>
        )}
      </Await>
      <section className="cs-about-band">
        <div className="cs-container cs-about-layout">
          <div>
            <p className="cs-eyebrow">Muito além de um endereço</p>
            <h2>{copy.about}</h2>
          </div>
          <div>
            <p>{settings.about || copy.aboutText}</p>
            <SiteLink to={sitePath("/sobre", brand)} className="cs-text-link">
              Conheça nossa história <ArrowUpRight size={19} />
            </SiteLink>
          </div>
        </div>
      </section>
      <section className="cs-container cs-section cs-home-services">
        <div className="cs-services">
          {[
            {
              icon: HousePlus,
              title: "Quer vender ou alugar?",
              text: "Apresente seu imóvel à nossa equipe.",
              to: "/anuncie",
              cta: "Anunciar meu imóvel",
            },
            {
              icon: Landmark,
              title: "Planeje sua compra",
              text: "Conheça os caminhos para financiar seu imóvel.",
              to: "/financiamento",
              cta: "Ver financiamento",
            },
          ].map((s) => (
            <article key={s.to}>
              <s.icon size={27} strokeWidth={1.5} />
              <h3>{s.title}</h3>
              <p>{s.text}</p>
              <SiteLink to={sitePath(s.to, brand)}>
                {s.cta}
                <ArrowUpRight size={18} />
              </SiteLink>
            </article>
          ))}
        </div>
      </section>
      <RecentProperties />
      <section className="cs-contact-band">
        <div className="cs-container">
          <div>
            <p className="cs-eyebrow">Conversa de gente para gente</p>
            <h2>Vamos encontrar seu lugar?</h2>
          </div>
          <SiteLink className="cs-button cs-button-white" to={sitePath("/contato", brand)}>
            Falar com a equipe <ArrowUpRight size={19} />
          </SiteLink>
        </div>
      </section>
    </>
  );
}

function HomeSkeleton() {
  const copy = HOME_COPY[useSiteBrand()];
  return (
    <section className="cs-hx-hero is-neutral" role="status" aria-label="Carregando imóveis">
      <div className="cs-container cs-hx-hero-grid">
        <div className="cs-hx-hero-copy">
          <h1>
            {copy.lead} <em>{copy.accent}</em>
          </h1>
          <div className="cs-hx-search">
            <SearchForm compact initial={{ finalidade: "venda" }} />
          </div>
        </div>
      </div>
    </section>
  );
}
