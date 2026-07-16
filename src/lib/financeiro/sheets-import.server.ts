// Server-only helper compartilhado entre importSheetRows (manual) e o endpoint público de cron.
// Encapsula a leitura da planilha via connector gateway + upsert idempotente na tabela
// financeiro_lancamentos + soft-delete de linhas removidas na planilha.

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_sheets/v4";
const MONTH_TAB_RE = /^(Jan|Fev|Mar|Abr|Mai|Jun|Jul|Ago|Set|Out|Nov|Dez)\d{2}$/;

export type SheetConfigRow = {
  id: string;
  spreadsheet_id: string;
  sheet_name: string;
  range: string;
  header_row: number;
};

export type SyncOutcome = {
  configId: string;
  spreadsheetId: string;
  spreadsheetTitle: string;
  inserted: number;
  updated: number;
  softDeleted: number;
  skipped: number;
  errors: { linha: number; motivo: string }[];
  tabs: string[];
};

function gatewayHeaders() {
  const lovable = process.env.LOVABLE_API_KEY;
  const conn = process.env.GOOGLE_SHEETS_API_KEY;
  if (!lovable || !conn) {
    throw new Error(
      "Integração Google Sheets não configurada. Conecte o Google Sheets no workspace.",
    );
  }
  return {
    Authorization: `Bearer ${lovable}`,
    "X-Connection-Api-Key": conn,
  } as Record<string, string>;
}

async function gwFetch(path: string): Promise<any> {
  const res = await fetch(`${GATEWAY_URL}${path}`, { headers: gatewayHeaders() });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Google Sheets: [${res.status}] ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : {};
}

// --- Parsers (mesmos usados no importador manual) ------------------------

const MONTHS_PT: Record<string, number> = {
  jan: 1, janeiro: 1,
  fev: 2, fevereiro: 2,
  mar: 3, marco: 3, "março": 3,
  abr: 4, abril: 4,
  mai: 5, maio: 5,
  jun: 6, junho: 6,
  jul: 7, julho: 7,
  ago: 8, agosto: 8,
  set: 9, setembro: 9,
  out: 10, outubro: 10,
  nov: 11, novembro: 11,
  dez: 12, dezembro: 12,
};

