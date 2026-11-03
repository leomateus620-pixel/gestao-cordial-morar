import { useEffect, useMemo, useRef, useState } from "react";
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
} from "lucide-react";
import { Await } from "@tanstack/react-router";
import type { PublicProperty } from "@/lib/cordial-site/contract";
import {
  areaLabel,
  priceLabel,
  propertyPath,
  sitePath,
} from "@/lib/cordial-site/presentation";
import { SiteLink } from "./SiteShell";
import { useSite } from "@/lib/cordial-site/context";
import { FavoriteButton, PropertyImage } from "./PropertyCard";
import { SearchForm } from "./SearchForm";
import { RecentProperties } from "./RecentProperties";
import { propertyWhatsapp } from "@/lib/cordial-site/experience";
import { WhatsAppIcon } from "./SocialIcons";

export type HomeData = {
  featured: PublicProperty[];
  more: PublicProperty[];
  hero: PublicProperty | null;
  total: number;
};

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
  const title = `${p.type ?? "Imóvel"}${p.district ? ` no ${p.district}` : ""}`;
  return (
    <article className={`cs-hx-card cs-hx-card-${variant}`}>
      <SiteLink to={propertyPath(p)} className="cs-hx-card-media" aria-label={title} tabIndex={-1}>
        <PropertyImage media={p.cover} alt={title} sizes={sizes} />
        <span className="cs-hx-badge">{opLabel(p)}</span>
      </SiteLink>
      <div className="cs-hx-fav">
        <FavoriteButton id={p.id} />
      </div>
      <div className="cs-hx-card-body">
        <strong className="cs-hx-price">{priceLabel(p)}</strong>
        <h3>
          <SiteLink to={propertyPath(p)}>{p.type ?? "Imóvel"}</SiteLink>
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

function HeroImage({ hero }: { hero: PublicProperty }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const save = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    if (reduce || save) return;
    const io = new IntersectionObserver(([e]) => el.classList.toggle("is-moving", e.isIntersecting && !document.hidden));
    io.observe(el);
    const vis = () => document.hidden && el.classList.remove("is-moving");
    document.addEventListener("visibilitychange", vis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", vis);
    };
  }, []);
  return (
    <div className="cs-hx-hero-media" ref={ref} aria-hidden>
      <PropertyImage media={hero.cover} alt="" priority size="full" sizes="100vw" />
    </div>
  );
}

function HeroCard({ hero }: { hero: PublicProperty }) {
  const { settings } = useSite();
  const whatsapp = propertyWhatsapp?.(hero, settings);
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
        <SiteLink to={propertyPath(hero)} className="cs-button cs-hx-primary">
          Conhecer este imóvel <ArrowUpRight size={17} />
        </SiteLink>
        {whatsapp && (
          <a className="cs-icon-button cs-hx-wa" href={whatsapp} target="_blank" rel="noreferrer" aria-label="Conversar no WhatsApp sobre este imóvel">
            <WhatsAppIcon />
          </a>
        )}
      </div>
    </aside>
  );
}

function DistrictsPanel() {
  const { facets } = useSite();
  const cities = useMemo(() => [...new Set(facets.districts.map((d) => d.city))].sort((a, b) => a.localeCompare(b, "pt-BR")), [facets.districts]);
  const [city, setCity] = useState("");
  const [q, setQ] = useState("");
  const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const list = facets.districts
    .filter((d) => (!city || d.city === city) && (!q || norm(d.value).includes(norm(q))))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, "pt-BR"))
    .slice(0, 6);
  return (
    <aside className="cs-hx-districts" aria-labelledby="cs-hx-districts-title">
      <h2 id="cs-hx-districts-title">Bairros</h2>
      <p className="cs-hx-note">Imóveis publicados agora</p>
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
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ex.: Centro" />
        </span>
      </label>
      <ul>
        {list.map((d) => (
          <li key={`${d.city}:${d.value}`}>
            <SiteLink to={sitePath(`/buscar?${new URLSearchParams({ cidade: d.city, bairro: d.value })}`)}>
              <span>
                <b>{d.value}</b>
                {cities.length > 1 && <small>{d.city}</small>}
              </span>
              <em>{d.count}</em>
            </SiteLink>
          </li>
        ))}
        {!list.length && <li className="cs-hx-note">Nenhum bairro encontrado.</li>}
      </ul>
      <SiteLink to={sitePath("/bairros")} className="cs-text-link">
        Ver todos <ArrowUpRight size={16} />
      </SiteLink>
    </aside>
  );
}

