import { useEffect, useState } from "react";
import { ArrowUpRight, Heart, Mail, MapPin, Phone, ArrowRight } from "lucide-react";
import type { PublicDetail, SitePage } from "@/lib/cordial-site/contract";
import { loadDetail } from "@/lib/cordial-site/data";
import { sitePath } from "@/lib/cordial-site/presentation";
import { SiteLink } from "./SiteShell";
import { useSite } from "@/lib/cordial-site/context";
import { ContactForm } from "./ContactForm";
import { PropertyCard } from "./PropertyCard";
import { readFavorites } from "@/lib/cordial-site/favorites";
export function PageIntro({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="cs-page-intro">
      <p className="cs-eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </div>
  );
}
export function ContactPage({ capture = false }: { capture?: boolean }) {
  const { settings } = useSite();
  return (
    <div className="cs-container cs-content-page">
      <PageIntro
        eyebrow={capture ? "Seu imóvel, novos caminhos" : "Estamos por perto"}
        title={
          capture
            ? "Vamos encontrar o próximo capítulo do seu imóvel."
            : "Uma boa conversa é o primeiro passo."
        }
        description={
          capture
            ? "Conte um pouco sobre o imóvel que você quer vender ou alugar. A equipe Cordial entrará em contato para dar continuidade."
            : "Dúvidas, planos ou uma nova oportunidade. Conte à Cordial o que você procura."
        }
      />
      <div className="cs-contact-layout">
        <div className="cs-contact-information">
          <h2>Fale com a Cordial</h2>
          {settings.phone && (
            <a href={`tel:${settings.phone.replace(/[^+\d]/g, "")}`}>
              <Phone />
              {settings.phone}
            </a>
          )}
          {settings.email && (
            <a href={`mailto:${settings.email}`}>
              <Mail />
              {settings.email}
            </a>
          )}
          {settings.address && (
            <p>
              <MapPin />
              {settings.address}
            </p>
          )}
          {settings.hours && <p>{settings.hours}</p>}
          {settings.whatsapp && (
            <a
              className="cs-text-link"
              href={`https://wa.me/${settings.whatsapp}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Conversar no WhatsApp <ArrowUpRight size={18} />
            </a>
          )}
          <div className="cs-contact-brand">
            <img src="/cordial-site/logo.png" width="691" height="231" alt="" />
            <p>{settings.tagline}</p>
          </div>
        </div>
        <div className="cs-contact-panel">
          <h2>{capture ? "Apresente seu imóvel" : "Deixe sua mensagem"}</h2>
          <ContactForm kind={capture ? "captacao" : "contato"} />
        </div>
      </div>
    </div>
  );
}
export function EditorialPage({ slug, content }: { slug: string; content: SitePage | null }) {
  const { settings } = useSite();
  const titles: Record<string, [string, string]> = {
    sobre: ["A Cordial", "Sentir-se em casa. Em cada escolha."],
    financiamento: ["Planeje seu próximo passo", "Financiamento imobiliário."],
    correspondente: ["Conte com a Cordial", "Correspondente bancário."],
    privacidade: ["Seus dados, suas escolhas", "Política de Privacidade."],
  };
  const [eyebrow, title] = titles[slug] ?? ["Informações", content?.title ?? "Conteúdo"];
  const body =
    slug === "privacidade"
      ? settings.privacy
      : content?.body || (slug === "sobre" ? settings.about : "");
  return (
    <div className="cs-container cs-content-page">
      <PageIntro eyebrow={eyebrow} title={content?.title ?? title} description={content?.summary} />
      <div className="cs-editorial-layout">
        <article className="cs-prose">
          {body || (
            <>
              <h2>Vamos conversar sobre isso?</h2>
              <p>
                {slug === "privacidade"
                  ? "A política de privacidade está em preparação. O formulário de contato ficará indisponível até sua publicação."
                  : "As informações desta página ainda não foram publicadas. Nossa equipe pode orientar você pelos canais disponíveis."}
              </p>
            </>
          )}
          {slug === "financiamento" && settings.links.length > 0 && (
            <div className="cs-service-links">
              {settings.links.map((l) => (
                <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer">
                  {l.label}
                  <ArrowUpRight size={18} />
                </a>
              ))}
            </div>
          )}
        </article>
        <aside className="cs-editorial-aside">
          <span className="cs-eyebrow">Seu próximo capítulo</span>
          <h2>Conte com a proximidade da Cordial.</h2>
          <SiteLink to={sitePath("/contato")} className="cs-button">
            Fale com a equipe <ArrowUpRight size={18} />
          </SiteLink>
          <SiteLink to={sitePath("/buscar")} className="cs-text-link">
            Explore os imóveis <ArrowRight size={18} />
          </SiteLink>
        </aside>
      </div>
    </div>
  );
}
export function DistrictsPage({ pages }: { pages: SitePage[] }) {
  const { facets } = useSite();
  return (
    <div className="cs-container cs-content-page">
      <PageIntro
        eyebrow="Perto do que importa"
        title="Encontre o seu lugar na cidade."
        description="Explore os bairros com imóveis publicados e escolha por onde começar."
      />
      <div className="cs-district-grid">
        {facets.districts.map((d) => (
          <SiteLink
            className="cs-district-card"
            key={`${d.city}-${d.value}`}
            to={sitePath(`/buscar?${new URLSearchParams({ cidade: d.city, bairro: d.value })}`)}
          >
            <div>
              <small>{d.city}</small>
              <h2>{d.value}</h2>
              <span>
                {d.count} {d.count === 1 ? "imóvel" : "imóveis"}
              </span>
            </div>
            <ArrowUpRight />
          </SiteLink>
        ))}
      </div>
      {facets.districts.length === 0 && (
        <p className="cs-inline-state">
          Ainda não há bairros com imóveis publicados para explorar.
        </p>
      )}
      {pages.length > 0 && (
        <section className="cs-section">
          <h2>Conheça a região</h2>
          {pages.map((p) => (
            <SiteLink
              className="cs-article-card"
              key={p.slug}
              to={sitePath(`/informacoes/${p.slug}`)}
            >
              <h3>{p.title}</h3>
              <p>{p.summary}</p>
              <ArrowUpRight />
            </SiteLink>
          ))}
        </section>
      )}
    </div>
  );
}
export function NewsPage({ pages }: { pages: SitePage[] }) {
  return (
    <div className="cs-container cs-content-page">
      <PageIntro
        eyebrow="Conexões e novidades"
        title="O que acontece por aqui."
        description="Notícias e conteúdos publicados pela equipe Cordial."
      />
      {pages.length ? (
        <div className="cs-news-grid">
          {pages.map((p) => (
            <SiteLink className="cs-article-card" key={p.slug} to={sitePath(`/noticias/${p.slug}`)}>
              {p.publishedAt && (
                <time dateTime={p.publishedAt}>
                  {new Date(p.publishedAt).toLocaleDateString("pt-BR", {
                    timeZone: "America/Sao_Paulo",
                  })}
                </time>
              )}
              <h2>{p.title}</h2>
              <p>{p.summary}</p>
              <span>
                Ler conteúdo <ArrowUpRight />
              </span>
            </SiteLink>
          ))}
        </div>
      ) : (
        <div className="cs-inline-state">
          <h2>Novas histórias vêm por aí.</h2>
          <p>Ainda não há notícias publicadas. Enquanto isso, explore nossos imóveis.</p>
          <SiteLink to={sitePath("/buscar")} className="cs-text-link">
            Encontre seu próximo endereço <ArrowRight size={18} />
          </SiteLink>
        </div>
      )}
    </div>
  );
}
export function FavoritesPage() {
  const [items, setItems] = useState<PublicDetail[]>([]);
  const [missing, setMissing] = useState(0);
  const [pending, setPending] = useState(true);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let disposed = false;
    const abort = new AbortController();
    async function refresh() {
      setPending(true);
      setFailed(false);
      let count = 0;
      const loaded: PublicDetail[] = [];
      try {
        const ids = readFavorites();
        for (let i = 0; i < ids.length; i += 4) {
          const batch = await Promise.all(
            ids.slice(i, i + 4).map((id) => loadDetail(id, abort.signal)),
          );
          for (const p of batch) {
            if (p) loaded.push(p);
            else count++;
          }
        }
        if (!disposed) {
          setItems(loaded);
          setMissing(count);
        }
      } catch {
        if (!disposed) setFailed(true);
      } finally {
        if (!disposed) setPending(false);
      }
    }
    void refresh();
    window.addEventListener("cordial-favorites", refresh);
    return () => {
      disposed = true;
      abort.abort();
      window.removeEventListener("cordial-favorites", refresh);
    };
  }, []);
  return (
    <div className="cs-container cs-content-page">
      <PageIntro
        eyebrow="Guardados por você"
        title="Lugares que ficaram na memória."
        description="Seus favoritos ficam somente neste navegador, sem precisar de uma conta."
      />
      {pending ? (
        <p role="status">Consultando a disponibilidade dos seus favoritos…</p>
      ) : failed ? (
        <div className="cs-inline-state" role="alert">
          Não foi possível consultar os favoritos.{" "}
          <button onClick={() => location.reload()}>Tentar novamente</button>
        </div>
      ) : (
        <>
          {missing > 0 && (
            <p role="status">
              {missing}{" "}
              {missing === 1 ? "favorito não está disponível" : "favoritos não estão disponíveis"}{" "}
              no catálogo atual.
            </p>
          )}
          {items.length ? (
            <div className="cs-property-grid">
              {items.map((p) => (
                <PropertyCard key={p.id} property={p} />
              ))}
            </div>
          ) : (
            <div className="cs-state">
              <Heart size={38} />
              <h2>Uma seleção com o seu jeito.</h2>
              <p>Toque no coração de um imóvel para guardá-lo aqui.</p>
              <SiteLink className="cs-button" to={sitePath("/buscar")}>
                Explorar imóveis <ArrowRight size={18} />
              </SiteLink>
            </div>
          )}
        </>
      )}
    </div>
  );
}
