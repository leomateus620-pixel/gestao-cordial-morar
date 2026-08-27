import type { AgenciamentoChecklist, AgenciamentoImobiliaria } from "@/types/agenciamento";

export type ChecklistKey = Exclude<keyof AgenciamentoChecklist, "validado">;

export type ChecklistItemDefinition = {
  key: ChecklistKey;
  label: string;
  helper: string;
  /** Nome do ícone lucide usado pela UI (mantém este módulo livre de React). */
  icon: "camera" | "drive" | "sign" | "globe" | "video";
  /** Itens geridos pelo sistema refletem a confirmação remota e não são marcáveis à mão. */
  systemManaged?: "cordial" | "morar";
};

/**
 * Fonte única do checklist operacional. Usada pelo modal do menu Agenciamentos
 * e pela Etapa 7 do cadastro de imóveis — não duplicar esta lista.
 */
export const CHECKLIST_ITEMS: ChecklistItemDefinition[] = [
  {
    key: "fotosHorizontal",
    label: "Fotos realizadas (horizontal)",
    helper: "Fotos no formato horizontal concluídas.",
    icon: "camera",
  },
  {
    key: "fotosVertical",
    label: "Fotos realizadas (vertical)",
    helper: "Fotos no formato vertical concluídas.",
    icon: "camera",
  },
  {
    key: "fotosDrive",
    label: "Fotos enviadas ao Drive",
    helper: "Os arquivos estão disponíveis para a equipe.",
    icon: "drive",
  },
  {
    key: "placaInstalada",
    label: "Placa instalada",
    helper: "O imóvel já está sinalizado no local.",
    icon: "sign",
  },
  {
    key: "cadastradoMorar",
    label: "Imóvel cadastrado Morar",
    helper: "Anúncio publicado no site da Morar.",
    icon: "globe",
    systemManaged: "morar",
  },
  {
    key: "cadastradoCordial",
    label: "Imóvel cadastrado Cordial",
    helper: "Anúncio publicado no site da Cordial.",
    icon: "globe",
    systemManaged: "cordial",
  },
  {
    key: "videoRealizado",
    label: "Vídeo realizado",
    helper: "O material em vídeo está pronto para uso.",
    icon: "video",
  },
];

/** Itens que o motor de bonificação exige para considerar a captação válida. */
export const CHECKLIST_BONUS_KEYS: ChecklistKey[] = [
  "fotosHorizontal",
  "fotosVertical",
  "cadastradoMorar",
  "cadastradoCordial",
];

/**
 * Um item de site só é aplicável quando o imóvel é destinado àquele provedor.
 * Provedor fora do destino não entra no denominador do progresso.
 */
export function isChecklistItemApplicable(
  item: ChecklistItemDefinition,
  imobiliaria: AgenciamentoImobiliaria,
): boolean {
  if (!item.systemManaged) return true;
  if (imobiliaria === "ambas") return true;
  return item.systemManaged === imobiliaria;
}

export function applicableChecklistItems(
  imobiliaria: AgenciamentoImobiliaria,
): ChecklistItemDefinition[] {
  return CHECKLIST_ITEMS.filter((item) => isChecklistItemApplicable(item, imobiliaria));
}

export type ChecklistProgress = {
  completed: number;
  applicable: number;
  percent: number;
  pending: ChecklistItemDefinition[];
};

export function checklistProgress(
  checklist: AgenciamentoChecklist,
  imobiliaria: AgenciamentoImobiliaria,
): ChecklistProgress {
  const items = applicableChecklistItems(imobiliaria);
  const pending = items.filter((item) => !checklist[item.key]);
  const completed = items.length - pending.length;
  return {
    completed,
    applicable: items.length,
    percent: items.length ? Math.round((completed / items.length) * 100) : 0,
    pending,
  };
}

/**
 * Espelha a regra do motor no banco (`agenciamento_bonus_recalc`): fotos H/V e
 * cadastro nos dois sites. Somente para exibição — a verdade continua no banco.
 */
export function bonusPendingItems(checklist: AgenciamentoChecklist): ChecklistItemDefinition[] {
  return CHECKLIST_ITEMS.filter(
    (item) => CHECKLIST_BONUS_KEYS.includes(item.key) && !checklist[item.key],
  );
}

export function emptyChecklist(): AgenciamentoChecklist {
  return {
    fotosHorizontal: false,
    fotosVertical: false,
    fotosDrive: false,
    placaInstalada: false,
    cadastradoMorar: false,
    cadastradoCordial: false,
    videoRealizado: false,
    validado: false,
  };
}
