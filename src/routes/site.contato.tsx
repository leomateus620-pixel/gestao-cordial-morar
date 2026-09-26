import { createFileRoute } from "@tanstack/react-router";
import { ContactPage } from "@/components/cordial-site/ContentPages";
import { siteHead, siteMatchData } from "@/lib/cordial-site/seo";
export const Route = createFileRoute("/site/contato")({
  head: ({ matches }) =>
    siteHead(
      "Fale com a Cordial",
      "Entre em contato com a equipe Cordial.",
      siteMatchData(matches),
      "/site/contato",
    ),
  component: ContactPage,
});
