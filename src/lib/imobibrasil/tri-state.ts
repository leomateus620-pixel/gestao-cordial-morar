/**
 * Reconciliação por TRÊS estados, por campo e por imobiliária (puro, testável).
 *
 *   confirmado  → último valor que o site confirmou por leitura
 *   local       → valor atual no Gestão
 *   remoto      → valor atual lido no site
 *
 * Os três passam pela MESMA normalização (`sameValue` do payload-diff), então
 * "R$ 450.000", "450000" e "450000,00" deixam de parecer diferentes.
 *
 * Nada aqui escreve no banco nem chama a API: só classifica. A decisão sobre o
 * que fazer com cada classificação vive em `import.server.ts`.
 */

import { sameValue, type PayloadSnapshot } from "./payload-diff";

export type FieldClassification =
  /** Os três estados concordam: nada a fazer. */
  | "igual"
  /** Só o Gestão mudou: é edição local pendente, tem de ser publicada. */
  | "mudou_local"
  /** Só o site mudou: pode ser importado automaticamente. */
  | "mudou_remoto"
  /** Os dois lados mudaram para valores diferentes: divergência. */
  | "conflito"
  /** O Gestão apagou o campo de propósito e o site ainda tem valor. */
  | "limpeza_local"
  /** A leitura do site não descreve o campo: não dá para afirmar nada. */
  | "nao_verificavel";

export type FieldStateInput = {
  confirmed: unknown;
  local: unknown;
  remote: unknown;
  /** A leitura remota descreveu esse campo? Ausência não é vazio. */
  remoteKnown: boolean;
  /** O Gestão conhece esse campo? Ausência não é limpeza. */
  localKnown?: boolean;
};

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === "";
}

export function classifyField(state: FieldStateInput): FieldClassification {
  if (!state.remoteKnown) return "nao_verificavel";
  if (state.localKnown === false) return sameValue(state.confirmed, state.remote) ? "igual" : "mudou_remoto";

  const localChanged = !sameValue(state.confirmed, state.local);
  const remoteChanged = !sameValue(state.confirmed, state.remote);

  if (!localChanged && !remoteChanged) return "igual";
  if (localChanged && !remoteChanged) {
    return isEmpty(state.local) && !isEmpty(state.remote) ? "limpeza_local" : "mudou_local";
  }
  if (!localChanged && remoteChanged) return "mudou_remoto";
  if (sameValue(state.local, state.remote)) return "igual";
  return "conflito";
}

export type FieldDecisionReason = FieldClassification;

export type TriStateField = {
  field: string;
  classification: FieldClassification;
  confirmed: unknown;
  local: unknown;
  remote: unknown;
};

export type TriStateReport = {
  /** Campos que podem entrar automaticamente no Gestão. */
  importable: TriStateField[];
  /** Edições locais pendentes de publicação (nunca sobrescritas na importação). */
  localPending: TriStateField[];
  /** Limpezas intencionais locais (nunca desfeitas na importação). */
  localClears: TriStateField[];
  /** Divergências reais: os dois lados mudaram o mesmo campo. */
  conflicts: TriStateField[];
  /** A leitura não descreve: fica fora de qualquer decisão. */
  unverifiable: TriStateField[];
  /** Todos os campos avaliados, na ordem de entrada. */
  fields: TriStateField[];
};

export type TriStateOptions = {
  /** Campos que a importação nunca altera (proprietário, corretor, códigos...). */
  protectedFields?: readonly string[];
};

/**
 * Compara os três snapshots campo a campo. O universo de campos é a união das
 * chaves conhecidas — mas um campo que a leitura remota não descreve entra
 * sempre como "nao_verificavel", nunca como vazio.
 */
export function buildTriStateReport(
  confirmed: PayloadSnapshot | null | undefined,
  local: PayloadSnapshot,
  remote: PayloadSnapshot | null | undefined,
  options: TriStateOptions = {},
): TriStateReport {
  const confirmedSnapshot = confirmed ?? {};
  const remoteSnapshot = remote ?? {};
  const blocked = new Set(options.protectedFields ?? []);

  const keys: string[] = [];
  for (const key of [
    ...Object.keys(local),
    ...Object.keys(remoteSnapshot),
    ...Object.keys(confirmedSnapshot),
  ]) {
    if (blocked.has(key)) continue;
    if (!keys.includes(key)) keys.push(key);
  }

  const report: TriStateReport = {
    importable: [],
    localPending: [],
    localClears: [],
    conflicts: [],
    unverifiable: [],
    fields: [],
  };

  for (const field of keys) {
    const entry: TriStateField = {
      field,
      classification: classifyField({
        confirmed: confirmedSnapshot[field],
        local: local[field],
        remote: remoteSnapshot[field],
        remoteKnown: field in remoteSnapshot,
        localKnown: field in local,
      }),
      confirmed: confirmedSnapshot[field],
      local: local[field],
      remote: remoteSnapshot[field],
    };
    report.fields.push(entry);
    switch (entry.classification) {
      case "mudou_remoto":
        report.importable.push(entry);
        break;
      case "mudou_local":
        report.localPending.push(entry);
        break;
      case "limpeza_local":
        report.localClears.push(entry);
        break;
      case "conflito":
        report.conflicts.push(entry);
        break;
      case "nao_verificavel":
        report.unverifiable.push(entry);
        break;
      default:
        break;
    }
  }

  return report;
}

/**
 * A referência de comparação (o "confirmado") só pode avançar quando o estado
 * local ficou REALMENTE igual ao remoto. Se a importação preservou dado local
 * diferente, registrar os três como iguais mascara a divergência — era isso que
 * `upsertPublication` fazia ao gravar os três hashes com o mesmo valor.
 */
export function nextConfirmedSnapshot(
  currentConfirmed: PayloadSnapshot | null | undefined,
  localAfterImport: PayloadSnapshot,
  remote: PayloadSnapshot,
): { snapshot: PayloadSnapshot; fullyConfirmed: boolean } {
  const snapshot: PayloadSnapshot = { ...(currentConfirmed ?? {}) };
  let fullyConfirmed = true;

  for (const [field, remoteValue] of Object.entries(remote)) {
    if (!(field in localAfterImport)) {
      // O Gestão não conhece o campo: nada a confirmar, mas também nada divergente.
      snapshot[field] = remoteValue;
      continue;
    }
    if (sameValue(localAfterImport[field], remoteValue)) {
      snapshot[field] = remoteValue;
      continue;
    }
    // Diferença preservada de propósito: a referência NÃO avança nesse campo.
    fullyConfirmed = false;
  }

  return { snapshot, fullyConfirmed };
}

/**
 * Eco do próprio envio: o conteúdo que o Gestão acabou de publicar volta na
 * próxima leitura. Sem essa checagem o sistema chamaria isso de "edição
 * externa" e entraria em ciclo importação → republicação → importação.
 */
export function isOwnEcho(
  remoteHash: string,
  echo: { hash: string | null | undefined; expiresAt: string | null | undefined },
  now: Date = new Date(),
): boolean {
  if (!echo.hash || echo.hash !== remoteHash) return false;
  if (!echo.expiresAt) return true;
  const expires = Date.parse(echo.expiresAt);
  return Number.isFinite(expires) ? expires >= now.getTime() : true;
}
