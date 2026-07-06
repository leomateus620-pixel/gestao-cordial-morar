import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  createCampaign as createFn,
  deleteCampaign as deleteFn,
  listCampaigns,
  updateCampaign as updateFn,
  upsertDailyMetric as upsertFn,
  type CampaignInput,
  type DailyMetricInput,
} from "@/lib/marketing/marketing.functions";
import type { MarketingCampaign } from "@/types/marketing";

const KEY = ["marketing", "campaigns"] as const;

export function useMarketing() {
  const qc = useQueryClient();
  const list = useServerFn(listCampaigns);
  const create = useServerFn(createFn);
  const update = useServerFn(updateFn);
  const remove = useServerFn(deleteFn);
  const upsertDaily = useServerFn(upsertFn);

  const query = useQuery<MarketingCampaign[]>({
    queryKey: KEY,
    queryFn: () => list(),
    staleTime: 30_000,
  });

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: KEY });
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
    campaigns: query.data ?? [],
    isLoading: query.isLoading,
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