function normalizeMonthToken(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\.$/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function inferYearFromTab(tabName?: string): number | null {
  const m = (tabName ?? "").match(/(\d{2})$/);
  if (!m) return null;
  const yy = Number(m[1]);
  if (!Number.isFinite(yy)) return null;
  return yy >= 70 ? 1900 + yy : 2000 + yy;
}

function formatDateParts(y: number, m: number, d: number): string | null {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function hashSeed(input: string) {
  let h = 1779033703 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(h ^ input.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

export function stableUuidFromText(input: string): string {
  const seed = hashSeed(input);
  const bytes = Array.from({ length: 16 }, () => seed() & 0xff);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function parseDate(raw: string, tabName?: string): string | null {
  const t = (raw ?? "").toString().trim();
  if (!t) return null;
  const inferredYear = inferYearFromTab(tabName);
  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return formatDateParts(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const br = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/);
  if (br) {
    const yRaw = br[3];
    const year = yRaw ? Number(yRaw.length === 2 ? `20${yRaw}` : yRaw) : inferredYear;
    if (!year) return null;
    return formatDateParts(year, Number(br[2]), Number(br[1]));
  }
  const named = normalizeMonthToken(t).match(
    /^(\d{1,2})(?:\s*(?:-|\/|\.\s*|\s+de\s+)\s*)([a-z]+)(?:\s*(?:de\s*)?(\d{2}|\d{4}))?$/,
  );
  if (named) {
    const month = MONTHS_PT[normalizeMonthToken(named[2])];
    const yRaw = named[3];
    const year = yRaw ? Number(yRaw.length === 2 ? `20${yRaw}` : yRaw) : inferredYear;
    if (!month || !year) return null;
    return formatDateParts(year, month, Number(named[1]));
  }
  if (/^-?\d+(\.\d+)?$/.test(t)) {
    const serial = Number(t);
    if (Number.isFinite(serial) && serial > 59 && serial < 100000) {
      const ms = Math.round((serial - 25569) * 86400 * 1000);
      const d = new Date(ms);
      if (!Number.isNaN(d.getTime())) {
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      }
    }
  }
  return null;
}

export function parseValor(raw: string): number | null {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim();
  if (!s) return null;
  let negative = false;
  if (s.startsWith("(") && s.endsWith(")")) { negative = true; s = s.slice(1, -1); }
  s = s.replace(/R\$/gi, "").replace(/\s/g, "");
  if (s.startsWith("-")) { negative = true; s = s.slice(1); }
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (hasComma) {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

export function imobiliariaDaConta(conta: string): "cordial" | "morar" | "ambas" {
  const c = (conta ?? "").toLowerCase();
  const hasCordial = /cordial/.test(c);
  const hasMorar = /morar/.test(c);
  if (hasCordial && !hasMorar) return "cordial";
  if (hasMorar && !hasCordial) return "morar";
  return "ambas";
}

export async function fetchMonthTabs(spreadsheetId: string): Promise<{ tabs: string[]; title: string }> {
  const meta = await gwFetch(
    `/spreadsheets/${spreadsheetId}?fields=properties.title,sheets.properties.title`,
  );
  const all: string[] = (meta.sheets ?? []).map((s: any) => s.properties?.title ?? "");
  return { tabs: all.filter((t) => MONTH_TAB_RE.test(t)), title: meta.properties?.title ?? "" };
}

/**
 * Executa a sincronização de uma config específica usando um supabase client
 * com privilégios adequados (admin para o cron, RLS-user para o botão manual —
 * ambos funcionam pois admin passa nas policies existentes).
 * Faz upsert por (origem, origem_id) e marca como deleted_at as linhas cujo
 * origem_ref não aparece mais na planilha.
 */
export async function runSheetSync(
  supabase: any,
  cfg: SheetConfigRow,
  ownerUserId: string,
): Promise<SyncOutcome> {
  const { tabs: monthTabs, title } = await fetchMonthTabs(cfg.spreadsheet_id);
  const outcome: SyncOutcome = {
    configId: cfg.id,
    spreadsheetId: cfg.spreadsheet_id,
    spreadsheetTitle: title,
    inserted: 0,
    updated: 0,
    softDeleted: 0,
    skipped: 0,
    errors: [],
    tabs: monthTabs,
  };
  if (!monthTabs.length) return outcome;

  const params = new URLSearchParams();
  params.set("valueRenderOption", "FORMATTED_VALUE");
  for (const tab of monthTabs) params.append("ranges", `${tab}!A2:E1000`);
  const batch = await gwFetch(
    `/spreadsheets/${cfg.spreadsheet_id}/values:batchGet?${params.toString()}`,
  );
  const valueRanges: { range: string; values?: any[][] }[] = batch.valueRanges ?? [];

  const toUpsert: any[] = [];
  const originIdsSeen: string[] = [];
  const originRefsSeenByTab: Record<string, string[]> = {};

  valueRanges.forEach((vr, idx) => {
    const tab = monthTabs[idx];
    originRefsSeenByTab[tab] = [];
    const rows = vr.values ?? [];
    for (let i = 0; i < rows.length; i++) {
      const linhaAbs = 2 + i;
      const cols = (rows[i] ?? []).map((v) => String(v ?? "").trim());
      if (!cols.length || cols.every((c) => !c)) continue;
      const [dataRaw, conta, categoria, descricao, valorRaw] = [
        cols[0] ?? "", cols[1] ?? "", cols[2] ?? "", cols[3] ?? "", cols[4] ?? "",
      ];
      const parsedData = parseDate(dataRaw, tab);
      const parsedValor = parseValor(valorRaw);
      const problems: string[] = [];
      if (!parsedData) problems.push("data inválida");
      if (!descricao && !categoria) problems.push("descrição e categoria vazias");
      if (parsedValor === null || parsedValor === 0) problems.push("valor inválido ou zero");
      if (problems.length) {
        outcome.errors.push({ linha: linhaAbs, motivo: `${tab} L${linhaAbs}: ${problems.join("; ")}` });
        outcome.skipped++;
        continue;
      }
      const tipo: "entrada" | "saida" = parsedValor! > 0 ? "entrada" : "saida";
      const imob = imobiliariaDaConta(conta);
      const origemRef = `${cfg.spreadsheet_id}::${tab}::${linhaAbs}`;
      const origemId = stableUuidFromText(origemRef);
      originIdsSeen.push(origemId);
      originRefsSeenByTab[tab].push(origemRef);
      toUpsert.push({
        user_id: ownerUserId,
        imobiliaria: imob,
        tipo,
        categoria: categoria || "Sem categoria",
        descricao: descricao || categoria || "Lançamento sem descrição",
        valor: Math.abs(parsedValor!),
        data_competencia: parsedData,
        status: "Pago",
        origem: "google_sheets",
        origem_id: origemId,
        origem_ref: origemRef,
        deleted_at: null,
        observacoes: conta
          ? `Conta: ${conta} · Origem: ${tab} L${linhaAbs}`
          : `Origem: ${tab} L${linhaAbs}`,
      });
    }
  });

  if (toUpsert.length) {
    // Upsert idempotente via índice único parcial (origem, origem_id)
    const { data: upserted, error: upErr } = await supabase
      .from("financeiro_lancamentos")
      .upsert(toUpsert, { onConflict: "origem,origem_id" })
      .select("origem_id, created_at, updated_at");
    if (upErr) throw new Error(upErr.message);
    // Aproximação: se created_at == updated_at (mesmo instante) tratamos como insert
    for (const r of upserted ?? []) {
      if (!r.updated_at || r.created_at === r.updated_at) outcome.inserted++;
      else outcome.updated++;
    }
  }

  // Soft-delete de linhas removidas: por aba, marca deleted_at nas linhas cujo
  // origem_ref não foi visto neste run (e ainda não estava marcado).
  for (const tab of monthTabs) {
    const seen = originRefsSeenByTab[tab] ?? [];
    // pega tudo do prefixo dessa aba
    const prefix = `${cfg.spreadsheet_id}::${tab}::`;
    const { data: existing, error: exErr } = await supabase
      .from("financeiro_lancamentos")
      .select("id, origem_ref")
      .eq("origem", "google_sheets")
      .is("deleted_at", null)
      .like("origem_ref", `${prefix}%`);
    if (exErr) throw new Error(exErr.message);
    const seenSet = new Set(seen);
    const toDelete = (existing ?? []).filter((r: any) => r.origem_ref && !seenSet.has(r.origem_ref));
    if (toDelete.length) {
      const ids = toDelete.map((r: any) => r.id);
      const { error: delErr } = await supabase
        .from("financeiro_lancamentos")
        .update({ deleted_at: new Date().toISOString() })
        .in("id", ids);
      if (delErr) throw new Error(delErr.message);
      outcome.softDeleted += toDelete.length;
    }
  }

  return outcome;
}
