import { createFileRoute, useRouter } from "@tanstack/react-router";
import { SharedVisitorSelectionPage } from "@/components/cordial-site/VisitorSelectionPage";
import { getVisitorSelection } from "@/lib/selecoes/visitor.functions";
import { siteHead, siteMatchData } from "@/lib/cordial-site/seo";

export const Route = createFileRoute("/site/selecao/$token")({
  loader: ({ params }) => getVisitorSelection({ data: { token: params.token } }),
  staleTime: 0,
  gcTime: 0,
  headers: () => ({ "Cache-Control": "no-store, private", "X-Robots-Tag": "noindex, nofollow" }),
  head: ({ matches }) =>
    siteHead(
      "Seleção de imóveis",
      "Imóveis selecionados para compartilhar.",
      siteMatchData(matches),
      "/site/selecao",
      true,
    ),
  component: function SharedSelectionRoute() {
    const router = useRouter();
    return (
      <SharedVisitorSelectionPage
        selection={Route.useLoaderData()}
        retry={() => {
          void router.invalidate();
        }}
      />
    );
  },
});
