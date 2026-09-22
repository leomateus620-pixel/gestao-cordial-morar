/**
 * Leitura robusta de `/imovel/lista` para decidir se um imóvel JÁ existe no site.
 *
 * Puro (sem rede/banco) para ser testável. Motivo de existir: a API devolve a
 * lista em formas diferentes (`array`, `resultSet`, `resultSet.data`,
 * `resultSet.total_data`, `data`, `imoveis`). Quando o parser não reconhece a
 * forma, o sistema conclui "não existe" e chama `/imovel/inserir` de novo —
 * criando um anúncio duplicado. Este módulo fecha essa porta.
 */

export type RemoteListItem = {
  externalId: string | null;
  reference: string | null;
  raw: Record<string, unknown>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function firstArray(source: Record<string, unknown>, keys: string[]): unknown[] | null {
  for (const key of keys) {
    const value = source[key];
    if (Array.isArray(value)) return value;
  }
  return null;
}

/** Aceita todas as formas reais de resposta de lista da ImobiBrasil. */
export function extractRemoteListItems(payload: unknown): RemoteListItem[] {
  const rows: unknown[] = Array.isArray(payload)
    ? payload
    : (() => {
        const root = asRecord(payload) ?? {};
        const resultSet = root["resultSet"];
        if (Array.isArray(resultSet)) return resultSet;
        const inner = asRecord(resultSet);
        return (
          (inner && firstArray(inner, ["data", "total_data", "imoveis"])) ??
          firstArray(root, ["data", "total_data", "imoveis"]) ??
          []
        );
      })();

  const items: RemoteListItem[] = [];
  for (const row of rows) {
    const record = asRecord(row);
    if (!record) continue;
    items.push({
      externalId: readExternalId(record),
      reference: readReference(record),
      raw: record,
    });
  }
  return items;
}

function readExternalId(record: Record<string, unknown>): string | null {
  for (const key of ["codigoImovel", "codigo_imovel", "codigo", "idImovel", "id"]) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
    if (typeof value === "string" && /^\d+$/.test(value.trim())) return value.trim();
  }
  return null;
}

