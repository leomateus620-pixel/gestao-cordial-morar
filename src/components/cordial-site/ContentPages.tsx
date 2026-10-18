import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Heart, Mail, MapPin, Phone, ArrowRight } from "lucide-react";
import {
  defaultSearch,
  searchParams,
  type PublicDetail,
  type PublicProperty,
  type SiteFacets,
  type SitePage,
  type SiteSearch,
} from "@/lib/cordial-site/contract";
import { loadDetail, loadFacets, loadSummaries } from "@/lib/cordial-site/data";
import { foldSearchText, latestRequest, searchQueryKey } from "@/lib/cordial-site/search-state";
import { sitePath } from "@/lib/cordial-site/presentation";
import { SiteLink } from "./SiteShell";
import { getSiteBrand } from "@/lib/cordial-site/brand";
import { WhatsAppIcon, InstagramIcon } from "./SocialIcons";
import { useSite, useSiteBrand } from "@/lib/cordial-site/context";
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
  const brand = useSiteBrand();
  const config = getSiteBrand(brand);
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
            ? `Conte um pouco sobre o imóvel que você quer vender ou alugar. A equipe ${config.shortName} entrará em contato para dar continuidade.`
            : `Conte à ${config.shortName} o que você procura. Nossa equipe está por perto para ajudar.`
        }
      />
      <div className="cs-contact-layout">
        <div className="cs-contact-information">
          <h2>Fale com a {config.shortName}</h2>
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
              <WhatsAppIcon width={22} height={22} /> Conversar no WhatsApp{" "}
              <ArrowUpRight size={18} />
            </a>
          )}
          {settings.instagram && (
            <a
              className="cs-text-link"
              href={settings.instagram}
              target="_blank"
              rel="noopener noreferrer"
            >
              <InstagramIcon width={22} height={22} />
              Acompanhe a {config.shortName} no Instagram
              <ArrowUpRight size={18} />
            </a>
          )}
          <div className="cs-contact-brand">
            <img src={config.logo} width={config.logoWidth} height={config.logoHeight} alt="" />
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
  const brand = useSiteBrand();
  const config = getSiteBrand(brand);
  const titles: Record<string, [string, string]> = {
    sobre: [
      `A ${config.shortName}`,
      brand === "morar" ? "Seu lugar, uma nova história." : "Sentir-se em casa. Em cada escolha.",
    ],
    financiamento: ["Planeje seu próximo passo", "Financiamento imobiliário."],
    correspondente: [`Conte com a ${config.shortName}`, "Correspondente bancário."],
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
          <h2>Conte com a proximidade da {config.shortName}.</h2>
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
  const brand = useSiteBrand();
  return brand === "cordial" ? (
    <CordialDistrictsPage pages={pages} />
  ) : (
    <ExistingDistrictsPage pages={pages} />
  );
}
function ExistingDistrictsPage({ pages }: { pages: SitePage[] }) {
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
function CordialDistrictsPage({ pages }: { pages: SitePage[] }) {
  const { facets } = useSite();
  const [text, setText] = useState("");
  const [city, setCity] = useState("");
  const [operation, setOperation] = useState<"" | "venda" | "aluguel">("");
  const [type, setType] = useState("");
  const [order, setOrder] = useState("nome");
  const [retry, setRetry] = useState(0);
  const criteria: SiteSearch = {
    ...defaultSearch,
    cidade: city || undefined,
    finalidade: operation || undefined,
    tipo: type || undefined,
  };
  const key = searchQueryKey(criteria, true);
  const [confirmed, setConfirmed] = useState<{
    key: string;
    facets: SiteFacets;
    criteria: SiteSearch;
  }>({ key, facets, criteria });
  const [failure, setFailure] = useState<string | null>(null);
  const requests = useRef(latestRequest());
  useEffect(() => {
    if (key === searchQueryKey(defaultSearch, true) && retry === 0) {
      setConfirmed({ key, facets, criteria: defaultSearch });
      return;
    }
    const requestTracker = requests.current;
    const sequence = requestTracker.next();
    const abort = new AbortController();
    setFailure(null);
    const requested = { ...defaultSearch, ...Object.fromEntries(JSON.parse(key)) };
    void loadFacets(requested, abort.signal)
      .then((result) => {
        if (!abort.signal.aborted && requestTracker.current(sequence))
          setConfirmed({ key, facets: result, criteria: requested });
      })
      .catch(() => {
        if (!abort.signal.aborted && requestTracker.current(sequence)) setFailure(key);
      });
    return () => {
      abort.abort();
      requestTracker.invalidate();
    };
  }, [key, retry, facets]);
  const pending = key !== confirmed.key && failure !== key;
  const districts = confirmed.facets.districts
    .filter((district) =>
      foldSearchText(`${district.value} ${district.city}`).includes(foldSearchText(text)),
    )
    .sort((a, b) =>
      order === "quantidade"
        ? b.count - a.count || a.value.localeCompare(b.value, "pt-BR")
        : a.value.localeCompare(b.value, "pt-BR") || a.city.localeCompare(b.city, "pt-BR"),
    );
  return (
    <div className="cs-container cs-content-page cs-district-directory">
      <PageIntro
        eyebrow="Perto do que importa"
        title="Bairros e loteamentos"
        description="Escolha a região e encontre os imóveis públicos disponíveis. Os nomes seguem o cadastro, sem unir regiões diferentes."
      />
      <div className="cs-directory-controls">
        <label className="cs-field">
          <span>Buscar bairro ou loteamento</span>
          <input
            type="search"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Nome da região ou cidade"
          />
        </label>
        <label className="cs-field">
          <span>Cidade</span>
          <select value={city} onChange={(event) => setCity(event.target.value)}>
            <option value="">Todas as cidades</option>
            {facets.cities.map((item) => (
              <option key={item.value} value={item.value}>
                {item.value}
              </option>
            ))}
          </select>
        </label>
        <label className="cs-field">
          <span>Finalidade</span>
          <select
            value={operation}
            onChange={(event) => setOperation(event.target.value as typeof operation)}
          >
            <option value="">Comprar ou alugar</option>
            <option value="venda">Comprar</option>
            <option value="aluguel">Alugar</option>
          </select>
        </label>
        <label className="cs-field">
          <span>Tipo de imóvel</span>
          <select value={type} onChange={(event) => setType(event.target.value)}>
            <option value="">Todos os tipos</option>
            {facets.types.map((item) => (
              <option key={item.value} value={item.value}>
                {item.value}
              </option>
            ))}
          </select>
        </label>
        <label className="cs-field">
          <span>Ordenar regiões</span>
          <select value={order} onChange={(event) => setOrder(event.target.value)}>
            <option value="nome">Nome A–Z</option>
            <option value="quantidade">Quantidade de imóveis</option>
          </select>
        </label>
      </div>
      <p role="status" className="cs-directory-status">
        {pending
          ? "Atualizando as regiões. Abaixo, o último recorte confirmado."
          : `${districts.length} ${districts.length === 1 ? "região encontrada" : "regiões encontradas"}. Quantidades de imóveis públicos no recorte confirmado.`}
      </p>
      {failure === key && (
        <p className="cs-inline-state" role="alert">
          Não foi possível atualizar as regiões. O recorte anterior foi preservado.{" "}
          <button type="button" onClick={() => setRetry((value) => value + 1)}>
            Tentar novamente
          </button>
        </p>
      )}
      <div className="cs-district-grid" aria-busy={pending}>
        {districts.map((district) => (
          <SiteLink
            className="cs-district-card"
            key={`${district.city}:${district.value}`}
            to={sitePath(
              `/buscar?${searchParams({ ...confirmed.criteria, cidade: district.city, bairro: district.value, pagina: 1 })}`,
            )}
          >
            <div>
              <small>{district.city} · Região cadastrada</small>
              <h2>{district.value}</h2>
              <span>
                {district.count}{" "}
                {district.count === 1 ? "imóvel disponível" : "imóveis disponíveis"}
              </span>
            </div>
            <ArrowUpRight />
          </SiteLink>
        ))}
      </div>
      {!pending && districts.length === 0 && (
        <p className="cs-inline-state">
          Nenhuma região corresponde a este recorte. Ajuste a busca ou remova um filtro.
        </p>
      )}
      {pages.length > 0 && (
        <section className="cs-section">
          <h2>Conheça a região</h2>
          {pages.map((page) => (
            <SiteLink
              className="cs-article-card"
              key={page.slug}
              to={sitePath(`/informacoes/${page.slug}`)}
            >
              <h3>{page.title}</h3>
              <p>{page.summary}</p>
              <ArrowUpRight />
            </SiteLink>
          ))}
        </section>
      )}
    </div>
  );
}
export function NewsPage({ pages }: { pages: SitePage[] }) {
  const config = getSiteBrand(useSiteBrand());
  return (
    <div className="cs-container cs-content-page">
      <PageIntro
        eyebrow="Conexões e novidades"
        title="O que acontece por aqui."
        description={`Notícias e conteúdos publicados pela equipe ${config.shortName}.`}
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
  const brand = useSiteBrand();
  return brand === "cordial" ? <CordialFavoritesPage /> : <ExistingFavoritesPage />;
}
function CordialFavoritesPage() {
  const [items, setItems] = useState<PublicProperty[]>([]);
  const [missing, setMissing] = useState(0);
  const [pending, setPending] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [progress, setProgress] = useState({ read: 0, total: 0 });
  useEffect(() => {
    const requests = latestRequest();
    let active: AbortController | null = null;
    async function refresh() {
      active?.abort();
      const abort = new AbortController();
      active = abort;
      const request = requests.next();
      const ids = readFavorites("cordial");
      setPending(true);
      setFailed(false);
      setMissing(0);
      setProgress({ read: 0, total: ids.length });
      setItems((old) => old.filter((item) => ids.includes(item.id)));
      const loaded: PublicProperty[] = [];
      let missingCount = 0;
      try {
        for (let offset = 0; offset < ids.length; offset += 20) {
          const result = await loadSummaries(
            ids.slice(offset, offset + 20),
            abort.signal,
            "cordial",
          );
          if (abort.signal.aborted || !requests.current(request)) return;
          loaded.push(...result.items);
          missingCount += result.missingIds.length;
          setItems([...loaded]);
          setMissing(missingCount);
          setProgress({ read: Math.min(offset + 20, ids.length), total: ids.length });
        }
        if (!ids.length) setItems([]);
      } catch {
        if (!abort.signal.aborted && requests.current(request)) setFailed(true);
      } finally {
        if (!abort.signal.aborted && requests.current(request)) setPending(false);
      }
    }
    const storage = (event: StorageEvent) => {
      if (!event.key || event.key === getSiteBrand("cordial").favoritesKey) void refresh();
    };
    void refresh();
    window.addEventListener(getSiteBrand("cordial").favoritesEvent, refresh);
    window.addEventListener("storage", storage);
    window.addEventListener("cordial:availability-refresh", refresh);
    return () => {
      active?.abort();
      requests.invalidate();
      window.removeEventListener(getSiteBrand("cordial").favoritesEvent, refresh);
      window.removeEventListener("storage", storage);
      window.removeEventListener("cordial:availability-refresh", refresh);
    };
  }, [retry]);
  return (
    <div className="cs-container cs-content-page">
      <PageIntro
        eyebrow="Guardados por você"
        title="Seus imóveis favoritos"
        description="Os corações ficam neste navegador, entre visitas. Para enviar um conjunto a alguém, use Minha seleção."
      />
      {pending && (
        <p role="status">
          Atualizando a disponibilidade… {progress.read} de {progress.total} favoritos consultados.
        </p>
      )}
      {failed && (
        <p className="cs-inline-state" role="alert">
          Não foi possível consultar todos os favoritos. Os itens já carregados continuam
          disponíveis.{" "}
          <button type="button" onClick={() => setRetry((value) => value + 1)}>
            Tentar novamente
          </button>
        </p>
      )}
      {missing > 0 && (
        <p role="status">
          {missing} {missing === 1 ? "favorito está indisponível" : "favoritos estão indisponíveis"}{" "}
          no catálogo atual.
        </p>
      )}
      {items.length > 0 ? (
        <div className="cs-property-grid" aria-busy={pending}>
          {items.map((property) => (
            <PropertyCard key={property.id} property={property} />
          ))}
        </div>
      ) : (
        !pending &&
        !failed && (
          <div className="cs-state">
            <Heart size={38} />
            <h2>Guarde o que combina com você.</h2>
            <p>Toque no coração de um imóvel para encontrá-lo aqui na próxima visita.</p>
            <SiteLink className="cs-button" to={sitePath("/buscar")}>
              Explorar imóveis <ArrowRight size={18} />
            </SiteLink>
          </div>
        )
      )}
    </div>
  );
}
function ExistingFavoritesPage() {
  const brand = useSiteBrand();
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
        const ids = readFavorites(brand);
        for (let i = 0; i < ids.length; i += 4) {
          const batch = await Promise.all(
            ids.slice(i, i + 4).map((id) => loadDetail(id, abort.signal, brand)),
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
    window.addEventListener(getSiteBrand(brand).favoritesEvent, refresh);
    return () => {
      disposed = true;
      abort.abort();
      window.removeEventListener(getSiteBrand(brand).favoritesEvent, refresh);
    };
  }, [brand]);
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
