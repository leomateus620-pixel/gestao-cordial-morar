import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_sheets/v4";

// Regex das abas mensais: Jan26, Fev26, Mar26, ... Dez26 (pt-BR, dois dígitos de ano)
const MONTH_TAB_RE = /^(Jan|Fev|Mar|Abr|Mai|Jun|Jul|Ago|Set|Out|Nov|Dez)\d{2}$/;

export type SheetConfig = {
  id: string;
  spreadsheetId: string;
  sheetName: string;
  range: string;
  headerRow: number;
  lastImportAt: string | null;
  lastImportCount: number | null;
  updatedBy: string | null;
  updatedAt: string;
};

export type SheetPreview = {
  headers: string[];
  rows: string[][];
  totalRows: number;
  spreadsheetTitle: string;
};

export type ImportResult = {
  inserted: number;
  updated: number;
  skipped: number;
  errors: { linha: number; motivo: string }[];
};

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Apenas administradores podem gerenciar a integração.");
}

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
    console.error(`Google Sheets gateway [${res.status}]: ${text}`);
    throw new Error(`Google Sheets: [${res.status}] ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : {};
}

function extractSpreadsheetId(raw: string): string {
  const trimmed = raw.trim();
  const m = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : trimmed;
}

function mapRow(r: any): SheetConfig {
  return {
    id: r.id,
    spreadsheetId: r.spreadsheet_id,
    sheetName: r.sheet_name,
    range: r.range,
    headerRow: r.header_row,
    lastImportAt: r.last_import_at,
    lastImportCount: r.last_import_count,
    updatedBy: r.updated_by,
    updatedAt: r.updated_at,
  };
}

export const getSheetConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SheetConfig | null> => {
    const { data, error } = await context.supabase
      .from("financeiro_sheet_config")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapRow(data) : null;
  });

const saveSchema = z.object({
  spreadsheetIdOrUrl: z.string().min(5),
  sheetName: z.string().min(1).max(120),
  range: z
    .string()
    .min(2)
    .max(120)
    .regex(/^[A-Za-z]+\d*:[A-Za-z]+\d*$/, "Range inválido. Ex.: A2:E1000"),
  headerRow: z.number().int().min(1).max(1000),
});

export const saveSheetConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => saveSchema.parse(data))
  .handler(async ({ data, context }): Promise<SheetConfig> => {
    await assertAdmin(context);
    const spreadsheetId = extractSpreadsheetId(data.spreadsheetIdOrUrl);

    // Valida acesso e lista abas
    const meta = await gwFetch(
      `/spreadsheets/${spreadsheetId}?fields=properties.title,sheets.properties.title`,
    );
    const tabs: string[] = (meta.sheets ?? []).map((s: any) => s.properties?.title ?? "");
    const monthTabs = tabs.filter((t) => MONTH_TAB_RE.test(t));
    if (!monthTabs.length) {
      throw new Error(
        `Nenhuma aba mensal (Jan26, Fev26, ...) encontrada. Abas: ${tabs.join(", ")}`,
      );
    }

    // Singleton
    const { data: existing } = await context.supabase
      .from("financeiro_sheet_config")
      .select("id")
      .limit(1)
      .maybeSingle();

    const payload = {
      spreadsheet_id: spreadsheetId,
      sheet_name: data.sheetName, // referência informativa; importador varre todas as abas mensais
      range: data.range,
      header_row: data.headerRow,
      updated_by: context.userId,
    };

    if (existing) {
      const { data: row, error } = await context.supabase
        .from("financeiro_sheet_config")
        .update(payload)
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return mapRow(row);
    }
    const { data: row, error } = await context.supabase
      .from("financeiro_sheet_config")
      .insert(payload)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapRow(row);
  });

export const disconnectSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("financeiro_sheet_config")
      .delete()
      .not("id", "is", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function loadConfig(context: {
  supabase: any;
}): Promise<{ config: SheetConfig; title: string; monthTabs: string[] }> {
  const { data, error } = await context.supabase
    .from("financeiro_sheet_config")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Nenhuma planilha configurada.");
  const cfg = mapRow(data);
  const meta = await gwFetch(
    `/spreadsheets/${cfg.spreadsheetId}?fields=properties.title,sheets.properties.title`,
  );
  const tabs: string[] = (meta.sheets ?? []).map((s: any) => s.properties?.title ?? "");
  const monthTabs = tabs.filter((t) => MONTH_TAB_RE.test(t));
  return { config: cfg, title: meta.properties?.title ?? "", monthTabs };
}

// --- Parsers -------------------------------------------------------------

const MONTHS_PT: Record<string, number> = {
  jan: 1,
  janeiro: 1,
  fev: 2,
  fevereiro: 2,
  mar: 3,
  marco: 3,
  março: 3,
  abr: 4,
  abril: 4,
  mai: 5,
  maio: 5,
  jun: 6,
  junho: 6,
  jul: 7,
  julho: 7,
  ago: 8,
  agosto: 8,
  set: 9,
  setembro: 9,
  out: 10,
  outubro: 10,
  nov: 11,
  novembro: 11,
  dez: 12,
  dezembro: 12,
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
  const match = (tabName ?? "").match(/(\d{2})$/);
  if (!match) return null;
  const yy = Number(match[1]);
  if (!Number.isFinite(yy)) return null;
  return yy >= 70 ? 1900 + yy : 2000 + yy;
}

function formatDateParts(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseDate(raw: string, tabName?: string): string | null {
  const t = (raw ?? "").toString().trim();
  if (!t) return null;
  const inferredYear = inferYearFromTab(tabName);
  // ISO yyyy-mm-dd
  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    return formatDateParts(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }
  // dd/mm/yyyy ou dd/mm/yy
  const br = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/);
  if (br) {
    const yRaw = br[3];
    const year = yRaw ? Number(yRaw.length === 2 ? `20${yRaw}` : yRaw) : inferredYear;
    if (!year) return null;
    return formatDateParts(year, Number(br[2]), Number(br[1]));
  }
  // Formatos renderizados pelo Sheets em pt-BR: 1-jul., 01-jul, 1/jul, 1 de julho
  const namedMonth = normalizeMonthToken(t).match(
    /^(\d{1,2})(?:\s*(?:-|\/|\.\s*|\s+de\s+)\s*)([a-z]+)(?:\s*(?:de\s*)?(\d{2}|\d{4}))?$/,
  );
  if (namedMonth) {
    const month = MONTHS_PT[normalizeMonthToken(namedMonth[2])];
    const yRaw = namedMonth[3];
    const year = yRaw ? Number(yRaw.length === 2 ? `20${yRaw}` : yRaw) : inferredYear;
    if (!month || !year) return null;
    return formatDateParts(year, month, Number(namedMonth[1]));
  }
  // Serial number do Sheets (dias desde 1899-12-30)
  if (/^-?\d+(\.\d+)?$/.test(t)) {
    const serial = Number(t);
    if (Number.isFinite(serial) && serial > 59 && serial < 100000) {
      const ms = Math.round((serial - 25569) * 86400 * 1000);
      const d = new Date(ms);
      if (!Number.isNaN(d.getTime())) {
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
          d.getUTCDate(),
        ).padStart(2, "0")}`;
      }
    }
  }
  return null;
}

