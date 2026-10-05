import { ArrowRight, ArrowUpRight, House, KeyRound, MapPin, HeartHandshake } from "lucide-react";
import type { PublicProperty, SiteCatalog } from "@/lib/cordial-site/contract";
import { useSite } from "@/lib/cordial-site/context";
import { propertyPath, priceLabel, sitePath } from "@/lib/cordial-site/presentation";
import { PropertyCard, PropertyImage } from "./PropertyCard";
import { SiteLink } from "./SiteShell";
import { SearchForm } from "./SearchForm";
import { WhatsAppIcon, InstagramIcon } from "./SocialIcons";

export function MorarHomePage({
  featured,
  rentals,
  hero,
}: {
  featured: SiteCatalog | null;
  rentals: SiteCatalog | null;
  hero: PublicProperty | null;
}) {
  const { settings, facets, available } = useSite();
  const path = (value: string) => sitePath(value, "morar");
  return (
    <>
      <section className={`ms-hero ${hero?.cover ? "has-photo" : ""}`}>
        {hero?.cover && (
          <div className="ms-hero-photo">
            <PropertyImage
              media={hero.cover}
              priority
              size="full"
              alt={`${hero.type ?? "Imóvel"} publicado pela Morar, referência ${hero.reference}`}
            />
          </div>
        )}
        <div className="ms-hero-shade" />
        <div className="cs-container ms-hero-inner">
          <div className="ms-hero-copy">
            <p className="cs-eyebrow">
              <span />
              Comprar, alugar, recomeçar.
            </p>
            <h1>
              O seu próximo lar.
              <br />
              <em>Mais perto de você.</em>
            </h1>
            <p>
              Um lugar que combina com a sua vida. Uma equipe por perto para ajudar você a
              encontrar.
            </p>
            <div className="ms-hero-signature">{settings.tagline}</div>
          </div>
          {hero && (
            <SiteLink to={propertyPath(hero, "morar")} className="ms-hero-offer">
              <span>
                <MapPin size={16} />
                {[hero.district, hero.city].filter(Boolean).join(" · ") || "Conheça este imóvel"}
              </span>
              <strong>
                {hero.type ?? "Imóvel"} · {priceLabel(hero)}
              </strong>
              <span>
                Ver imóvel <ArrowUpRight size={18} />
              </span>
            </SiteLink>
          )}
        </div>
      </section>
      <section className="cs-container ms-home-search" aria-label="Buscar imóveis">
        <div className="ms-search-intro">
          <span className="cs-eyebrow">Seu lugar começa aqui</span>
          <h2>Vamos encontrar o seu lugar?</h2>
        </div>
        <SearchForm compact />
      </section>
      <section className="cs-container cs-section cs-reveal">
        <div className="cs-section-heading">
          <div>
            <p className="cs-eyebrow">Escolhas para o seu próximo passo</p>
            <h2>
              Uma seleção para
              <br />
              <em>você se imaginar aqui.</em>
            </h2>
          </div>
          <SiteLink to={path("/buscar")} className="cs-text-link">
            Todos os imóveis <ArrowUpRight size={21} />
          </SiteLink>
        </div>
        {!available || !featured ? (
          <CatalogFailure />
        ) : featured.items.length ? (
          <div
            className={`cs-property-grid ${featured.items.length === 1 ? "ms-featured-single" : ""}`}
          >
            {featured.items.slice(0, 6).map((p) => (
              <PropertyCard key={p.id} property={p} />
            ))}
          </div>
        ) : (
          <div className="cs-inline-state">
            <h3>Seu próximo lugar pode estar na busca.</h3>
            <p>Não há destaques publicados neste momento. Conheça o catálogo disponível.</p>
            <SiteLink to={path("/buscar")} className="cs-button cs-button-light">
              Explorar imóveis <ArrowRight size={18} />
            </SiteLink>
          </div>
        )}
      </section>
      <section className="ms-human-band cs-reveal">
        <div className="cs-container ms-human-layout">
          <div className="ms-human-title">
            <HeartHandshake size={38} strokeWidth={1.25} />
            <p className="cs-eyebrow">Imóveis aproximam histórias</p>
            <h2>
              Escolher onde morar
              <br />é escolher <em>como viver.</em>
            </h2>
          </div>
          <div>
            <p>
              {settings.about ||
                "Conte para a nossa equipe o que você procura. Juntos, podemos conhecer as opções e encontrar caminhos para comprar, alugar ou anunciar seu imóvel."}
            </p>
            <SiteLink to={path("/sobre")} className="cs-text-link">
              Conheça a Morar <ArrowUpRight size={20} />
            </SiteLink>
          </div>
        </div>
      </section>
      <section className="cs-container cs-section cs-reveal ms-rentals">
        <div className="cs-section-heading">
          <div>
            <p className="cs-eyebrow">Um novo endereço, no seu tempo</p>
            <h2>
              Casas para alugar.
              <br />
              <em>Espaço para a sua vida.</em>
            </h2>
          </div>
          <SiteLink to={path("/buscar?finalidade=aluguel")} className="cs-text-link">
            Explore a locação <ArrowUpRight size={21} />
          </SiteLink>
        </div>
        {!available || !rentals ? (
          <CatalogFailure />
        ) : rentals.items.length ? (
          <div className="cs-property-grid">
            {rentals.items.slice(0, 6).map((p) => (
              <PropertyCard key={p.id} property={p} />
            ))}
          </div>
        ) : (
          <div className="cs-inline-state">
            <h3>Vamos conversar sobre seu próximo lar?</h3>
            <p>
              Não há casas publicadas para locação neste momento. Veja outras opções disponíveis ou
              fale com a nossa equipe.
            </p>
            <SiteLink to={path("/buscar?finalidade=aluguel")} className="cs-button cs-button-light">
              Ver imóveis para alugar <ArrowRight size={18} />
            </SiteLink>
          </div>
        )}
      </section>
      {facets.districts.length > 0 && (
        <section className="ms-neighborhoods cs-reveal">
          <div className="cs-container">
            <div className="cs-section-heading">
              <div>
                <p className="cs-eyebrow">Perto da sua rotina</p>
                <h2>
                  Qual bairro tem
                  <br />
                  <em>o seu jeito?</em>
                </h2>
              </div>
              <SiteLink to={path("/bairros")} className="cs-text-link">
                Todos os bairros <ArrowUpRight size={21} />
              </SiteLink>
            </div>
            <div className="ms-districts">
              {facets.districts.slice(0, 6).map((d) => (
                <SiteLink
                  key={`${d.city}-${d.value}`}
                  to={path(`/buscar?${new URLSearchParams({ cidade: d.city, bairro: d.value })}`)}
                >
                  <MapPin size={22} strokeWidth={1.5} />
                  <span>
                    <small>{d.city}</small>
                    <h3>{d.value}</h3>
                    <span>
                      {d.count} {d.count === 1 ? "imóvel" : "imóveis"}
                    </span>
                  </span>
                  <ArrowUpRight size={22} />
                </SiteLink>
              ))}
            </div>
          </div>
        </section>
      )}
      <section className="cs-container cs-section cs-reveal">
        <div className="cs-section-heading">
          <div>
            <p className="cs-eyebrow">A Morar está por perto</p>
            <h2>
              Uma conversa.
              <br />
              <em>Novas possibilidades.</em>
            </h2>
          </div>
        </div>
        <div className="ms-services">
          {[
            {
              icon: House,
              title: "Seu imóvel, nosso próximo encontro.",
              text: "Quer vender ou alugar? Apresente seu imóvel à equipe Morar.",
              to: "/anuncie",
              action: "Anunciar meu imóvel",
            },
            {
              icon: KeyRound,
              title: "O primeiro passo tem companhia.",
              text: "Conte o que procura, conheça os imóveis e converse sobre uma visita.",
              to: "/contato",
              action: "Falar com a equipe",
            },
          ].map((s) => (
            <article key={s.to}>
              <s.icon size={31} strokeWidth={1.4} />
              <h3>{s.title}</h3>
              <p>{s.text}</p>
              <SiteLink className="cs-text-link" to={path(s.to)}>
                {s.action}
                <ArrowUpRight size={20} />
              </SiteLink>
            </article>
          ))}
        </div>
      </section>
      {facets.types.length > 0 && (
        <section className="cs-container ms-types cs-reveal">
          <p className="cs-eyebrow">Do seu jeito</p>
          <h2>Explore as possibilidades.</h2>
          <div>
            {facets.types.map((t) => (
              <SiteLink key={t.value} to={path(`/buscar?tipo=${encodeURIComponent(t.value)}`)}>
                {t.value}
                <span>{t.count}</span>
                <ArrowUpRight size={18} />
              </SiteLink>
            ))}
          </div>
        </section>
      )}
      <section className="ms-conversation">
        <div className="cs-container">
          <div>
            <p className="cs-eyebrow">Gente que ajuda gente</p>
            <h2>
              Vamos conversar
              <br />
              sobre <em>o seu próximo lugar?</em>
            </h2>
          </div>
          <div className="ms-conversation-actions">
            {settings.whatsapp && (
              <a
                className="cs-button cs-button-white"
                href={`https://wa.me/${settings.whatsapp}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <WhatsAppIcon width={23} height={23} />
                Conversar no WhatsApp
                <ArrowUpRight size={18} />
              </a>
            )}
            {settings.instagram && (
              <a
                className="ms-social-link"
                href={settings.instagram}
                target="_blank"
                rel="noopener noreferrer"
              >
                <InstagramIcon width={24} height={24} />
                Morar no Instagram
                <ArrowUpRight size={18} />
              </a>
            )}
            <SiteLink className="ms-social-link" to={path("/contato")}>
              Deixar uma mensagem
              <ArrowRight size={18} />
            </SiteLink>
          </div>
        </div>
      </section>
    </>
  );
}
function CatalogFailure() {
  return (
    <div className="cs-inline-state" role="status">
      <h3>Não foi possível consultar os imóveis agora.</h3>
      <p>Tente novamente em instantes ou converse com a equipe pelos canais disponíveis.</p>
      <button className="cs-button cs-button-light" onClick={() => location.reload()}>
        Tentar novamente
      </button>
    </div>
  );
}
