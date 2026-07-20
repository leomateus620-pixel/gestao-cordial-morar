import { useCallback, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  calculateAgenciamentosSummary,
  canEditAgenciamento,
  filterAgenciamentos,
  getAgenciamentosVisibleToUser,
  getDefaultAgenciamentoFilters,
  rankAgenciamentosByCorretor,
  validateAgenciamentoInput,
} from "@/services/agenciamentos";
import {
  createAgenciamento as createAgenciamentoFn,
  deleteAgenciamento as deleteAgenciamentoFn,
  listAgenciamentos,
  updateAgenciamento as updateAgenciamentoFn,
  validateAgenciamentoFn,
} from "@/lib/agenciamentos/agenciamentos.functions";
import { useSession } from "@/lib/auth-mock";
import { hasPermission } from "@/lib/mock/permissions";
import { useApp } from "@/store/app-store";
import type {
  Agenciamento,
  AgenciamentoFiltersState,
  AgenciamentoInput,
} from "@/types/agenciamento";
import type { Corretor } from "@/types/corretor";

type UseAgenciamentosOptions = {
  initialFilters?: Partial<AgenciamentoFiltersState>;
  skipDashboard?: boolean;
};

function normalizePersonName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function resolveCurrentBroker(
  sessionName: string | undefined,
  sessionInitials: string | undefined,
  corretores: Corretor[],
) {
  if (!sessionName && !sessionInitials) return undefined;
  const normalizedName = normalizePersonName(sessionName ?? "");
  return corretores.find((corretor) => {
    const brokerName = normalizePersonName(corretor.nome);
    return (
      corretor.iniciais === sessionInitials ||
      brokerName === normalizedName ||
      brokerName.startsWith(`${normalizedName} `)
    );
  });
}

