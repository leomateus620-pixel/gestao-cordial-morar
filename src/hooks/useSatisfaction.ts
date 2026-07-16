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

type CreateInput = {
  corretor_id: string;
  client_id?: string | null;
  client_nome: string;
  client_contato?: string | null;
  contexto?: string | null;
};

export function useCreateSatisfactionSurvey() {
  const qc = useQueryClient();
  const create = useServerFn(createSatisfactionSurvey);
  return useMutation({
    mutationFn: (data: CreateInput) => create({ data }),
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
