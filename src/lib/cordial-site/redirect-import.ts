// Importação de redirecionamentos manuais (endereço antigo do ImobiBrasil → imóvel atual). Puro e testável.
export type RedirectRow = { line: number; oldPath: string | null; reference: string; raw: string };
export type RedirectPreview = RedirectRow & {
  status:
    | "valido"
    | "endereco_invalido"
    | "nao_encontrado"
    | "outra_marca"
    | "repetido"
    | "substitui";
  publicId?: string;
};

/** Normaliza para "/imovel/<id>/" (aceita URL completa, com ou sem barra final). */
export function normalizeOldPath(input: string): string | null {
  let path = input.trim();
  if (!path) return null;
  try {
    if (/^https?:\/\//i.test(path)) path = new URL(path).pathname;
  } catch {
    return null;
  }
  const m = /^\/imovel\/(\d{1,12})(?:\/[^?#\s]*)?\/?$/.exec(path.split(/[?#]/)[0]);
  return m ? `/imovel/${m[1]}/` : null;
}

/** CSV de duas colunas: endereço antigo; referência do imóvel (vírgula ou ponto e vírgula). */
export function parseRedirectCsv(text: string): RedirectRow[] {
  const rows: RedirectRow[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const [a = "", b = ""] = line.split(/[;,\t]/).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (i === 0 && !/imovel|\d/.test(a.toLowerCase())) return; // cabeçalho
    rows.push({ line: i + 1, oldPath: normalizeOldPath(a), reference: b, raw: line });
  });
  return rows.slice(0, 2000);
}

export function previewRedirects(
  rows: RedirectRow[],
  own: Map<string, string>, // referência (minúscula) → id público na marca
  other: Set<string>, // referências que só existem na outra marca
  existing: Set<string>, // endereços antigos já cadastrados
): RedirectPreview[] {
  const seen = new Set<string>();
  return rows.map((r) => {
    if (!r.oldPath) return { ...r, status: "endereco_invalido" };
    if (seen.has(r.oldPath)) return { ...r, status: "repetido" };
    seen.add(r.oldPath);
    const ref = r.reference.trim().toLowerCase();
    const publicId = own.get(ref);
    if (!publicId) return { ...r, status: other.has(ref) ? "outra_marca" : "nao_encontrado" };
    return { ...r, publicId, status: existing.has(r.oldPath) ? "substitui" : "valido" };
  });
}

export const applicable = (p: RedirectPreview[]) =>
  p.filter((r) => (r.status === "valido" || r.status === "substitui") && r.publicId && r.oldPath);
