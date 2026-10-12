/**
 * Regras puras da galeria como o SITE PÚBLICO exibe (conferido em 09–12/10/2026
 * no 1377 C, 1372 C e 1406 C): a capa (destaque) aparece primeiro e as demais
 * em ordem CRESCENTE de envio. Os códigos de imagem da ImobiBrasil crescem a
 * cada envio, então a ordem exibida = capa + códigos em ordem crescente. A
 * ordem crua da lista da API NÃO é a ordem exibida.
 */

export type DisplayItem = { codigoImagem: string | null; destaque: boolean };

function codeKey(code: string | null): bigint | null {
  return code && /^\d+$/.test(code) ? BigInt(code) : null;
}

export function displayOrder<T extends DisplayItem>(items: readonly T[]): T[] {
  const indexed = items.map((item, index) => ({ item, index }));
  const rank = (a: { item: T; index: number }, b: { item: T; index: number }) => {
    const ka = codeKey(a.item.codigoImagem);
    const kb = codeKey(b.item.codigoImagem);
    if (ka !== null && kb !== null) return ka < kb ? -1 : ka > kb ? 1 : 0;
    if (ka !== null) return -1;
    if (kb !== null) return 1;
    return a.index - b.index;
  };
  const covers = indexed.filter((x) => x.item.destaque).sort(rank);
  const rest = indexed.filter((x) => !x.item.destaque).sort(rank);
  return [...covers, ...rest].map((x) => x.item);
}

export type UnknownEvidence = { imageId: string; at: string | null; beforeCodes: string[] | null };

export type UnknownResolution =
  | { imageId: string; action: "adopt"; code: string }
  | { imageId: string; action: "resend" }
  | { imageId: string; action: "keep" };

/**
 * Entregas incertas resolvidas pela "janela" de cada envio: os códigos que
 * surgiram entre o "antes" deste envio e o "antes" do envio seguinte (ou a
 * leitura atual, para o último). Exatamente um código sem dono na janela =
 * foi esta foto. Janela vazia com leitura posterior confiável = não chegou.
 * Mais de um = continua incerta (nunca reenvia às cegas).
 */
export function resolveUnknownByWindows(params: {
  unknowns: readonly UnknownEvidence[];
  currentCodes: readonly string[];
  linkedCodes: ReadonlySet<string>;
}): UnknownResolution[] {
  const rows = [...params.unknowns].filter((row) => row.at && row.beforeCodes);
  const skipped = params.unknowns.filter((row) => !row.at || !row.beforeCodes)
    .map((row) => ({ imageId: row.imageId, action: "keep" as const }));
  rows.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const current = new Set(params.currentCodes);
  const taken = new Set(params.linkedCodes);
  const out: UnknownResolution[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const before = new Set(rows[i]!.beforeCodes!);
    const after = i + 1 < rows.length ? rows[i + 1]!.beforeCodes! : [...params.currentCodes];
    const window = after.filter((code) => !before.has(code));
    const candidates = window.filter((code) => current.has(code) && !taken.has(code));
    // Lista "depois" vazia com "antes" cheio = leitura falha, não prova nada.
    const inconsistent = after.length === 0 && before.size > 0;
    if (inconsistent) {
      out.push({ imageId: rows[i]!.imageId, action: "keep" });
    } else if (candidates.length === 1) {
      taken.add(candidates[0]!);
      out.push({ imageId: rows[i]!.imageId, action: "adopt", code: candidates[0]! });
    } else if (window.length === 0) {
      out.push({ imageId: rows[i]!.imageId, action: "resend" });
    } else {
      out.push({ imageId: rows[i]!.imageId, action: "keep" });
    }
  }
  return [...out, ...skipped];
}

export const MAX_DELETES_PER_RUN = 2;
export const DELETE_BREAKER_RATIO = 0.8;

/**
 * Exclusão no site só com leitura confiável, até 2 por rodada, e nunca levando
 * a galeria abaixo de 80% do menor entre "fotos no início" e "fotos do Gestão".
 */
export function deletionAllowed(params: {
  reliable: boolean;
  deletedThisRun: number;
  startCount: number;
  desiredCount: number;
  currentCount: number;
}): { ok: true } | { ok: false; reason: "leitura_inconclusiva" | "limite_por_rodada" | "disjuntor" } {
  if (!params.reliable || params.currentCount === 0) return { ok: false, reason: "leitura_inconclusiva" };
  if (params.deletedThisRun >= MAX_DELETES_PER_RUN) return { ok: false, reason: "limite_por_rodada" };
  const floor = Math.floor(DELETE_BREAKER_RATIO * Math.min(params.startCount, params.desiredCount));
  if (params.currentCount - 1 < floor) return { ok: false, reason: "disjuntor" };
  return { ok: true };
}