export function HomePage({ home }: { home: Promise<HomeData | null> }) {
  const { settings, available } = useSite();
  return (
    <>
      <Await promise={home} fallback={<HomeSkeleton />}>
        {(data) => (
          <>
            <section className={`cs-hx-hero ${data?.hero ? "" : "is-neutral"}`}>
              {data?.hero && <HeroImage hero={data.hero} />}
              <div className="cs-container cs-hx-hero-grid">
                <div className="cs-hx-hero-copy">
                  <h1>
                    Seu próximo lugar. <em>Do seu jeito.</em>
                  </h1>
                  <p>Comprar ou alugar começa com o que importa para você.</p>
                  <div className="cs-hx-search">
                    <SearchForm compact initial={{ finalidade: "venda" }} />
                  </div>
                </div>
                {data?.hero && <HeroCard hero={data.hero} />}
              </div>
            </section>

            <section className="cs-container cs-hx-featured" aria-labelledby="cs-hx-featured-title">
              <div className="cs-hx-heading">
                <h2 id="cs-hx-featured-title">Imóveis em destaque</h2>
                <SiteLink className="cs-text-link" to={sitePath("/buscar")}>
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
                        sizes={i === 0 ? "(max-width: 768px) 100vw, 40vw" : "(max-width: 768px) 100vw, (max-width: 1100px) 50vw, 20vw"}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="cs-inline-state">
                    <h3>Encontre seu imóvel na busca.</h3>
                    <SiteLink className="cs-button cs-button-light" to={sitePath("/buscar")}>
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
                    <HomeCard key={p.id} p={p} variant="compact" sizes="(max-width: 560px) 100vw, (max-width: 900px) 50vw, (max-width: 1200px) 33vw, 20vw" />
                  ))}
                </div>
                <div className="cs-hx-more-footer">
                  <SiteLink className="cs-button cs-button-light" to={sitePath("/buscar")}>
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
            <h2>Conte com a Cordial.</h2>
          </div>
          <div>
            <p>
              {settings.about ||
                "Cada mudança começa com uma escolha. Nossa equipe acompanha você para comprar, alugar ou anunciar seu imóvel."}
            </p>
            <SiteLink to={sitePath("/sobre")} className="cs-text-link">
              Conheça nossa história <ArrowUpRight size={19} />
            </SiteLink>
          </div>
        </div>
      </section>
      <section className="cs-container cs-section cs-home-services">
        <div className="cs-services">
          {[
            { icon: HousePlus, title: "Quer vender ou alugar?", text: "Apresente seu imóvel à nossa equipe.", to: "/anuncie", cta: "Anunciar meu imóvel" },
            { icon: Landmark, title: "Planeje sua compra", text: "Conheça os caminhos para financiar seu imóvel.", to: "/financiamento", cta: "Ver financiamento" },
          ].map((s) => (
            <article key={s.to}>
              <s.icon size={27} strokeWidth={1.5} />
              <h3>{s.title}</h3>
              <p>{s.text}</p>
              <SiteLink to={sitePath(s.to)}>
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
          <SiteLink className="cs-button cs-button-white" to={sitePath("/contato")}>
            Falar com a equipe <ArrowUpRight size={19} />
          </SiteLink>
        </div>
      </section>
    </>
  );
}

function HomeSkeleton() {
  return (
    <section className="cs-hx-hero is-neutral" role="status" aria-label="Carregando imóveis">
      <div className="cs-container cs-hx-hero-grid">
        <div className="cs-hx-hero-copy">
          <h1>
            Seu próximo lugar. <em>Do seu jeito.</em>
          </h1>
          <div className="cs-hx-search">
            <SearchForm compact initial={{ finalidade: "venda" }} />
          </div>
        </div>
      </div>
    </section>
  );
}
