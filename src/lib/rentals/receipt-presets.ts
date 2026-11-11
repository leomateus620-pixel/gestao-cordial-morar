import type { AdjustmentKind, OwnerAdjustment, TenantAdjustment } from "./receipt-model";

export type ReceiptPreset = {
  id: string;
  label: string;
  side: "inquilino" | "proprietario";
  tipo: AdjustmentKind;
  descricao: string;
  repassarProprietario: boolean;
  repetir: boolean;
  focus: "valor" | "descricao";
};

/** Quick shortcuts: each one only pre-fills a new, fully editable adjustment. */
export const RECEIPT_ADJUSTMENT_PRESETS: readonly ReceiptPreset[] = [
  {
    id: "agua",
    label: "Água",
    side: "inquilino",
    tipo: "acrescimo",
    descricao: "Água",
    repassarProprietario: false,
    repetir: false,
    focus: "valor",
  },
  {
    id: "fundo-reserva",
    label: "Fundo de reserva",
    side: "inquilino",
    tipo: "desconto",
    descricao: "Fundo de reserva",
    repassarProprietario: true,
    repetir: true,
    focus: "valor",
  },
  {
    id: "multa-juros",
    label: "Multa/Juros por atraso",
    side: "inquilino",
    tipo: "acrescimo",
    descricao: "Multa/Juros por atraso",
    repassarProprietario: true,
    repetir: false,
    focus: "valor",
  },
  {
    id: "outro-acrescimo",
    label: "Outro acréscimo",
    side: "inquilino",
    tipo: "acrescimo",
    descricao: "",
    repassarProprietario: false,
    repetir: false,
    focus: "descricao",
  },
  {
    id: "reparo",
    label: "Reparo/Manutenção",
    side: "proprietario",
    tipo: "desconto",
    descricao: "Reparo/Manutenção",
    repassarProprietario: false,
    repetir: false,
    focus: "valor",
  },
];

export function tenantAdjustmentFromPreset(p: ReceiptPreset, id: string): TenantAdjustment {
  return {
    id,
    tipo: p.tipo,
    descricao: p.descricao,
    valor: NaN,
    repassarProprietario: p.repassarProprietario,
    repetir: p.repetir,
  };
}
export function ownerAdjustmentFromPreset(p: ReceiptPreset, id: string): OwnerAdjustment {
  return { id, tipo: p.tipo, descricao: p.descricao, valor: NaN };
}

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
/** True when an owner-side description looks like a tenant discount (e.g. "fundo de reserva"). */
export function suggestTenantSide(descricao: string) {
  return normalize(descricao).includes("fundo de reserva");
}
/** Moves an owner item to the tenant side as a discount passed on to the owner. */
export function ownerToTenantAdjustment(a: OwnerAdjustment): TenantAdjustment {
  return {
    id: a.id,
    tipo: "desconto",
    descricao: a.descricao,
    valor: a.valor,
    repassarProprietario: true,
  };
}
