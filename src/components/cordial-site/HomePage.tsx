import { ArrowRight, ArrowUpRight, HousePlus, Landmark, MapPin } from "lucide-react";
import { Await } from "@tanstack/react-router";
import type { PublicProperty, SiteCatalog } from "@/lib/cordial-site/contract";
import { propertyPath, sitePath } from "@/lib/cordial-site/presentation";
import { SiteLink } from "./SiteShell";
import { useSite } from "@/lib/cordial-site/context";
import { PropertyCard, PropertyImage } from "./PropertyCard";
import { SearchForm } from "./SearchForm";
import { RecentProperties } from "./RecentProperties";

export function HomePage({
  featured,
  choices,
}: {
  featured: Promise<SiteCatalog | null>;
  choices: Promise<PublicProperty[]>;
}) {
  const { settings, facets, available } = useSite();
  const districts = [...facets.districts]
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, "pt-BR"))
    .slice(0, 6);
  return (
    <>
      <section className="cs-hero cs-home-intro">
        <div className="cs-container cs-hero-layout">
          <div className="cs-hero-copy">
            <p className="cs-eyebrow">
              <span /> Sentir-se em casa!
            </p>
            <h1>
              Seu próximo lugar.
              <br />
              <em>Do seu jeito.</em>
            </h1>
            <p>Comprar ou alugar começa com o que importa para você.</p>
          </div>
          <div className="cs-search-home">
            <SearchForm compact initial={{ finalidade: "venda" }} />
          </div>
          <Await
            promise={choices}
            fallback={
              <div className="cs-hero-photo cs-media-pending" role="status">
                Carregando imóvel em destaque…
              </div>
            }
          >
            {(choices) => {
              const hero =
                choices.find((p) => p.id === settings.heroPropertyId && p.cover) ??
                choices.find((p) => p.cover);
              return hero ? (
                <div className="cs-hero-photo">
                  <PropertyImage
                    media={hero.cover}
                    alt={`${hero.type ?? "Imóvel"} publicado pela Cordial, referência ${hero.reference}`}
                    priority
                    size="full"
                  />
                  <div className="cs-hero-photo-note">
                    <span>
                      <MapPin size={15} />
                      {[hero.district, hero.city].filter(Boolean).join(" · ")}
                    </span>
                    <SiteLink to={propertyPath(hero)}>
                      Conheça este imóvel <ArrowUpRight size={19} />
                    </SiteLink>
                  </div>
                </div>
              ) : (
                <div className="cs-hero-photo cs-media-pending">Sentir-se em casa!</div>
              );
            }}
          </Await>
        </div>
      </section>
      {districts.length > 0 && (
        <section className="cs-region-band">
          <div className="cs-container">
            <div className="cs-section-heading">
              <div>
                <p className="cs-eyebrow">Perto do que importa</p>
                <h2>Busque por bairro ou loteamento</h2>
              </div>
              <SiteLink to={sitePath("/bairros")} className="cs-text-link">
                Ver todos <ArrowUpRight size={19} />
              </SiteLink>
            </div>
            <div className="cs-home-regions">
              {districts.map((d) => (
                <SiteLink
                  className="cs-region-shortcut"
                  to={sitePath(
                    `/buscar?${new URLSearchParams({ cidade: d.city, bairro: d.value })}`,
                  )}
                  key={`${d.city}:${d.value}`}
                >
                  <MapPin size={19} />
                  <div>
                    <h3>{d.value}</h3>
                    <small>
                      {d.city} · {d.count} {d.count === 1 ? "imóvel" : "imóveis"}
                    </small>
                  </div>
                  <ArrowUpRight size={18} />
                </SiteLink>
              ))}
            </div>
          </div>
        </section>
      )}
      <section className="cs-container cs-section">
        <div className="cs-section-heading">
          <div>
            <p className="cs-eyebrow">Escolhidos pela Cordial</p>
            <h2>Imóveis em destaque</h2>
          </div>
          <SiteLink className="cs-text-link" to={sitePath("/buscar")}>
            Explorar imóveis <ArrowUpRight size={20} />
          </SiteLink>
        </div>
        <Await
          promise={featured}
          fallback={
            <div className="cs-inline-state" role="status">
              Atualizando os destaques…
            </div>
          }
        >
          {(featured) =>
            !available || !featured ? (
              <div className="cs-inline-state" role="status">
                <h3>Não foi possível atualizar os destaques.</h3>
                <p>O catálogo está temporariamente indisponível.</p>
                <button className="cs-button cs-button-light" onClick={() => location.reload()}>
                  Tentar novamente
                </button>
              </div>
            ) : featured.items.length ? (
              <div className="cs-featured-carousel" aria-label="Imóveis em destaque">
                {featured.items.slice(0, 9).map((p) => (
                  <PropertyCard property={p} key={p.id} />
                ))}
              </div>
            ) : (
              <div className="cs-inline-state">
                <h3>Encontre seu imóvel na busca.</h3>
                <p>Não há destaques publicados neste momento.</p>
                <SiteLink className="cs-button cs-button-light" to={sitePath("/buscar")}>
                  Buscar imóveis <ArrowRight size={17} />
                </SiteLink>
              </div>
            )
          }
        </Await>
      </section>
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