export function useAgenciamentos(options: UseAgenciamentosOptions = {}) {
  const session = useSession();
  const queryClient = useQueryClient();
  const corretores = useApp(useShallow((state) => state.corretores));

  const list = useServerFn(listAgenciamentos);
  const createFn = useServerFn(createAgenciamentoFn);
  const updateFn = useServerFn(updateAgenciamentoFn);
  const validateFn = useServerFn(validateAgenciamentoFn);
  const removeFn = useServerFn(deleteAgenciamentoFn);

  const enabled = Boolean(session);
  const query = useQuery<Agenciamento[]>({
    queryKey: ["agenciamentos"],
    queryFn: () => list(),
    enabled,
    staleTime: 30_000,
  });

  const rawAgenciamentos = useMemo(() => query.data ?? [], [query.data]);

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["agenciamentos"] });
  }, [queryClient]);

  const createMutation = useMutation({
    mutationFn: (input: AgenciamentoInput) => createFn({ data: input }),
    onSuccess: invalidate,
  });
  const updateMutation = useMutation({
    mutationFn: (vars: { id: string; patch: Partial<AgenciamentoInput> }) =>
      updateFn({ data: vars }),
    onSuccess: invalidate,
  });
  const validateMutation = useMutation({
    mutationFn: (vars: { id: string; validadoPorNome?: string }) => validateFn({ data: vars }),
    onSuccess: invalidate,
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => removeFn({ data: { id } }),
    onSuccess: invalidate,
  });

  const [filters, setFilterState] = useState<AgenciamentoFiltersState>(() => ({
    ...getDefaultAgenciamentoFilters(),
    ...options.initialFilters,
  }));

  const canRead = Boolean(
    session &&
    (session.permissions.includes("agenciamentos:read") ||
      hasPermission(session.perfil, "agenciamentos:read")),
  );
  const canCreate = Boolean(
    session &&
    (session.permissions.includes("agenciamentos:write") ||
      hasPermission(session.perfil, "agenciamentos:write")),
  );
  const canManage = Boolean(
    session &&
    (session.permissions.includes("agenciamentos:manage") ||
      hasPermission(session.perfil, "agenciamentos:manage")),
  );
  const isAdmin = session?.perfil === "admin_owner" && canManage;
  const isAdminLike =
    session?.perfil === "admin_owner" || session?.perfil === "secretaria";


  const currentBroker = useMemo(
    () => resolveCurrentBroker(session?.nome, session?.iniciais, corretores),
    [corretores, session?.iniciais, session?.nome],
  );

  // Effective broker id: real corretor record match, or fallback to auth user id.
  const effectiveBrokerId = currentBroker?.id ?? session?.id;
  const effectiveBrokerNome = currentBroker?.nome ?? session?.nome ?? "";

  const visibleAgenciamentos = useMemo(
    () => getAgenciamentosVisibleToUser(rawAgenciamentos, session, effectiveBrokerId),
    [effectiveBrokerId, rawAgenciamentos, session],
  );

  const effectiveFilters = useMemo(
    () => ({
      ...filters,
      corretorId: isAdmin ? filters.corretorId : (effectiveBrokerId ?? "__sem_corretor__"),
    }),
    [effectiveBrokerId, filters, isAdmin],
  );

  const agenciamentos = useMemo(
    () => filterAgenciamentos(visibleAgenciamentos, effectiveFilters),
    [effectiveFilters, visibleAgenciamentos],
  );

  const summary = useMemo(() => calculateAgenciamentosSummary(agenciamentos), [agenciamentos]);

  const ranking = useMemo(
    () => (isAdmin ? rankAgenciamentosByCorretor(agenciamentos).slice(0, 3) : []),
    [agenciamentos, isAdmin],
  );

  const dashboardAgenciamentos = useMemo(
    () => (options.skipDashboard || !isAdmin ? [] : filterAgenciamentos(visibleAgenciamentos)),
    [isAdmin, options.skipDashboard, visibleAgenciamentos],
  );

  const dashboardSummary = useMemo(
    () => calculateAgenciamentosSummary(dashboardAgenciamentos),
    [dashboardAgenciamentos],
  );

  const dashboardRanking = useMemo(
    () => rankAgenciamentosByCorretor(dashboardAgenciamentos).slice(0, 3),
    [dashboardAgenciamentos],
  );

  const setFilters = useCallback((patch: Partial<AgenciamentoFiltersState>) => {
    setFilterState((current) => ({ ...current, ...patch }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilterState(getDefaultAgenciamentoFilters());
  }, []);

  const validateInput = useCallback(
    (input: AgenciamentoInput) => validateAgenciamentoInput(input, canManage),
    [canManage],
  );

  const create = useCallback(
    async (input: AgenciamentoInput) => {
      if (!session || !canCreate) return undefined;

      const forcedBroker = !canManage
        ? {
            corretorId: effectiveBrokerId ?? session.id,
            corretorNome: effectiveBrokerNome || session.nome,
          }
        : {};
      const safeInput: AgenciamentoInput = {
        ...input,
        ...forcedBroker,
        checklist: {
          ...input.checklist,
          validado: canManage ? input.checklist.validado : false,
        },
        status: canManage && input.checklist.validado ? "validado" : input.status,
        criadoPorId: session.id,
        criadoPorNome: session.nome,
      };

      try {
        const created = await createMutation.mutateAsync(safeInput);
        return created.id;
      } catch (error) {
        console.error("[agenciamentos] create failed", error);
        throw error;
      }
    },
    [canCreate, canManage, createMutation, effectiveBrokerId, effectiveBrokerNome, session],
  );

  const update = useCallback(
    async (id: string, patch: Partial<AgenciamentoInput>) => {
      if (!session) return false;
      const current = rawAgenciamentos.find((item) => item.id === id);
      if (!current || !canEditAgenciamento(current, session, effectiveBrokerId)) return false;

      const safePatch: Partial<AgenciamentoInput> = canManage
        ? patch
        : {
            ...patch,
            corretorId: current.corretorId,
            corretorNome: current.corretorNome,
            checklist: {
              ...current.checklist,
              ...patch.checklist,
              validado: current.checklist.validado,
            },
            status: patch.status === "validado" ? current.status : patch.status,
          };

      try {
        await updateMutation.mutateAsync({ id, patch: safePatch });
        return true;
      } catch (error) {
        console.error("[agenciamentos] update failed", error);
        return false;
      }
    },
    [canManage, effectiveBrokerId, rawAgenciamentos, session, updateMutation],
  );

  const validate = useCallback(
    async (id: string) => {
      if (!session || !canManage) return false;
      try {
        await validateMutation.mutateAsync({ id, validadoPorNome: session.nome });
        return true;
      } catch (error) {
        console.error("[agenciamentos] validate failed", error);
        return false;
      }
    },
    [canManage, session, validateMutation],
  );

  const remove = useCallback(
    async (id: string) => {
      if (!session || !canManage) return false;
      try {
        await deleteMutation.mutateAsync(id);
        return true;
      } catch (error) {
        console.error("[agenciamentos] delete failed", error);
        return false;
      }
    },
    [canManage, deleteMutation, session],
  );

  return {
    session,
    canRead,
    canCreate,
    canManage,
    isAdmin,
    currentBroker,
    effectiveBrokerId,
    corretores,

    filters,
    setFilters,
    resetFilters,
    agenciamentos,
    visibleAgenciamentos,
    summary,
    ranking,
    dashboardSummary,
    dashboardRanking,
    validateInput,
    createAgenciamento: create,
    updateAgenciamento: update,
    validateAgenciamento: validate,
    deleteAgenciamento: remove,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetchAgenciamentos: query.refetch,
    isSaving:
      createMutation.isPending ||
      updateMutation.isPending ||
      validateMutation.isPending ||
      deleteMutation.isPending,
  };
}
