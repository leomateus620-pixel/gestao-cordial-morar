import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { parsePropertyParam, propertySlug } from "@/lib/cordial-site/property-slug";
import { breadcrumbJsonLd } from "@/lib/cordial-site/seo";
import { loadDetail, loadDetailState } from "@/lib/cordial-site/data";
import { detailHead, siteHead, listingJsonLd, siteMatchData } from "@/lib/cordial-site/seo";
import { safeJsonLd, sitePath } from "@/lib/cordial-site/presentation";
import { DetailPage } from "@/components/cordial-site/DetailPage";
import { SiteLink, SiteError, SitePending } from "@/components/cordial-site/SiteShell";
import { useSite } from "@/lib/cordial-site/context";
export const Route = createFileRoute("/site/imovel/$publicId")({
  loader: async ({ params, abortController }) => {
    const id = parsePropertyParam(params.publicId);
    if (!id) throw notFound();
    const property = await loadDetail(id, abortController.signal);
    if (property && params.publicId !== propertySlug(property))
      throw redirect({
        to: "/site/imovel/$publicId",
        params: { publicId: propertySlug(property) },
        statusCode: 301,
      });
    if (!property) {
      const status = await loadDetailState(id, abortController.signal);
      if (status === "missing") throw notFound();
      return { property: null };
    }
    // Recommendations are secondary and load inside DetailPage after the useful
    // SSR property. Their failure never delays this route or its SEO content.
    return { property };
  },
  headers: ({ loaderData }) =>
    loaderData && !loaderData.property ? { "X-Cordial-Page-Status": "410" } : undefined,
  head: ({ loaderData, matches }) =>
    loaderData?.property
      ? detailHead(loaderData.property, siteMatchData(matches))
      : siteHead(
          "Imóvel indisponível",
          "Este imóvel não está disponível no catálogo.",
          siteMatchData(matches),
          "/site/buscar",
          true,
        ),
  component: function SiteRoute() {
    const data = Route.useLoaderData();
    const site = useSite();
    if (!data.property)
      return (
        <div className="cs-container cs-state">
          <p className="cs-eyebrow">Imóvel indisponível</p>
          <h1>Este imóvel saiu do catálogo.</h1>
          <p>A oferta anterior não está disponível. Encontre outras possibilidades na busca.</p>
          <SiteLink className="cs-button" to={sitePath("/buscar")}>
            Explorar imóveis
          </SiteLink>
        </div>
      );
    return (
      <>
        {site.canonicalOrigin && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: safeJsonLd(listingJsonLd(data.property, site.canonicalOrigin)),
            }}
          />
        )}
        {site.canonicalOrigin && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: safeJsonLd(breadcrumbJsonLd(data.property, site.canonicalOrigin)),
            }}
          />
        )}
        <DetailPage key={data.property.id} property={data.property} />
      </>
    );
  },
  notFoundComponent: () => (
    <div className="cs-container cs-state">
      <p className="cs-eyebrow">Anúncio não encontrado</p>
      <h1>Vamos encontrar outras possibilidades.</h1>
      <p>Confira o endereço ou encontre um imóvel pela pesquisa.</p>
      <SiteLink className="cs-button" to={sitePath("/buscar")}>
        Explorar imóveis
      </SiteLink>
    </div>
  ),
  errorComponent: ({ reset }) => <SiteError reset={reset} />,
  pendingComponent: SitePending,
});
