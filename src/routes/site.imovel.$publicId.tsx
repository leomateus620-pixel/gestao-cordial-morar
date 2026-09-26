import { createFileRoute, notFound } from "@tanstack/react-router";
import { loadCatalog, loadDetail, loadDetailState } from "@/lib/cordial-site/data";
import { detailHead, siteHead, listingJsonLd, siteMatchData } from "@/lib/cordial-site/seo";
import { safeJsonLd, sitePath } from "@/lib/cordial-site/presentation";
import { DetailPage } from "@/components/cordial-site/DetailPage";
import { SiteLink, SiteError, SitePending } from "@/components/cordial-site/SiteShell";
import { useSite } from "@/lib/cordial-site/context";
export const Route = createFileRoute("/site/imovel/$publicId")({
  loader: async ({ params, abortController }) => {
    const property = await loadDetail(params.publicId, abortController.signal);
    if (!property) {
      const status = await loadDetailState(params.publicId, abortController.signal);
      if (status === "missing") throw notFound();
      return { property: null, related: null };
    }
    let related = null;
    try {
      related = await loadCatalog(
        {
          cidade: property.city ?? undefined,
          tipo: property.type ?? undefined,
          finalidade: property.operation,
        },
        abortController.signal,
      );
    } catch {
      /* Related offers must not hide the requested property. */
    }
    return { property, related };
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
        <DetailPage property={data.property} related={data.related} />
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
