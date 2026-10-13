import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  importCampaignFromLink,
  listAdConnections,
  startAdOAuth,
  syncCampaign,
  type AdConnectionPublic,
} from "@/lib/ads/ads.functions";
import type { AdPlatform } from "@/lib/ads/types";

export function useAds() {
  const qc = useQueryClient();
  const list = useServerFn(listAdConnections);
  const doImport = useServerFn(importCampaignFromLink);
  const doSync = useServerFn(syncCampaign);
  const doStart = useServerFn(startAdOAuth);

  const connections = useQuery<AdConnectionPublic[]>({
    queryKey: ["marketing", "ad-connections"],
    queryFn: () => list(),
    staleTime: 60_000,
  });
  const refreshCampaigns = () => qc.invalidateQueries({ queryKey: ["marketing", "campaigns"] });

  const importMutation = useMutation({
    mutationFn: (v: { url: string; imobiliaria: "cordial" | "morar"; range: { since: string; until: string } }) =>
      doImport({ data: v }),
    onSuccess: (r) => {
      if (r.ok) refreshCampaigns();
      else qc.invalidateQueries({ queryKey: ["marketing", "ad-connections"] });
    },
  });
  const syncMutation = useMutation({
    mutationFn: (v: { id: string; range: { since: string; until: string } }) => doSync({ data: v }),
    onSettled: refreshCampaigns,
  });

  async function connect(platform: AdPlatform, imobiliaria?: "cordial" | "morar" | null) {
    const r = await doStart({ data: { platform, imobiliaria } });
    if (r.ok) window.location.href = r.url;
    return r;
  }

  return {
    connections: connections.data ?? [],
    connectionsLoading: connections.isLoading,
    importCampaign: importMutation.mutateAsync,
    importing: importMutation.isPending,
    syncCampaign: syncMutation.mutateAsync,
    connect,
  };
}
