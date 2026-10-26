import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  importCampaignFromLink,
  importDiscoveredMetaCampaign,
  listAdConnections,
  listAdSyncJobs,
  listMetaCampaigns,
  startAdOAuth,
  syncCampaign,
  type AdConnectionPublic,
} from "@/lib/ads/ads.functions";
import { useSession } from "@/lib/auth-mock";
import { isAdminUser } from "@/lib/access-control";
import { useApp } from "@/store/app-store";
import { parseCampaignLink } from "@/lib/ads/link-parser";
import type { AdPlatform } from "@/lib/ads/types";

type ImportInput = {
  connectionId?: string;
  accountId?: string;
  url: string;
  imobiliaria: "cordial" | "morar";
  range: { since: string; until: string };
};
export function useAds(campaignIds: string[] = []) {
  const qc = useQueryClient(),
    session = useSession(),
    agency = useApp((s) => s.agency);
  const list = useServerFn(listAdConnections),
    doImport = useServerFn(importCampaignFromLink),
    doSync = useServerFn(syncCampaign),
    doStart = useServerFn(startAdOAuth);
  const discover = useServerFn(listMetaCampaigns),
    importDiscovered = useServerFn(importDiscoveredMetaCampaign),
    getJobs = useServerFn(listAdSyncJobs);
  useEffect(
    () => () => {
      if (session?.id)
        qc.removeQueries({
          predicate: (query) =>
            query.queryKey[0] === "marketing" && query.queryKey.includes(session.id),
        });
    },
    [qc, session?.id, session?.perfil],
  );
  const key = ["marketing", "ad-connections", session?.id, session?.perfil, agency];
  const connections = useQuery<AdConnectionPublic[]>({
    queryKey: key,
    queryFn: () => list(),
    enabled: isAdminUser(session),
    staleTime: 60_000,
  });
  const jobs = useQuery({
    queryKey: ["marketing", "sync-jobs", session?.id, session?.perfil, agency, campaignIds],
    queryFn: () => getJobs({ data: { campaignIds } }),
    enabled: Boolean(session) && campaignIds.length > 0,
    refetchInterval: (q) =>
      q.state.data?.some((j: { status: string }) => ["queued", "running"].includes(j.status))
        ? 5000
        : false,
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["marketing", "campaigns"] });
    void qc.invalidateQueries({ queryKey: ["marketing", "sync-jobs"] });
  };
  useEffect(() => {
    if (jobs.data?.length) void qc.invalidateQueries({ queryKey: ["marketing", "campaigns"] });
  }, [jobs.dataUpdatedAt, jobs.data?.length, qc]);
  const importMutation = useMutation({
    mutationFn: (v: ImportInput) => doImport({ data: v }),
    onSuccess: refresh,
  });
  const syncMutation = useMutation({
    mutationFn: (v: { id: string; range: { since: string; until: string } }) => doSync({ data: v }),
    onSettled: refresh,
  });
  const discoveredMutation = useMutation({
    mutationFn: (v: {
      connectionId: string;
      accountId: string;
      campaignId: string;
      imobiliaria: "cordial" | "morar";
      range: { since: string; until: string };
    }) => importDiscovered({ data: v }),
    onSuccess: refresh,
  });
  async function connect(platform: AdPlatform, imobiliaria?: "cordial" | "morar" | null) {
    const r = await doStart({ data: { platform, imobiliaria } });
    if (r.ok) window.location.href = r.url;
    return r;
  }
  return {
    connections: (connections.data ?? []).filter(
      (c) => !c.imobiliaria || agency === "todas" || c.imobiliaria === agency,
    ),
    connectionsLoading: connections.isLoading,
    importCampaign: async (input: ImportInput) => {
      const parsed = parseCampaignLink(input.url);
      if (!parsed.platform || !parsed.campaignId) throw new Error("Link de campanha inválido.");
      const account = input.accountId?.replace(/^act_/, "") || parsed.accountId;
      const safeUrl =
        parsed.platform === "meta"
          ? `https://adsmanager.facebook.com/adsmanager/manage/campaigns?selected_campaign_ids=${parsed.campaignId}${account ? `&act=${account}` : ""}`
          : `https://ads.google.com/aw/campaigns?campaignId=${parsed.campaignId}${account ? `&customerId=${account}` : ""}`;
      return importMutation.mutateAsync({ ...input, url: safeUrl });
    },
    importing: importMutation.isPending || discoveredMutation.isPending,
    syncCampaign: syncMutation.mutateAsync,
    connect,
    discoverCampaigns: (data: { connectionId: string; accountId: string }) => discover({ data }),
    importDiscoveredCampaign: discoveredMutation.mutateAsync,
    jobs: jobs.data ?? [],
  };
}
