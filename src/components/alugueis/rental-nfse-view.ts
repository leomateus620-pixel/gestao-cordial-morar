import type { EmissionStatus } from "../../lib/nfse/emission-rules";
import { PROCESSANDO_STALE_MS } from "../../lib/nfse/emission-rules";

export function formatFiscalMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export type FiscalStatusView = {
  label: string;
  explanation: string;
  tone: "success" | "test" | "pending" | "warning" | "neutral";
  icon: "issued" | "test" | "sending" | "waiting" | "refused" | "cancelled" | "resolved";
};

/** Elapsed time changes the action shown, never authorizes another fiscal operation. */
export function fiscalStatusView(
  row: {
    status: EmissionStatus;
    updatedAt: string | null;
    createdAt: string;
    failureStage?: "antes_envio" | "recusa" | null;
  },
  now = Date.now(),
): FiscalStatusView {
  const elapsed = now - Date.parse(row.updatedAt ?? row.createdAt);
  if (row.status === "erro" && row.failureStage === "antes_envio")
    return {
      label: "Envio não iniciado",
      explanation:
        "A transmissão foi impedida antes do envio. Corrija a pendência indicada e revise a operação.",
      tone: "warning",
      icon: "refused",
    };
  if (row.status === "processando") {
    return Number.isFinite(elapsed) && elapsed < PROCESSANDO_STALE_MS
      ? {
          label: "Enviando",
          explanation:
            "A tentativa foi registrada. Fechar a ficha não cancela o envio; aguarde o resultado persistido.",
          tone: "pending",
          icon: "sending",
        }
      : {
          label: "Aguardando confirmação",
          explanation:
            "O prazo de resposta terminou. Confira esta operação; uma nova emissão continua bloqueada.",
          tone: "warning",
          icon: "waiting",
        };
  }
  const views: Record<Exclude<EmissionStatus, "processando">, FiscalStatusView> = {
    emitida: {
      label: "Emitida",
      explanation: "Nota fiscal confirmada pela prefeitura.",
      tone: "success",
      icon: "issued",
    },
    teste_ok: {
      label: "Validada em teste",
      explanation: "Validação de teste concluída. Este registro não é uma nota fiscal real.",
      tone: "test",
      icon: "test",
    },
    erro: {
      label: "Recusada",
      explanation: "Revise as pendências da operação antes de tentar novamente.",
      tone: "warning",
      icon: "refused",
    },
    incerto: {
      label: "Aguardando confirmação",
      explanation:
        "O retorno não confirmou o resultado. Confira a operação antes de qualquer nova emissão.",
      tone: "warning",
      icon: "waiting",
    },
    cancelada: {
      label: "Cancelada",
      explanation: "A nota consta como cancelada. Seu histórico fiscal permanece preservado.",
      tone: "neutral",
      icon: "cancelled",
    },
    nao_emitida: {
      label: "Não emitida — conferida",
      explanation: "A administração registrou a conferência e o motivo da resolução.",
      tone: "neutral",
      icon: "resolved",
    },
  };
  return views[row.status];
}

export function groupFiscalHistory<T extends { competencia: string; createdAt: string }>(
  rows: T[],
) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = row.competencia.slice(0, 7);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()].sort(([a], [b]) => b.localeCompare(a));
}

/** The token is issued by the server; a local confirmation is valid only for that preview. */
export function isCurrentFiscalConfirmation(
  approvedToken: string | null,
  previewToken: string | null | undefined,
) {
  return Boolean(approvedToken && previewToken && approvedToken === previewToken);
}
