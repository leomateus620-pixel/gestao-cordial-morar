/**
 * Composição da marca-d'água no navegador (Canvas 2D).
 * O runtime do servidor publicado não permite compilar WebAssembly, então a
 * marca passa a ser aplicada aqui, com a mesma geometria versionada usada antes
 * pelo processador do servidor. O original continua sendo enviado intacto.
 */
import {
  WATERMARK_GEOMETRY,
  WATERMARK_LIMITS,
  WATERMARK_VERSION,
  computePlacement,
  destinationHash,
  variantForTargets,
  type WatermarkVariant,
} from "./watermark-config";

export type ComposedUpload = {
  original: { blob: Blob; fileName: string; mimeType: string };
  processed: { blob: Blob; checksum: string; width: number; height: number };
  thumbnail: { blob: Blob };
  variant: WatermarkVariant;
  version: string;
  destinationHash: string;
};

let templatePromise: Promise<ImageBitmap> | null = null;

/** O template pesa alguns centenas de KB: só é baixado no primeiro upload. */
async function loadTemplate(): Promise<ImageBitmap> {
  templatePromise ??= (async () => {
    const { WATERMARK_MORAR_CORDIAL_V1 } = await import(
      "./watermarks/watermark-morar-cordial-v1"
    );
    const binary = atob(WATERMARK_MORAR_CORDIAL_V1);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return createImageBitmap(new Blob([bytes], { type: "image/png" }));
  })();
  return templatePromise;
}

function jpegName(name: string): string {
  return name.replace(/\.[a-z0-9]+$/i, "") + ".jpg";
}

async function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );
  if (!blob || !blob.size) throw new Error("Não foi possível gerar a foto com a marca.");
  return blob;
}

async function sha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Gera, em uma passada só: o original preservado, a versão com a marca
 * Morar + Cordial e a miniatura.
 */
export async function composeWatermarkedUpload(file: File): Promise<ComposedUpload> {
  if (!file.size) throw new Error("Arquivo de foto vazio.");
  if (file.size > WATERMARK_LIMITS.maxBytes) throw new Error("Foto acima do tamanho permitido.");
  if (typeof createImageBitmap !== "function")
    throw new Error("Este navegador não consegue preparar a foto. Atualize o navegador.");

  const variant = variantForTargets();
  // imageOrientation resolve o EXIF antes de qualquer desenho.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => {
    throw new Error("Não foi possível ler a foto enviada.");
  });

  try {
    if (bitmap.width * bitmap.height > WATERMARK_LIMITS.maxPixels)
      throw new Error("Foto com resolução acima do limite.");
    const maxEdge = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, WATERMARK_GEOMETRY.maxOutputEdgePx / maxEdge);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    if (Math.min(width, height) < WATERMARK_LIMITS.minEdgePx)
      throw new Error("Foto pequena demais para publicação.");

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Não foi possível preparar a foto neste navegador.");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, width, height);

    const mark = await loadTemplate();
    const placement = computePlacement(width, height, mark.width, mark.height, variant);
    ctx.globalAlpha = WATERMARK_GEOMETRY.opacity;
    ctx.drawImage(mark, placement.x, placement.y, placement.width, placement.height);
    ctx.globalAlpha = 1;

    const processed = await toBlob(canvas, WATERMARK_GEOMETRY.jpegQuality / 100);

    const thumbWidth = Math.min(WATERMARK_GEOMETRY.thumbnailWidthPx, width);
    const thumbCanvas = document.createElement("canvas");
    thumbCanvas.width = thumbWidth;
    thumbCanvas.height = Math.max(1, Math.round((height * thumbWidth) / width));
    const thumbCtx = thumbCanvas.getContext("2d");
    if (!thumbCtx) throw new Error("Não foi possível preparar a miniatura da foto.");
    thumbCtx.imageSmoothingEnabled = true;
    thumbCtx.imageSmoothingQuality = "high";
    thumbCtx.drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
    const thumbnail = await toBlob(thumbCanvas, WATERMARK_GEOMETRY.thumbnailQuality / 100);

    return {
      original: {
        blob: file,
        fileName: file.name,
        mimeType: file.type || "image/jpeg",
      },
      processed: {
        blob: processed,
        checksum: await sha256(processed),
        width,
        height,
      },
      thumbnail: { blob: thumbnail },
      variant,
      version: WATERMARK_VERSION,
      destinationHash: destinationHash(),
    };
  } finally {
    bitmap.close?.();
  }
}

export { jpegName };
