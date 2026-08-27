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

/**
 * Regra de negócio: a marca combinada Morar + Cordial é aplicada em todas as
 * fotos, independentemente do site de destino. As variantes individuais ficam
 * apenas para leitura de registros antigos.
 */
export function variantForTargets(_targets?: readonly string[] | null): WatermarkVariant {
  return "morar-cordial";
}

/** Hash estável da marca: depende só da versão do template. */
export function destinationHash(_targets?: readonly string[] | null): string {
  return `morar-cordial@${WATERMARK_VERSION}`;
}
/** Rótulo da marca aplicada em todas as fotos. */
export const WATERMARK_COMBINED_LABEL = "Morar + Cordial";

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
