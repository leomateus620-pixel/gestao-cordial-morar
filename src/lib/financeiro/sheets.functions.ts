import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_sheets/v4";

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

const EXPECTED_HEADERS = [
  "data",
  "descricao",
  "categoria",
  "tipo",
  "valor",
  "imobiliaria",
  "status",
  "corretor_email",
] as const;

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
    .regex(/^[A-Za-z]+\d*:[A-Za-z]+\d*$/, "Range inválido. Ex.: A2:H1000"),
  headerRow: z.number().int().min(1).max(1000),
});

export const saveSheetConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => saveSchema.parse(data))
  .handler(async ({ data, context }): Promise<SheetConfig> => {
    await assertAdmin(context);
    const spreadsheetId = extractSpreadsheetId(data.spreadsheetIdOrUrl);

    // Validate access
    const meta = await gwFetch(
      `/spreadsheets/${spreadsheetId}?fields=properties.title,sheets.properties.title`,
    );
    const sheets: string[] = (meta.sheets ?? []).map((s: any) => s.properties?.title);
    if (sheets.length && !sheets.includes(data.sheetName)) {
      throw new Error(
        `Aba "${data.sheetName}" não encontrada. Abas disponíveis: ${sheets.join(", ")}`,
      );
    }

    // Upsert singleton: delete existing, insert new
    const { data: existing } = await context.supabase
      .from("financeiro_sheet_config")
      .select("id")
      .limit(1)
      .maybeSingle();

    const payload = {
      spreadsheet_id: spreadsheetId,
      sheet_name: data.sheetName,
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
}): Promise<{ config: SheetConfig; title: string }> {
  const { data, error } = await context.supabase
    .from("financeiro_sheet_config")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Nenhuma planilha configurada.");
  const cfg = mapRow(data);
  const meta = await gwFetch(`/spreadsheets/${cfg.spreadsheetId}?fields=properties.title`);
  return { config: cfg, title: meta.properties?.title ?? "" };
}

export const previewSheetRows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { limit?: number }) => ({ limit: data?.limit ?? 10 }))
  .handler(async ({ data, context }): Promise<SheetPreview> => {
    await assertAdmin(context);
    const { config, title } = await loadConfig(context);
    // Headers row
    const headersRange = `${config.sheetName}!${config.headerRow}:${config.headerRow}`;
    const valuesRange = `${config.sheetName}!${config.range}`;
    const [headersRes, valuesRes] = await Promise.all([
      gwFetch(`/spreadsheets/${config.spreadsheetId}/values/${headersRange}`),
      gwFetch(`/spreadsheets/${config.spreadsheetId}/values/${valuesRange}`),
    ]);
    const headers: string[] = (headersRes.values?.[0] ?? []).map((v: any) => String(v ?? ""));
    const allRows: string[][] = (valuesRes.values ?? []).map((r: any[]) =>
      r.map((v) => String(v ?? "")),
    );
    return {
      headers,
      rows: allRows.slice(0, data.limit),
      totalRows: allRows.length,
      spreadsheetTitle: title,
    };
  });

function parseDate(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return t;
  const br = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return null;
}

function parseValor(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw
    .toString()
    .replace(/[R$\s]/gi, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

const TIPOS = new Set(["entrada", "saida"]);
const IMOBS = new Set(["cordial", "morar", "ambas"]);
const STATUSES = new Set(["Pago", "Pendente", "Atrasado", "Cancelado"]);

export const importSheetRows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ImportResult> => {
    await assertAdmin(context);
    const { config } = await loadConfig(context);

    const startRow = parseInt(config.range.match(/\d+/)?.[0] ?? "2", 10);
    const valuesRange = `${config.sheetName}!${config.range}`;
    const valuesRes = await gwFetch(
      `/spreadsheets/${config.spreadsheetId}/values/${valuesRange}`,
    );
    const rows: string[][] = (valuesRes.values ?? []).map((r: any[]) =>
      r.map((v) => String(v ?? "")),
    );

    // Preload corretores by email
    const { data: profs } = await context.supabase
      .from("profiles")
      .select("id,email");
    const emailToId = new Map<string, string>();
    for (const p of profs ?? []) {
      if (p.email) emailToId.set(String(p.email).toLowerCase().trim(), p.id);
    }

    const result: ImportResult = { inserted: 0, updated: 0, skipped: 0, errors: [] };
    const toUpsert: any[] = [];
    const originIds: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const linhaAbs = startRow + i;
      const cols = rows[i];
      if (!cols || cols.every((c) => !c.trim())) {
        continue; // skip blank rows silently
      }
      const [data, descricao, categoria, tipo, valorRaw, imobiliaria, status, corretorEmail] =
        cols.map((c) => (c ?? "").trim());

      const parsedData = parseDate(data ?? "");
      const parsedValor = parseValor(valorRaw ?? "");
      const tipoNorm = (tipo ?? "").toLowerCase();
      const imobNorm = (imobiliaria ?? "").toLowerCase();
      const statusNorm = status
        ? status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()
        : "Pendente";

      const problems: string[] = [];
      if (!parsedData) problems.push("data inválida");
      if (!descricao) problems.push("descrição vazia");
      if (!categoria) problems.push("categoria vazia");
      if (!TIPOS.has(tipoNorm)) problems.push("tipo deve ser entrada/saida");
      if (parsedValor === null || parsedValor <= 0) problems.push("valor inválido");
      if (!IMOBS.has(imobNorm)) problems.push("imobiliaria deve ser cordial/morar/ambas");
      if (!STATUSES.has(statusNorm))
        problems.push("status deve ser Pago/Pendente/Atrasado/Cancelado");

      let corretorId: string | null = null;
      if (corretorEmail) {
        const id = emailToId.get(corretorEmail.toLowerCase());
        if (!id) problems.push(`corretor não encontrado: ${corretorEmail}`);
        else corretorId = id;
      }

      if (problems.length) {
        result.errors.push({ linha: linhaAbs, motivo: problems.join("; ") });
        result.skipped++;
        continue;
      }

      const origemId = `${config.spreadsheetId}:${config.sheetName}!${linhaAbs}`;
      originIds.push(origemId);
      toUpsert.push({
        user_id: context.userId,
        imobiliaria: imobNorm,
        tipo: tipoNorm,
        categoria,
        descricao,
        valor: parsedValor,
        data_competencia: parsedData,
        status: statusNorm,
        origem: "google_sheets",
        origem_id: origemId,
        corretor_id: corretorId,
      });
    }

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
            corretor_id: row.corretor_id,
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