/** Aceita R$ 1.234,56 · -1.234,56 · (1.234,56) · 1234.56 · 1,234.56 */
function parseValor(raw: string): number | null {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim();
  if (!s) return null;
  let negative = false;
  if (s.startsWith("(") && s.endsWith(")")) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/R\$/gi, "").replace(/\s/g, "");
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }
  // Heurística pt-BR vs en-US
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    // O último separador é o decimal
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

function imobiliariaDaConta(conta: string): "cordial" | "morar" | "ambas" {
  const c = (conta ?? "").toLowerCase();
  const hasCordial = /cordial/.test(c);
  const hasMorar = /morar/.test(c);
  if (hasCordial && !hasMorar) return "cordial";
  if (hasMorar && !hasCordial) return "morar";
  return "ambas";
}

// --- Preview -------------------------------------------------------------

export const previewSheetRows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { limit?: number }) => ({ limit: data?.limit ?? 10 }))
  .handler(async ({ data, context }): Promise<SheetPreview> => {
    await assertAdmin(context);
    const { config, title, monthTabs } = await loadConfig(context);
    if (!monthTabs.length) {
      return { headers: [], rows: [], totalRows: 0, spreadsheetTitle: title };
    }

    // Procura a primeira aba mensal com dados
    const headers = ["Data", "Conta", "Categoria", "Descrição", "Valor"];
    for (const tab of monthTabs) {
      const res = await gwFetch(
        `/spreadsheets/${config.spreadsheetId}/values/${tab}!A2:E1000?valueRenderOption=FORMATTED_VALUE`,
      );
      const rows: string[][] = (res.values ?? [])
        .map((r: any[]) => r.map((v) => String(v ?? "")))
        .filter((r: string[]) => r.some((c) => c.trim()));
      if (rows.length) {
        return {
          headers: [`Aba ${tab}`, ...headers],
          rows: rows.slice(0, data.limit).map((r) => [tab, ...r]),
          totalRows: rows.length,
          spreadsheetTitle: title,
        };
      }
    }

    return {
      headers,
      rows: [],
      totalRows: 0,
      spreadsheetTitle: `${title} — nenhuma aba mensal contém lançamentos ainda`,
    };
  });

