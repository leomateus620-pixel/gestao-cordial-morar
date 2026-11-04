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
  { id: "agua", label: "Água", side: "inquilino", tipo: "acrescimo", descricao: "Água", repassarProprietario: false, repetir: false, focus: "valor" },
  { id: "fundo-reserva", label: "Fundo de reserva", side: "inquilino", tipo: "desconto", descricao: "Fundo de reserva", repassarProprietario: true, repetir: true, focus: "valor" },
  { id: "multa-juros", label: "Multa/Juros por atraso", side: "inquilino", tipo: "acrescimo", descricao: "Multa/Juros por atraso", repassarProprietario: true, repetir: false, focus: "valor" },
  { id: "outro-acrescimo", label: "Outro acréscimo", side: "inquilino", tipo: "acrescimo", descricao: "", repassarProprietario: false, repetir: false, focus: "descricao" },
  { id: "reparo", label: "Reparo/Manutenção", side: "proprietario", tipo: "desconto", descricao: "Reparo/Manutenção", repassarProprietario: false, repetir: false, focus: "valor" },
];

export function tenantAdjustmentFromPreset(p: ReceiptPreset, id: string): TenantAdjustment {
  return { id, tipo: p.tipo, descricao: p.descricao, valor: NaN, repassarProprietario: p.repassarProprietario, repetir: p.repetir };
}
export function ownerAdjustmentFromPreset(p: ReceiptPreset, id: string): OwnerAdjustment {
  return { id, tipo: p.tipo, descricao: p.descricao, valor: NaN };
}
