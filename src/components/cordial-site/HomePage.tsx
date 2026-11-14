import { HomeExtras } from "./HomeExtras";
import type React from "react";
import {
  Suspense,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import type { SiteBrand } from "@/lib/cordial-site/brand";
import type { PublicProperty } from "@/lib/cordial-site/contract";
import type { HomeData, HomeHeroData } from "@/lib/cordial-site/home-loader";
import { cardSrcSet, resetSpeculativeScope } from "@/lib/cordial-site/card-photo-preload";
import {
  areaLabel,
  mediaPath,
  priceLabel,
  propertyPath,
  sitePath,
} from "@/lib/cordial-site/presentation";
import { SiteLink } from "./SiteShell";
import { useSite, useSiteBrand } from "@/lib/cordial-site/context";
import { FavoriteButton, PropertyImage } from "./PropertyCard";
import { SearchForm } from "./SearchForm";
import { useCardPhotos } from "./useCardPhotos";
import { CardPhotoControls } from "./CardPhotoControls";
import { RecentProperties } from "./RecentProperties";
import { propertyUrl, propertyWhatsapp } from "@/lib/cordial-site/experience";
import { WhatsAppIcon } from "./SocialIcons";

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

type HomeCardVariant = "lg" | "sm" | "compact";

/** Mirrors the home grid, including the split first card and 116px images on narrow screens. */
function homeCardSizes(brand: SiteBrand, variant: HomeCardVariant, count: number) {
  const mobileGutter = brand === "cordial" ? 36 : 40;
  const tabletGutter = brand === "cordial" ? 36 : 64;
  const desktopContainer = "min(1280px, 100vw - 96px)";

  if (variant === "compact")
    return [
      "(max-width: 341px) 116px",
      `(max-width: 560px) calc((100vw - ${mobileGutter + 10}px) / 2 - 2px)`,
      `(max-width: 640px) calc((100vw - ${mobileGutter + 24}px) / 3 - 2px)`,
      ...(brand === "cordial" ? ["(max-width: 768px) calc((100vw - 60px) / 3 - 2px)"] : []),
      "(max-width: 900px) calc((100vw - 88px) / 3 - 2px)",
      `(max-width: 1100px) calc((100vw - ${brand === "cordial" ? 106 : 100}px) / 4 - 2px)`,
      "(max-width: 1120px) calc((100vw - 106px) / 4 - 2px)",
      "(max-width: 1200px) calc((100vw - 138px) / 4 - 2px)",
      `calc((${desktopContainer} - 56px) / 5 - 2px)`,
    ].join(", ");

  const desktopRatio = count === 1 ? 1 : count === 2 ? 2.35 : 3.35;
  const desktopGaps = count === 1 ? 18 : count === 2 ? 32 : 46;
  const column = variant === "lg" && count > 1 ? 1.35 : 1;
  const desktopSize = (width: string) =>
    `calc((${width} * 0.77 - ${desktopGaps}px) * ${column} / ${desktopRatio} - 2px)`;
  const desktopSizes = [
    `(max-width: 1120px) ${desktopSize("(100vw - 64px)")}`,
    desktopSize(desktopContainer),
  ];

  if (variant === "lg")
    return [
      `(max-width: 380px) calc(100vw - ${mobileGutter + 2}px)`,
      `(max-width: 640px) calc((100vw - ${mobileGutter + 2}px) * 0.45)`,
      `(max-width: 760px) calc((100vw - ${tabletGutter + 2}px) * 0.45)`,
      ...(brand === "cordial" ? ["(max-width: 768px) calc(100vw - 38px)"] : []),
      "(max-width: 1100px) calc(100vw - 66px)",
      ...desktopSizes,
    ].join(", ");

  const tabletRatio = count === 2 ? 2.35 : 2;
  return [
    "(max-width: 341px) 116px",
    `(max-width: 640px) calc((100vw - ${mobileGutter + 10}px) / 2 - 2px)`,
    `(max-width: 760px) calc((100vw - ${tabletGutter + 10}px) / 2 - 2px)`,
    ...(brand === "cordial"
      ? [`(max-width: 768px) calc((100vw - 50px) / ${tabletRatio} - 2px)`]
      : []),
    `(max-width: 1100px) calc((100vw - 78px) / ${tabletRatio} - 2px)`,
    ...desktopSizes,
  ].join(", ");
}

/** Card compacto da home: foto + dados essenciais, uma ação principal e favorito. */
function HomeCard({
  p,
  variant,
  sizes,
  galleryHint,
  renderOffscreenImages,
}: {
  p: PublicProperty;
  variant: HomeCardVariant;
  sizes: string;
  galleryHint?: HomeData["leadGallery"];
  renderOffscreenImages: boolean;
}) {
  const brand = useSiteBrand();
  const title = `${p.type ?? "Imóvel"}${p.district ? ` no ${p.district}` : ""}`;
  const photoRoot = useRef<HTMLDivElement | null>(null);
  const photos = useCardPhotos(p, brand, photoRoot, sizes, galleryHint);
  const [nearViewport, setNearViewport] = useState(false);
  const showPhoto = nearViewport || renderOffscreenImages || !p.cover;
  useEffect(() => {
    const target = photoRoot.current;
    if (!target || showPhoto) return;
    if (typeof IntersectionObserver === "undefined") {
      setNearViewport(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setNearViewport(true);
        observer.disconnect();
      },
      { rootMargin: "80px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [showPhoto]);
  return (
    <article className={`cs-hx-card cs-hx-card-${variant}`}>
      <div className="cs-hx-card-media" ref={photoRoot} {...photos.swipeHandlers}>
        <SiteLink
          to={propertyPath(p, brand)}
          className="cs-hx-card-media-link"
          aria-label={title}
          tabIndex={-1}
        >
          {showPhoto ? (
            <PropertyImage
              media={photos.media}
              alt={title}
              sizes={photos.imageSizes}
              fetchPriority={variant === "lg" ? "auto" : "low"}
            />
          ) : (
            p.cover && (
              <noscript>
                <img
                  src={mediaPath(p.cover, "card", brand)}
                  srcSet={cardSrcSet(p.cover, brand)}
                  sizes={sizes}
                  width={p.cover.width ?? 960}
                  height={p.cover.height ?? 640}
                  alt={title}
                  loading="lazy"
                  decoding="async"
                />
              </noscript>
            )
          )}
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
            onPrepare={(direction) => photos.prepare(direction)}
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

function HeroImage({ property, image, onSettled }: HomeHeroData & { onSettled?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const edited = useRef<HTMLImageElement>(null);
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
  const editUrl = image?.url;
  const showEdit = Boolean(editUrl && failedUrl !== editUrl);
  useEffect(() => {
    const img = edited.current;
    if (!showEdit || !editUrl || !img?.complete) return;
    if (img.naturalWidth) onSettled?.();
    else setFailedUrl(editUrl);
  }, [editUrl, showEdit, onSettled]);
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
        {showEdit ? (
          // Edited derivative failed → fall back once to the authorized original of the same property.
          <img
            ref={edited}
            src={editUrl ?? undefined}
            alt=""
            width={1536}
            height={1024}
            fetchPriority="high"
            decoding="async"
            className="cs-hx-showcase-img"
            onLoad={onSettled}
            onError={() => setFailedUrl(editUrl ?? null)}
          />
        ) : (
          <PropertyImage
            media={property.cover}
            alt=""
            priority
            size="full"
            sizes="100vw"
            onImageReady={onSettled}
            onImageError={onSettled}
          />
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

function EmptyHomeHero({ onSettled }: { onSettled?: () => void }) {
  useEffect(() => onSettled?.(), [onSettled]);
  return <div className="cs-hx-hero-media" aria-hidden />;
}

export function HomeHero({ hero, onSettled }: Pick<HomeData, "hero"> & { onSettled?: () => void }) {
  const brand = useSiteBrand();
  const copy = HOME_COPY[brand];
  return (
    <section className="cs-hx-hero">
      <Await promise={hero} fallback={<div className="cs-hx-hero-media" aria-hidden />}>
        {(data) =>
          data ? (
            <HeroImage {...data} onSettled={onSettled} />
          ) : (
            <EmptyHomeHero onSettled={onSettled} />
          )
        }
      </Await>
      <div className="cs-container cs-hx-hero-grid">
        <div className="cs-hx-hero-copy">
          <h1>
            {copy.lead} <em>{copy.accent}</em>
          </h1>
          <p>
            <span className="cs-hx-long">{copy.sub}</span>
            <span className="cs-hx-short">
              {brand === "morar"
                ? "Comprar ou alugar, perto de você."
                : "Comprar ou alugar, do seu jeito."}
            </span>
          </p>
          <div className="cs-hx-search">
            <SearchForm compact initial={{ finalidade: "venda" }} />
          </div>
        </div>
        <Suspense fallback={null}>
          <Await promise={hero}>
            {(data) => (data ? <HeroCard hero={data.property} /> : null)}
          </Await>
        </Suspense>
      </div>
    </section>
  );
}

export function HomePage({ hero, listings, leadGallery }: HomeData) {
  const { settings } = useSite();
  const brand = useSiteBrand();
  const copy = HOME_COPY[brand];
  // Route invalidation can deliver newer promises before their data. Keep the current
  // section visible until the replacement is ready, including a confirmed empty result.
  const visibleHero = useDeferredValue(hero);
  const visibleListings = useDeferredValue(listings);
  const [heroSettled, setHeroSettled] = useState(false);
  const [wideViewport, setWideViewport] = useState(false);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 761px)");
    const update = () => setWideViewport(desktop.matches);
    update();
    desktop.addEventListener("change", update);
    return () => desktop.removeEventListener("change", update);
  }, []);
  const releaseCardImages = useCallback(() => setHeroSettled(true), []);
  const renderOffscreenImages = wideViewport && heroSettled;
  useEffect(() => resetSpeculativeScope(`${brand}:home`), [brand]);
  return (
    <>
      <HomeHero hero={visibleHero} onSettled={releaseCardImages} />
      <HomeExtras />
      <Await
        promise={visibleListings}
        fallback={
          <p className="cs-container cs-home-loading" role="status">
            Carregando os imóveis…
          </p>
        }
      >
        {(data) => (
          <>
            <section className="cs-container cs-hx-featured" aria-labelledby="cs-hx-featured-title">
              <div className="cs-hx-heading">
                <h2 id="cs-hx-featured-title">Imóveis em destaque</h2>
                <DistrictsDrawer />
                <SiteLink className="cs-text-link" to={sitePath("/buscar", brand)}>
                  Explorar imóveis <ArrowUpRight size={18} />
                </SiteLink>
              </div>
              <div className="cs-hx-featured-layout">
                {!data ? (
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
                        sizes={homeCardSizes(brand, i === 0 ? "lg" : "sm", data.featured.length)}
                        galleryHint={i === 0 ? leadGallery : undefined}
                        renderOffscreenImages={renderOffscreenImages}
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
                      sizes={homeCardSizes(brand, "compact", data.more.length)}
                      renderOffscreenImages={renderOffscreenImages}
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
