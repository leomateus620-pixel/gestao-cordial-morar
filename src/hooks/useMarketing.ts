import { useCallback, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  createCampaign as createFn,
  deleteCampaign as deleteFn,
  listCampaignPage,
  updateCampaign as updateFn,
  upsertDailyMetric as upsertFn,
  type CampaignInput,
  type DailyMetricInput,
  type MarketingQuery,
} from "@/lib/marketing/marketing.functions";
import { useSession } from "@/lib/auth-mock";
import { useApp } from "@/store/app-store";
import { readAllCampaigns } from "@/lib/marketing/read-all-campaigns";

export function useMarketing(filters: MarketingQuery = {}, options: { allPages?: boolean } = {}) {
  const allPages = options.allPages === true;
  const qc = useQueryClient();
  const session = useSession();
  const agency = useApp((s) => s.agency);
  const list = useServerFn(listCampaignPage),
    create = useServerFn(createFn),
    update = useServerFn(updateFn),
    remove = useServerFn(deleteFn),
    upsertDaily = useServerFn(upsertFn);
  const sessionId = session?.id,
    sessionProfile = session?.perfil;
  const previousIdentity = useRef<{ id: string; profile: string } | null>(null);
  useEffect(() => {
    const previous = previousIdentity.current;
    if (previous && (previous.id !== sessionId || previous.profile !== sessionProfile))
      qc.removeQueries({
        predicate: (query) =>
          query.queryKey[0] === "marketing" && query.queryKey.includes(previous.id),
      });
    previousIdentity.current =
      sessionId && sessionProfile ? { id: sessionId, profile: sessionProfile } : null;
  }, [qc, sessionId, sessionProfile]);
  const scope = {
    ...filters,
    imobiliaria:
      "imobiliaria" in filters ? filters.imobiliaria : agency === "todas" ? null : agency,
  };
  const query = useQuery({
    queryKey: ["marketing", "campaigns", session?.id, session?.perfil, scope, allPages],
    queryFn: () => allPages
      ? readAllCampaigns((data) => list({ data }), scope)
      : list({ data: scope }),
    enabled: Boolean(session),
    staleTime: 30_000,
    placeholderData: (previous, previousQuery) => {
      if (allPages) return undefined;
      const oldKey = previousQuery?.queryKey;
      const oldScope = oldKey?.[4] as MarketingQuery | undefined;
      return oldKey?.[5] === allPages &&
        oldKey?.[2] === session?.id &&
        oldKey?.[3] === session?.perfil &&
        oldScope?.imobiliaria === scope.imobiliaria &&
        oldScope?.accountId === scope.accountId
        ? previous
        : undefined;
    },
  });
  const invalidate = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["marketing", "campaigns"] });
  }, [qc]);
  const createMutation = useMutation({
    mutationFn: (input: CampaignInput) => create({ data: input }),
    onSuccess: invalidate,
  });
  const updateMutation = useMutation({
    mutationFn: (vars: { id: string; input: CampaignInput }) => update({ data: vars }),
    onSuccess: invalidate,
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: invalidate,
  });
  const dailyMutation = useMutation({
    mutationFn: (input: DailyMetricInput) => upsertDaily({ data: input }),
    onSuccess: invalidate,
  });
  return {
    summary: query.data?.summary,
    campaigns: query.data?.items ?? [],
    total: query.data?.total ?? 0,
    financialVisible: query.data?.financialVisible ?? false,
    isLoading: query.isLoading,
    isRefreshing: query.isFetching && !query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: invalidate,
    createCampaign: createMutation.mutateAsync,
    updateCampaign: updateMutation.mutateAsync,
    deleteCampaign: deleteMutation.mutateAsync,
    upsertDailyMetric: dailyMutation.mutateAsync,
    isSaving:
      createMutation.isPending ||
      updateMutation.isPending ||
      deleteMutation.isPending ||
      dailyMutation.isPending,
  };
}
