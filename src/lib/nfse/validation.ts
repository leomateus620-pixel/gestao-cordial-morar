/**
 * Validações puras da NFS-e (sem imports de servidor) — usadas no cadastro
 * fiscal, na checagem prévia e de novo antes do envio (defesa em profundidade).
 */
import { normalizeItemListaServico, normalizeTaxDoc, onlyDigits } from "./ipm/xml";

export { normalizeTaxDoc };

export function isValidCpf(value: string | null | undefined): boolean {
  const d = onlyDigits(value);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

/** CNPJ numérico ou alfanumérico (IN RFB 2.229/2024): 12 posições [0-9A-Z] + 2 DV numéricos. */
export function isValidCnpj(value: string | null | undefined): boolean {
  const v = normalizeTaxDoc(value);
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(v)) return false;
  if (/^(\d)\1{13}$/.test(v)) return false;
  const val = (c: string) => c.charCodeAt(0) - 48;
  const dv = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i++) sum += val(v[i] as string) * (weights[i] as number);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(v[12]) && dv(13) === Number(v[13]);
}

export function isValidTaxDoc(value: string | null | undefined): boolean {
  const v = normalizeTaxDoc(value);
  return v.length === 11 ? isValidCpf(v) : isValidCnpj(v);
}

export function isValidEmail(value: string | null | undefined): boolean {
  const v = String(value ?? "").trim();
  return v.length > 0 && v.length <= 100 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}

/** Telefone BR: remove DDI 55 (12/13 dígitos); DDD 2 + número 8/9. Inválido → null. */
export function normalizePhone(value: string | null | undefined): { ddd: string; numero: string } | null {
  let d = onlyDigits(value);
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  const ddd = d.slice(0, 2);
  if (ddd.startsWith("0")) return null;
  return { ddd, numero: d.slice(2) };
}

export const ENDPOINT_ALLOWLIST = /^https:\/\/[a-z0-9-]+\.atende\.net(:[0-9]+)?\//;

export function isAllowedEndpoint(value: string | null | undefined): boolean {
  return ENDPOINT_ALLOWLIST.test(String(value ?? ""));
}

/** Compara nomes de cidade sem acento e sem diferença de maiúsculas. */
export function normalizeCityName(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function isSantaRosa(value: string | null | undefined): boolean {
  return normalizeCityName(value) === "santa rosa";
}

export type NfseSettingsInput = {
  cnpj?: string | null;
  inscricaoMunicipal?: string | null;
  codigoItemListaServico?: string | null;
  codigoNbs?: string | null;
  aliquotaIss?: number | null;
  situacaoTributaria?: string | null;
  endpointUrl?: string | null;
};

/** Erros por campo; objeto vazio = válido. Só valida os campos informados. */
export function validateNfseSettings(input: NfseSettingsInput): Record<string, string> {
  const errors: Record<string, string> = {};
  if (input.cnpj !== undefined && !isValidCnpj(input.cnpj)) errors["cnpj"] = "CNPJ do prestador inválido.";
  if (input.inscricaoMunicipal !== undefined) {
    const im = String(input.inscricaoMunicipal ?? "").trim();
    if (!im) errors["inscricaoMunicipal"] = "Informe a inscrição municipal.";
    else if (!/^[0-9.\-/]{1,20}$/.test(im)) errors["inscricaoMunicipal"] = "Use só números na inscrição municipal.";
  }
  if (input.codigoItemListaServico !== undefined) {
    try {
      const n = normalizeItemListaServico(input.codigoItemListaServico);
      if (n.length !== 4 && n.length !== 6) throw new Error();
    } catch {
      errors["codigoItemListaServico"] = "Item da lista: use 4 dígitos (10.05) ou 6 (10.05.01).";
    }
  }
  if (input.codigoNbs !== undefined && input.codigoNbs !== null && String(input.codigoNbs).trim() !== "") {
    if (onlyDigits(input.codigoNbs).length !== 9) errors["codigoNbs"] = "Código NBS deve ter 9 dígitos.";
  }
  if (input.aliquotaIss !== undefined) {
    const a = Number(input.aliquotaIss);
    if (!Number.isFinite(a) || a < 0 || a > 5) errors["aliquotaIss"] = "Alíquota do ISS deve ficar entre 0 e 5%.";
  }
  if (input.situacaoTributaria !== undefined) {
    if (!/^\d{1,4}$/.test(String(input.situacaoTributaria ?? "").trim()))
      errors["situacaoTributaria"] = "Situação tributária: só dígitos (até 4).";
  }
  if (input.endpointUrl !== undefined && !isAllowedEndpoint(input.endpointUrl))
    errors["endpointUrl"] = "Endereço da prefeitura deve ser https://*.atende.net.";
  return errors;
}
