import { ArrowRight, ArrowUpRight, KeyRound, HousePlus, Landmark, MapPin } from "lucide-react";
import type { SiteCatalog } from "@/lib/cordial-site/contract";
import { propertyPath, sitePath } from "@/lib/cordial-site/presentation";
import { SiteLink } from "./SiteShell";
import { useSite } from "@/lib/cordial-site/context";
import { PropertyCard, PropertyImage } from "./PropertyCard";
import { SearchForm } from "./SearchForm";
export function HomePage({
  featured,
  recent,
}: {
  featured: SiteCatalog | null;
  recent: SiteCatalog | null;
}) {
  const { settings, facets, available } = useSite();
  const hero = featured?.items.find((p) => p.cover) ?? recent?.items.find((p) => p.cover);
  return (
    <>
      <section className="cs-hero">
        <div className="cs-container cs-hero-layout">
          <div className="cs-hero-copy">
            <p className="cs-eyebrow">
              <span /> A vida acontece em casa
            </p>
            <h1>
              Seu lugar.
              <br />
              Seu tempo.
              <br />
              <em>Sua próxima história.</em>
            </h1>
            <p>
              Comprar, alugar ou anunciar. Encontre o imóvel que combina com o seu momento, com a
              proximidade da Cordial.
            </p>
            <div className="cs-hero-signature">
              <span className="cs-signature-line" /> {settings.tagline}
            </div>
          </div>
          <div className={`cs-hero-photo ${hero ? "" : "is-empty"}`}>
            {hero ? (
              <>
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
              </>
            ) : (
              <div className="cs-hero-empty">
                <img src="/cordial-site/logo.png" width="691" height="231" alt="" />
                <p>
                  Sentir-se em casa
                  <br />
                  começa com uma boa conversa.
                </p>
                <SiteLink to={sitePath("/contato")}>
                  Fale com a Cordial <ArrowUpRight />
                </SiteLink>
              </div>
            )}
          </div>
          <div className="cs-search-home">
            <SearchForm compact initial={{ finalidade: "venda" }} />
          </div>
        </div>
      </section>
      <section className="cs-container cs-section cs-reveal">
        <div className="cs-section-heading">
          <div>
            <p className="cs-eyebrow">Encontre o seu próximo endereço</p>
            <h2>
              Imóveis para viver
              <br />
              <span>novas possibilidades.</span>
            </h2>
          </div>
          <SiteLink className="cs-text-link" to={sitePath("/buscar")}>
            Explore os imóveis <ArrowUpRight size={21} />
          </SiteLink>
        </div>
        {!available || !featured ? (
          <div className="cs-inline-state" role="status">
            <h3>Estamos buscando as informações.</h3>
            <p>
              O catálogo está temporariamente indisponível. Tente novamente em instantes ou fale com
              nossa equipe.
            </p>
            <button className="cs-button cs-button-light" onClick={() => location.reload()}>
              Tentar novamente
            </button>
          </div>
        ) : featured.items.length ? (
          <div className="cs-property-grid">
            {featured.items.slice(0, 6).map((p) => (
              <PropertyCard property={p} key={p.id} />
            ))}
          </div>
        ) : (
          <div className="cs-inline-state">
            <h3>O seu próximo imóvel pode estar na busca.</h3>
            <p>
              Não há destaques publicados neste momento. Explore as opções disponíveis ou conte à
              equipe o que procura.
            </p>
            <SiteLink className="cs-button cs-button-light" to={sitePath("/buscar")}>
              Buscar imóveis <ArrowRight size={17} />
            </SiteLink>
          </div>
        )}
      </section>
      <section className="cs-about-band cs-reveal">
        <div className="cs-container cs-about-layout">
          <div>
            <p className="cs-eyebrow">Muito além de um endereço</p>
            <h2>
              É sobre
              <br />
              <em>sentir-se em casa.</em>
            </h2>
          </div>
          <div>
            <p>
              {settings.about ||
                "Cada mudança começa com uma escolha. Conte o que você procura e conheça os caminhos para comprar, alugar ou anunciar seu imóvel com a Cordial."}
            </p>
            <SiteLink to={sitePath("/sobre")} className="cs-text-link">
              Conheça a Cordial <ArrowUpRight size={22} />
            </SiteLink>
          </div>
        </div>
      </section>
      {facets.districts.length > 0 && (
        <section className="cs-container cs-section cs-reveal">
          <div className="cs-section-heading">
            <div>
              <p className="cs-eyebrow">Perto do que importa</p>
              <h2>
                Em qual bairro
                <br />
                <span>você quer estar?</span>
              </h2>
            </div>
            <SiteLink to={sitePath("/bairros")} className="cs-text-link">
              Explore os bairros <ArrowUpRight size={21} />
            </SiteLink>
          </div>
          <div className="cs-district-grid">
            {facets.districts.slice(0, 6).map((d, i) => (
              <SiteLink
                className="cs-district-card"
                to={sitePath(`/buscar?${new URLSearchParams({ cidade: d.city, bairro: d.value })}`)}
                key={`${d.city}-${d.value}`}
              >
                <span className="cs-district-number">0{i + 1}</span>
                <div>
                  <small>{d.city}</small>
                  <h3>{d.value}</h3>
                  <span>
                    {d.count} {d.count === 1 ? "imóvel" : "imóveis"}
                  </span>
                </div>
                <ArrowUpRight size={25} />
              </SiteLink>
            ))}
          </div>
        </section>
      )}
      <section className="cs-container cs-section cs-reveal">
        <div className="cs-section-heading">
          <div>
            <p className="cs-eyebrow">Em cada etapa, por perto</p>
            <h2>Conte com a gente.</h2>
          </div>
        </div>
        <div className="cs-services">
          {[
            {
              icon: HousePlus,
              title: "Seu imóvel, novos caminhos.",
              text: "Quer vender ou alugar? Apresente seu imóvel à nossa equipe.",
              to: "/anuncie",
              cta: "Anunciar meu imóvel",
            },
            {
              icon: Landmark,
              title: "Planeje sua compra.",
              text: "Informações de financiamento e caminhos para conversar com a Cordial.",
              to: "/financiamento",
              cta: "Conhecer o serviço",
            },
            {
              icon: KeyRound,
              title: "Uma conversa faz a diferença.",
              text: "Dúvidas, interesse em uma visita ou um novo começo. Estamos por aqui.",
              to: "/contato",
              cta: "Falar com a Cordial",
            },
          ].map((s) => (
            <article key={s.to}>
              <s.icon size={31} strokeWidth={1.4} />
              <h3>{s.title}</h3>
              <p>{s.text}</p>
              <SiteLink to={sitePath(s.to)}>
                {s.cta}
                <ArrowUpRight size={19} />
              </SiteLink>
            </article>
          ))}
        </div>
      </section>
      {facets.types.length > 0 && (
        <section className="cs-container cs-section cs-reveal cs-category-section">
          <p className="cs-eyebrow">Explore as possibilidades</p>
          <div className="cs-category-links">
            {facets.types.map((t) => (
              <SiteLink key={t.value} to={sitePath(`/buscar?tipo=${encodeURIComponent(t.value)}`)}>
                {t.value}
                <span>{t.count}</span>
                <ArrowUpRight size={18} />
              </SiteLink>
            ))}
          </div>
        </section>
      )}
      <section className="cs-contact-band">
        <div className="cs-container">
          <div>
            <p className="cs-eyebrow">Vamos começar?</p>
            <h2>
              O próximo capítulo
              <br />
              pode ser o seu.
            </h2>
          </div>
          <SiteLink className="cs-button cs-button-white" to={sitePath("/contato")}>
            Conte o que você procura <ArrowUpRight size={20} />
          </SiteLink>
        </div>
      </section>
    </>
  );
}
