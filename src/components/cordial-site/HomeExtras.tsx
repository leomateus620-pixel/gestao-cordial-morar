import { useSite, useSiteBrand } from "@/lib/cordial-site/context";
import { activeBanners } from "@/lib/cordial-site/banners";
import { searchParams } from "@/lib/cordial-site/contract";
import { sitePath } from "@/lib/cordial-site/presentation";
import { SiteLink } from "./SiteShell";

/** Atalhos de busca rápida e banners programados, configurados por marca no painel. */
export function HomeExtras() {
  const { settings } = useSite();
  const brand = useSiteBrand();
  const banners = activeBanners(settings.banners);
  const quick = settings.quickSearches ?? [];
  if (!banners.length && !quick.length) return null;
  return (
    <>
      {quick.length > 0 && (
        <nav className="cs-container cs-quick" aria-label="Buscas rápidas">
          {quick.map((q) => (
            <SiteLink
              key={q.label}
              className="cs-quick-chip"
              to={`${sitePath("/buscar", brand)}?${searchParams({
                finalidade: q.finalidade,
                ...(q.tipo ? { tipo: q.tipo } : {}),
                ...(q.cidade ? { cidade: q.cidade } : {}),
                ...(q.bairro ? { bairro: q.bairro } : {}),
              })}`}
            >
              {q.label}
            </SiteLink>
          ))}
        </nav>
      )}
      {banners.length > 0 && (
        <section className="cs-container cs-banners" aria-label="Campanhas">
          {banners.map((b, i) => {
            const img = (
              <picture>
                {b.mobileImageUrl && <source media="(max-width: 640px)" srcSet={b.mobileImageUrl} />}
                <img
                  src={b.imageUrl}
                  alt={b.alt}
                  loading={i === 0 ? "eager" : "lazy"}
                  decoding="async"
                  width={1600}
                  height={500}
                />
              </picture>
            );
            const body = (
              <>
                {img}
                {(b.title || b.caption) && (
                  <span className="cs-banner-copy">
                    {b.title && <strong>{b.title}</strong>}
                    {b.caption && <span>{b.caption}</span>}
                  </span>
                )}
              </>
            );
            if (!b.href) return <div key={b.id} className="cs-banner">{body}</div>;
            return b.href.startsWith("https://") ? (
              <a key={b.id} className="cs-banner" href={b.href} rel="noopener" target="_blank">
                {body}
              </a>
            ) : (
              <SiteLink key={b.id} className="cs-banner" to={sitePath(b.href, brand)}>
                {body}
              </SiteLink>
            );
          })}
        </section>
      )}
    </>
  );
}
