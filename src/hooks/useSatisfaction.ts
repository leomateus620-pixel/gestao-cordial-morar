import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  createSatisfactionSurvey,
  deleteSatisfactionSurvey,
  getSatisfactionStats,
  listSatisfactionSurveys,
} from "@/lib/satisfaction/satisfaction.functions";

export function useSatisfactionSurveys() {
  const list = useServerFn(listSatisfactionSurveys);
  return useQuery({
    queryKey: ["satisfaction", "surveys"],
    queryFn: () => list(),
    staleTime: 15_000,
  });
}

export function useSatisfactionStats() {
  const fn = useServerFn(getSatisfactionStats);
  return useQuery({
    queryKey: ["satisfaction", "stats"],
    queryFn: () => fn(),
    staleTime: 15_000,
  });
}

export function useCreateSatisfactionSurvey() {
  const qc = useQueryClient();
  const create = useServerFn(createSatisfactionSurvey);
  return useMutation({
    mutationFn: (data: Parameters<typeof create>[0]["data"]) => create({ data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["satisfaction"] });
    },
  });
}

export function useDeleteSatisfactionSurvey() {
  const qc = useQueryClient();
  const del = useServerFn(deleteSatisfactionSurvey);
  return useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["satisfaction"] });
    },
  });
}
