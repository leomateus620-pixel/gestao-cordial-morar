/**
 * Configuração central e versionada da marca-d'água.
 * Qualquer mudança visual exige bump de WATERMARK_VERSION, porque a versão faz
 * parte da chave de idempotência do processamento.
 */

export const WATERMARK_VERSION = "v1";

export type WatermarkVariant = "cordial" | "morar" | "morar-cordial";
export type PublishTarget = "cordial" | "morar";

export const WATERMARK_GEOMETRY = {
  /** Largura da marca em relação à largura da foto. */
  widthRatioSingle: 0.15,
  widthRatioCombined: 0.18,
  minWidthPx: 96,
  maxWidthPx: 560,
  /** Margem em relação à menor dimensão da foto. */
  marginRatio: 0.025,
  minMarginPx: 18,
  /** Limites de saída. */
  maxOutputEdgePx: 2560,
  thumbnailWidthPx: 480,
  jpegQuality: 90,
  thumbnailQuality: 78,
} as const;

/** Limites de segurança para o arquivo recebido. */
export const WATERMARK_LIMITS = {
  maxBytes: 25 * 1024 * 1024,
  maxPixels: 60_000_000,
  minEdgePx: 200,
} as const;

export const ACCEPTED_IMAGE_MIME = ["image/jpeg", "image/png", "image/webp"] as const;

/** Destinos normalizados (ordenados e sem duplicatas). */
export function normalizeTargets(targets: readonly string[] | null | undefined): PublishTarget[] {
  const set = new Set<PublishTarget>();
  for (const value of targets ?? []) {
    if (value === "cordial" || value === "morar") set.add(value);
  }
  return (["cordial", "morar"] as PublishTarget[]).filter((t) => set.has(t));
}

/** Regra de negócio: destino do imóvel define a marca aplicada. */
export function variantForTargets(targets: readonly string[] | null | undefined): WatermarkVariant {
  const normalized = normalizeTargets(targets);
  if (normalized.length >= 2) return "morar-cordial";
  if (normalized[0] === "morar") return "morar";
  return "cordial";
}

/** Hash estável do destino + versão: muda quando a marca correta muda. */
export function destinationHash(targets: readonly string[] | null | undefined): string {
  return `${variantForTargets(targets)}@${WATERMARK_VERSION}`;
}

export function watermarkLabel(variant: WatermarkVariant): string {
  if (variant === "morar-cordial") return "Morar + Cordial";
  if (variant === "morar") return "Morar";
  return "Cordial";
}

/** Geometria calculada para uma foto concreta. */
export function computePlacement(
  photoWidth: number,
  photoHeight: number,
  markWidth: number,
  markHeight: number,
  variant: WatermarkVariant,
) {
  const ratio =
    variant === "morar-cordial"
      ? WATERMARK_GEOMETRY.widthRatioCombined
      : WATERMARK_GEOMETRY.widthRatioSingle;
  const target = Math.round(photoWidth * ratio);
  const width = Math.max(
    WATERMARK_GEOMETRY.minWidthPx,
    Math.min(WATERMARK_GEOMETRY.maxWidthPx, Math.min(target, Math.round(photoWidth * 0.4))),
  );
  const height = Math.max(1, Math.round((markHeight * width) / markWidth));
  const margin = Math.max(
    WATERMARK_GEOMETRY.minMarginPx,
    Math.round(Math.min(photoWidth, photoHeight) * WATERMARK_GEOMETRY.marginRatio),
  );
  return {
    width,
    height,
    x: Math.max(0, photoWidth - width - margin),
    y: Math.max(0, photoHeight - height - margin),
  };
}
