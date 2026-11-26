import type { InspectionStatus, ItemState } from "./model";
import type { PropertySnapshot } from "./types";

export function inspectionPropertyCodes(property: PropertySnapshot["cadastro"]) {
  const commercial = (value?: string | null) => {
    const code = value?.trim();
    return code && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(code) ? code : "";
  };
  const cordial = commercial(property?.codigo_cordial);
  const morar = commercial(property?.codigo_morar);
  const generic = commercial(property?.codigo);
  return (
    [cordial && `Cordial ${cordial}`, morar && `Morar ${morar}`].filter(Boolean).join(" · ") ||
    (generic ? `Código ${generic}` : "")
  );
}

export function inspectionAddress(property: PropertySnapshot["cadastro"]) {
  if (!property) return "";
  return [
    [property.logradouro, property.numero, property.complemento].filter(Boolean).join(", "),
    property.bairro,
    [property.cidade, property.uf].filter(Boolean).join("/"),
  ]
    .filter(Boolean)
    .join(" · ");
}

export const STATUS_TONE: Record<InspectionStatus, string> = {
  rascunho: "bg-foreground/8 text-foreground/70",
  em_andamento: "bg-primary/12 text-primary",
  em_revisao: "bg-amber-500/15 text-amber-700",
  concluida: "bg-emerald-500/15 text-emerald-700",
};

export const ITEM_STATE_TONE: Record<ItemState, string> = {
  pendente: "border-input text-foreground/60",
  bom: "border-emerald-600 bg-emerald-600/10 text-emerald-800",
  regular: "border-amber-600 bg-amber-500/10 text-amber-800",
  ruim: "border-destructive bg-destructive/10 text-destructive",
  nao_testado: "border-foreground/40 bg-foreground/5 text-foreground/80",
  nao_se_aplica: "border-foreground/30 bg-foreground/5 text-foreground/70",
};
export const fmtInspectionTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
