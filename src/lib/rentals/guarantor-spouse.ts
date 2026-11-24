/**
 * Esposa/cônjuge que assina junto com um fiador específico do aluguel.
 * Fica guardado na própria garantia (rental_contract_guarantors.conjuge), então
 * acompanha o fiador ao reordenar ou editar e nunca vira fiador independente.
 */
export type SpouseRole = "esposa" | "conjuge";
export type GuarantorSpouse = {
  enabled: boolean;
  papel: SpouseRole;
  nome: string;
  cpf: string;
  rg: string;
  profissao: string;
  telefone: string;
};

export const SPOUSE_ROLE_LABEL: Record<SpouseRole, string> = {
  esposa: "Esposa",
  conjuge: "Outro cônjuge",
};

export function emptySpouse(): GuarantorSpouse {
  return {
    enabled: false,
    papel: "esposa",
    nome: "",
    cpf: "",
    rg: "",
    profissao: "",
    telefone: "",
  };
}

export function isValidCpf(raw: string): boolean {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (len: number) => {
    let s = 0;
    for (let i = 0; i < len; i++) s += Number(d[i]) * (len + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

/** Pendências do cônjuge habilitado; vazio quando completo ou desligado. */
export function spousePending(s: GuarantorSpouse | null | undefined): string[] {
  if (!s?.enabled) return [];
  const out: string[] = [];
  if (!s.nome.trim()) out.push("nome do cônjuge");
  if (!s.cpf.trim()) out.push("CPF do cônjuge");
  else if (!isValidCpf(s.cpf)) out.push("CPF do cônjuge válido");
  if (!s.rg.trim()) out.push("RG do cônjuge");
  else if (!/^[\p{L}\d.\-/ ]+$/u.test(s.rg.trim())) out.push("RG do cônjuge válido");
  if (!s.profissao.trim()) out.push("profissão do cônjuge");
  if (s.telefone.trim() && s.telefone.replace(/\D/g, "").length < 10)
    out.push("telefone do cônjuge válido");
  return out;
}

const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

/**
 * Normaliza o que chega do navegador. Rascunho incompleto é aceito (fica pendente
 * e bloqueia a geração); formato inválido de CPF preenchido é recusado.
 */
export function sanitizeSpouse(input: unknown): GuarantorSpouse | null {
  if (!input || typeof input !== "object") return null;
  const r = input as Record<string, unknown>;
  if (r["enabled"] !== true) return null;
  const s: GuarantorSpouse = {
    enabled: true,
    papel: r["papel"] === "conjuge" ? "conjuge" : "esposa",
    nome: clip(r["nome"], 160),
    cpf: clip(r["cpf"], 20),
    rg: clip(r["rg"], 30),
    profissao: clip(r["profissao"], 80),
    telefone: clip(r["telefone"], 30),
  };
  if (s.cpf && !isValidCpf(s.cpf)) throw new Error(`CPF do cônjuge de fiador inválido.`);
  if (s.rg && !/^[\p{L}\d.\-/ ]+$/u.test(s.rg))
    throw new Error("RG do cônjuge com caracteres inválidos.");
  return s;
}
