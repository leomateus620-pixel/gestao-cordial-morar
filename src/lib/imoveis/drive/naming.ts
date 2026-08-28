/**
 * Fonte única de nomes e classificação da Etapa 8 — Google Drive.
 * Módulo puro: sem React, sem Supabase, sem chamadas de rede — é o que
 * permite testar nome de pasta, nome de arquivo e orientação isoladamente.
 */

export type DriveCategory = "horizontal" | "vertical" | "video";

export const DRIVE_SUBFOLDERS: Record<DriveCategory, string> = {
  horizontal: "01 - Fotos Horizontais",
  vertical: "02 - Fotos Verticais",
  video: "03 - Vídeos",
};

/** Remove o que o Drive/So trata mal e normaliza espaços. */
export function sanitizeDriveSegment(value: string, max = 120): string {
  return (value || "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function sanitizeCode(code: string | null | undefined): string | null {
  const clean = sanitizeDriveSegment(String(code ?? ""), 32)
    .replace(/[^0-9A-Za-z._-]+/g, "")
    .trim();
  return clean ? clean : null;
}

/**
 * Nome da pasta principal. Cada provedor selecionado contribui com o seu
 * próprio código — nunca um código genérico quando há dois destinos.
 */
export function buildPropertyDriveFolderName(input: {
  cordialCode?: string | null;
  morarCode?: string | null;
  providers?: readonly string[] | null;
  fallback?: string | null;
}): string {
  const providers = new Set((input.providers ?? []).filter(Boolean));
  const cordial = sanitizeCode(input.cordialCode);
  const morar = sanitizeCode(input.morarCode);
  const parts: string[] = [];
  if ((providers.size === 0 || providers.has("cordial")) && cordial)
    parts.push(`CORDIAL ${cordial}`);
  if ((providers.size === 0 || providers.has("morar")) && morar) parts.push(`MORAR ${morar}`);
  if (!parts.length) {
    const fallback = sanitizeCode(input.fallback) ?? "SEM CÓDIGO";
    parts.push(fallback);
  }
  return sanitizeDriveSegment(`IMÓVEL - ${parts.join(" - ")}`, 240);
}

/** Prefixo usado nos arquivos: reflete os mesmos códigos da pasta. */
export function buildFilePrefix(input: {
  cordialCode?: string | null;
  morarCode?: string | null;
  providers?: readonly string[] | null;
  fallback?: string | null;
}): string {
  const providers = new Set((input.providers ?? []).filter(Boolean));
  const cordial = sanitizeCode(input.cordialCode);
  const morar = sanitizeCode(input.morarCode);
  const parts: string[] = [];
  if ((providers.size === 0 || providers.has("cordial")) && cordial)
    parts.push(`CORDIAL-${cordial}`);
  if ((providers.size === 0 || providers.has("morar")) && morar) parts.push(`MORAR-${morar}`);
  if (!parts.length) parts.push(sanitizeCode(input.fallback) ?? "IMOVEL");
  return parts.join("_");
}

export function extensionFor(mimeType: string | null | undefined, fileName: string): string {
  const byMime: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
  };
  const mapped = byMime[(mimeType ?? "").toLowerCase()];
  if (mapped) return mapped;
  const guess = fileName.split(".").pop();
  return guess && /^[A-Za-z0-9]{2,5}$/.test(guess) ? guess.toLowerCase() : "bin";
}

/** Nome previsível e ordenável, com o índice preservando a ordem do cadastro. */
export function buildDriveFileName(input: {
  prefix: string;
  category: DriveCategory;
  index: number;
  mimeType?: string | null;
  originalName: string;
}): string {
  const label = input.category === "video" ? "VIDEO" : input.category.toUpperCase();
  const seq = String(Math.max(1, input.index)).padStart(3, "0");
  const ext = extensionFor(input.mimeType, input.originalName);
  return sanitizeDriveSegment(`${input.prefix}_${label}_${seq}.${ext}`, 200);
}

/**
 * Classificação pela dimensão real (já corrigida por EXIF no pipeline de marca).
 * Quadrada segue como horizontal — regra operacional, corrigível na interface.
 */
export function classifyOrientation(input: {
  width?: number | null;
  height?: number | null;
  override?: string | null;
}): Exclude<DriveCategory, "video"> {
  if (input.override === "horizontal" || input.override === "vertical") return input.override;
  const w = input.width ?? 0;
  const h = input.height ?? 0;
  if (h > w && h > 0) return "vertical";
  return "horizontal";
}

/** Extrai o ID de uma pasta a partir do link compartilhado do Google Drive. */
export function parseDriveFolderId(link: string): string | null {
  const value = (link ?? "").trim();
  if (!value) return null;
  if (/^[A-Za-z0-9_-]{15,}$/.test(value)) return value;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (!/(^|\.)google\.com$/.test(url.hostname)) return null;
  const fromPath = url.pathname.match(/\/folders\/([A-Za-z0-9_-]{15,})/);
  if (fromPath?.[1]) return fromPath[1];
  const id = url.searchParams.get("id");
  return id && /^[A-Za-z0-9_-]{15,}$/.test(id) ? id : null;
}