// --- Import --------------------------------------------------------------

export const importSheetRows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ImportResult> => {
    await assertAdmin(context);
    const { config, monthTabs } = await loadConfig(context);
    const result: ImportResult = { inserted: 0, updated: 0, skipped: 0, errors: [] };
    if (!monthTabs.length) return result;

    // Lê todas as abas mensais em um único batchGet
    const params = new URLSearchParams();
    params.set("valueRenderOption", "FORMATTED_VALUE");
    for (const tab of monthTabs) params.append("ranges", `${tab}!A2:E1000`);
    const batch = await gwFetch(
      `/spreadsheets/${config.spreadsheetId}/values:batchGet?${params.toString()}`,
    );
    const valueRanges: { range: string; values?: any[][] }[] = batch.valueRanges ?? [];

    const toUpsert: any[] = [];
    const originIds: string[] = [];

    valueRanges.forEach((vr, idx) => {
      const tab = monthTabs[idx];
      const rows = vr.values ?? [];
      for (let i = 0; i < rows.length; i++) {
        const linhaAbs = 2 + i; // range começa em A2
        const cols = (rows[i] ?? []).map((v) => String(v ?? "").trim());
        if (!cols.length || cols.every((c) => !c)) continue;

        const [dataRaw, conta, categoria, descricao, valorRaw] = [
          cols[0] ?? "",
          cols[1] ?? "",
          cols[2] ?? "",
          cols[3] ?? "",
          cols[4] ?? "",
        ];

        const parsedData = parseDate(dataRaw, tab);
        const parsedValor = parseValor(valorRaw);

        const problems: string[] = [];
        if (!parsedData) problems.push("data inválida");
        if (!descricao && !categoria) problems.push("descrição e categoria vazias");
        if (parsedValor === null || parsedValor === 0) problems.push("valor inválido ou zero");

        if (problems.length) {
          result.errors.push({
            linha: linhaAbs,
            motivo: `${tab} L${linhaAbs}: ${problems.join("; ")}`,
          });
          result.skipped++;
          continue;
        }

        const tipo: "entrada" | "saida" = parsedValor! > 0 ? "entrada" : "saida";
        const imob = imobiliariaDaConta(conta);
        const origemId = `${config.spreadsheetId}::${tab}::${linhaAbs}`;
        originIds.push(origemId);

        toUpsert.push({
          user_id: context.userId,
          imobiliaria: imob,
          tipo,
          categoria: categoria || "Sem categoria",
          descricao: descricao || categoria || "Lançamento sem descrição",
          valor: Math.abs(parsedValor!),
          data_competencia: parsedData,
          status: "Pago",
          origem: "google_sheets",
          origem_id: origemId,
          observacoes: conta ? `Conta: ${conta}` : null,
        });
      }
    });

    if (toUpsert.length) {
      const { data: existing } = await context.supabase
        .from("financeiro_lancamentos")
        .select("origem_id")
        .eq("origem", "google_sheets")
        .in("origem_id", originIds);
      const existingSet = new Set((existing ?? []).map((r: any) => r.origem_id));

      const toInsert = toUpsert.filter((r) => !existingSet.has(r.origem_id));
      const toUpdate = toUpsert.filter((r) => existingSet.has(r.origem_id));

      if (toInsert.length) {
        const { error: insErr } = await context.supabase
          .from("financeiro_lancamentos")
          .insert(toInsert);
        if (insErr) throw new Error(insErr.message);
        result.inserted = toInsert.length;
      }

      for (const row of toUpdate) {
        const { error: updErr } = await context.supabase
          .from("financeiro_lancamentos")
          .update({
            imobiliaria: row.imobiliaria,
            tipo: row.tipo,
            categoria: row.categoria,
            descricao: row.descricao,
            valor: row.valor,
            data_competencia: row.data_competencia,
            status: row.status,
            observacoes: row.observacoes,
          })
          .eq("origem", "google_sheets")
          .eq("origem_id", row.origem_id);
        if (updErr) throw new Error(updErr.message);
        result.updated++;
      }
    }

    await context.supabase
      .from("financeiro_sheet_config")
      .update({
        last_import_at: new Date().toISOString(),
        last_import_count: result.inserted + result.updated,
        updated_by: context.userId,
      })
      .eq("id", config.id);

    return result;
  });
