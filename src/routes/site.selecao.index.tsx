import { createFileRoute } from "@tanstack/react-router";
import { VisitorSelectionPage } from "@/components/cordial-site/VisitorSelectionPage";
import { siteHead, siteMatchData } from "@/lib/cordial-site/seo";

export const Route = createFileRoute("/site/selecao/")({
  head: ({ matches }) =>
    siteHead(
      "Minha seleção",
      "Separe imóveis e compartilhe suas escolhas.",
      siteMatchData(matches),
      "/site/selecao",
      true,
    ),
  component: VisitorSelectionPage,
});
