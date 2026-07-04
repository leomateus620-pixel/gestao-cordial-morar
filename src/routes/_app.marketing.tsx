import { createFileRoute } from "@tanstack/react-router";
import { MarketingDashboard } from "@/components/marketing/MarketingDashboard";
import { useApp, useFiltered } from "@/store/app-store";

export const Route = createFileRoute("/_app/marketing")({
  head: () => ({ meta: [{ title: "Marketing | Gestão Cordial" }] }),
  component: Page,
});

function Page() {
  const campaigns = useFiltered(useApp((state) => state.campanhasMarketing));
  const agency = useApp((state) => state.agency);

  return <MarketingDashboard campaigns={campaigns} agency={agency} />;
}
