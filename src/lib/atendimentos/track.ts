import type { Atendimento, AtendimentoFinalidade } from "@/types/atendimento";

export type CommercialTrack = "venda" | "aluguel";

export const COMMERCIAL_TRACKS: readonly CommercialTrack[] = ["venda", "aluguel"] as const;

export function isCommercialTrack(value: unknown): value is CommercialTrack {
  return value === "venda" || value === "aluguel";
}

export function parseTrackParam(value: unknown): CommercialTrack {
  return isCommercialTrack(value) ? value : "venda";
}

/** Legacy `ambos` is exposed in both funnels until the user edits it. */
export function matchesTrack(atendimento: Atendimento, track: CommercialTrack): boolean {
  const f = atendimento.finalidade;
  if (f === "ambos") return true;
  return track === "venda" ? f === "compra" : f === "aluguel";
}

export function trackToFinalidade(track: CommercialTrack): AtendimentoFinalidade {
  return track === "venda" ? "compra" : "aluguel";
}

export function finalidadeToTrack(f: AtendimentoFinalidade): CommercialTrack | "ambos" {
  if (f === "compra") return "venda";
  if (f === "aluguel") return "aluguel";
  return "ambos";
}

export const trackLabel = (track: CommercialTrack) => (track === "venda" ? "Vendas" : "Aluguéis");
