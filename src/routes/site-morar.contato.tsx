import { createFileRoute } from "@tanstack/react-router";
import { ContactPage } from "@/components/cordial-site/ContentPages";
import { siteHead, siteMatchData } from "@/lib/cordial-site/morar-seo";
export const Route = createFileRoute("/site-morar/contato")({
  head: ({ matches }) =>
    siteHead(
      "Fale com a Morar",
      "Entre em contato com a equipe Morar.",
      siteMatchData(matches),
      "/site-morar/contato",
    ),
  component: ContactPage,
});