function readReference(record: Record<string, unknown>): string | null {
  for (const key of ["referenciaImovel", "referencia", "referencia_imovel", "ref"]) {
    const value = record[key];
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
}

/** Comparação de referência: sem espaços, sem caixa, sem zeros à esquerda. */
export function normalizeReference(value: string | null | undefined): string {
  const text = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  return /^\d+$/.test(text) ? String(Number(text)) : text;
}

export type ReferenceMatch = {
  /** Itens cuja referência é exatamente a procurada. */
  ids: string[];
  count: number;
};

/**
 * Casamento EXATO por referência. Item sem referência legível nunca conta como
 * match: preferimos concluir "ausente" e reconciliar do que apontar o imóvel errado.
 */
export function matchByReference(items: readonly RemoteListItem[], reference: string): ReferenceMatch {
  const target = normalizeReference(reference);
  const ids: string[] = [];
  for (const item of items) {
    if (!item.externalId) continue;
    if (normalizeReference(item.reference) !== target) continue;
    if (!ids.includes(item.externalId)) ids.push(item.externalId);
  }
  return { ids, count: ids.length };
}

export type ReferenceDecision =
  | { kind: "absent" }
  | { kind: "reuse"; externalId: string }
  | { kind: "duplicate"; ids: string[]; canonicalId: string | null };

/**
 * Regra de criação:
 *  - 0 matches → ausente (criação permitida pelas demais travas);
 *  - 1 match  → reutiliza o ID remoto, NUNCA cria;
 *  - >1 match → duplicidade: criação bloqueada. Se o ID local já aponta para um
 *    dos matches, ele é o canônico provisório.
 */
export function decideFromMatches(
  match: ReferenceMatch,
  currentExternalId: string | null | undefined,
): ReferenceDecision {
  if (match.count === 0) return { kind: "absent" };
  if (match.count === 1) return { kind: "reuse", externalId: match.ids[0]! };
  const current = String(currentExternalId ?? "").trim();
  return {
    kind: "duplicate",
    ids: match.ids,
    canonicalId: current && match.ids.includes(current) ? current : null,
  };
}

/** Publicação já existente no site: `publish` nunca pode virar criação. */
export function normalizeCadastralAction(
  action: "publish" | "update" | "reconcile" | "unpublish" | "delete",
  publication: {
    external_property_id?: string | null;
    status?: string | null;
    last_synced_at?: string | null;
  },
): "publish" | "update" | "reconcile" | "unpublish" | "delete" {
  if (action !== "publish") return action;
  if (publication.external_property_id) return "update";
  // Histórico de publicação sem ID guardado: reconcilia antes de qualquer criação.
  if (publication.status === "published" || publication.last_synced_at) return "reconcile";
  return "publish";
}

/** Quantas leituras consecutivas "ausente" exigimos após uma criação ambígua. */
export const AMBIGUOUS_ABSENT_CONFIRMATIONS = 3;

export function canCreateAfterAmbiguity(
  publication: { create_state?: string | null; create_absent_checks?: number | null },
): boolean {
  if (publication.create_state === "remote_duplicate_detected") return false;
  if (publication.create_state !== "awaiting_create_reconcile") return true;
  return Number(publication.create_absent_checks ?? 0) >= AMBIGUOUS_ABSENT_CONFIRMATIONS;
}

// ---------------------------------------------------------------------------
// Leitura com quatro respostas possíveis
// ---------------------------------------------------------------------------

/**
 * Uma página de `/imovel/lista`. `recognized = false` significa que o corpo não
 * trouxe nenhuma coleção reconhecível — o que NUNCA pode ser lido como "não existe".
 */
export type RemoteListRead = { items: RemoteListItem[]; recognized: boolean };

const LIST_ARRAY_KEYS = ["data", "total_data", "imoveis"];

export function extractRemoteList(payload: unknown): RemoteListRead {
  const rows: unknown[] | null = Array.isArray(payload)
    ? payload
    : (() => {
        const root = asRecord(payload);
        if (!root) return null;
        const resultSet = root["resultSet"];
        if (Array.isArray(resultSet)) return resultSet;
        const inner = asRecord(resultSet);
        return (
          (inner && firstArray(inner, LIST_ARRAY_KEYS)) ?? firstArray(root, LIST_ARRAY_KEYS) ?? null
        );
      })();

  if (rows === null) return { items: [], recognized: false };

  const items: RemoteListItem[] = [];
  for (const row of rows) {
    const record = asRecord(row);
    if (!record) continue;
    items.push({
      externalId: readExternalId(record),
      reference: readReference(record),
      raw: record,
    });
  }
  return { items, recognized: true };
}

export type RemoteLookupResult =
  | { kind: "absent" }
  | { kind: "unique"; externalId: string }
  | { kind: "duplicate"; ids: string[] }
  | {
      kind: "inconclusive";
      reason: "formato_desconhecido" | "falha_consulta" | "paginacao_incompleta";
    };

/**
 * Classifica a leitura remota. Formato desconhecido, falha de consulta e
 * paginação não esgotada JAMAIS equivalem a ausência: viram `inconclusive`,
 * e o caminho de criação fica bloqueado.
 */
export function classifyRemoteLookup(input: {
  reads: readonly RemoteListRead[];
  reference: string;
  complete: boolean;
  failed?: boolean;
}): RemoteLookupResult {
  if (input.failed) return { kind: "inconclusive", reason: "falha_consulta" };
  if (!input.reads.length || input.reads.some((read) => !read.recognized)) {
    return { kind: "inconclusive", reason: "formato_desconhecido" };
  }
  const items = input.reads.flatMap((read) => read.items);
  const match = matchByReference(items, input.reference);
  if (match.count > 1) return { kind: "duplicate", ids: match.ids };
  if (match.count === 1) return { kind: "unique", externalId: match.ids[0]! };
  if (!input.complete) return { kind: "inconclusive", reason: "paginacao_incompleta" };
  return { kind: "absent" };
}

/** Mensagem curta para registro/exibição do resultado inconclusivo. */
export function describeInconclusive(reason: string): string {
  if (reason === "formato_desconhecido") {
    return "O site respondeu a lista em formato não reconhecido.";
  }
  if (reason === "paginacao_incompleta") return "A lista do site não pôde ser percorrida até o fim.";
  return "A consulta da lista no site falhou.";
}
