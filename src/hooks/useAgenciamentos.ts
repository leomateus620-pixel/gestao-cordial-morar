import { useCallback, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  calculateAgenciamentosSummary,
  canEditAgenciamento,
  filterAgenciamentos,
  getAgenciamentosVisibleToUser,
  getDefaultAgenciamentoFilters,
  normalizeAgenciamentos,
  rankAgenciamentosByCorretor,
  validateAgenciamentoInput,
} from "@/services/agenciamentos";
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
  const {
    rawAgenciamentos,
    corretores,
    addAgenciamento,
    updateAgenciamento,
    validateAgenciamento,
  } = useApp(
    useShallow((state) => ({
      rawAgenciamentos: state.agenciamentos,
      corretores: state.corretores,
      addAgenciamento: state.addAgenciamento,
      updateAgenciamento: state.updateAgenciamento,
      validateAgenciamento: state.validateAgenciamento,
    })),
  );

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

  const normalizedAgenciamentos = useMemo(
    () => normalizeAgenciamentos(rawAgenciamentos),
    [rawAgenciamentos],
  );

  const currentBroker = useMemo(
    () => resolveCurrentBroker(session?.nome, session?.iniciais, corretores),
    [corretores, session?.iniciais, session?.nome],
  );

  const visibleAgenciamentos = useMemo(
    () => getAgenciamentosVisibleToUser(normalizedAgenciamentos, session, currentBroker?.id),
    [currentBroker?.id, normalizedAgenciamentos, session],
  );

  const effectiveFilters = useMemo(
    () => ({
      ...filters,
      corretorId: isAdmin ? filters.corretorId : (currentBroker?.id ?? "__sem_corretor__"),
    }),
    [currentBroker?.id, filters, isAdmin],
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
    (input: AgenciamentoInput) => {
      if (!session || !canCreate) return undefined;

      const forcedBroker =
        !canManage && currentBroker
          ? {
              corretorId: currentBroker.id,
              corretorNome: currentBroker.nome,
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

      return addAgenciamento(safeInput);
    },
    [addAgenciamento, canCreate, canManage, currentBroker, session],
  );

  const update = useCallback(
    (id: string, patch: Partial<AgenciamentoInput>) => {
      if (!session) return false;
      const current = normalizedAgenciamentos.find((item) => item.id === id);
      if (!current || !canEditAgenciamento(current, session, currentBroker?.id)) return false;

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
            validadoPorId: current.validadoPorId,
            validadoPorNome: current.validadoPorNome,
            validadoEm: current.validadoEm,
          };

      updateAgenciamento(id, safePatch);
      return true;
    },
    [canManage, currentBroker?.id, normalizedAgenciamentos, session, updateAgenciamento],
  );

  const validate = useCallback(
    (id: string) => {
      if (!session || !canManage) return false;
      validateAgenciamento(id, { id: session.id, nome: session.nome });
      return true;
    },
    [canManage, session, validateAgenciamento],
  );

  return {
    session,
    canRead,
    canCreate,
    canManage,
    isAdmin,
    currentBroker,
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
  };
}
