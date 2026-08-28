/**
 * Composição da marca-d'água (runtime Worker, via Photon/WASM).
 * Sempre parte do arquivo original privado e devolve derivadas novas —
 * o original nunca é sobrescrito.
 */
import {
  PhotonImage,
  SamplingFilter,
  fliph,
  flipv,
  resize,
  rotate,
  watermark as photonWatermark,
} from "@cf-wasm/photon";
import {
  WATERMARK_GEOMETRY,
  WATERMARK_LIMITS,
  WATERMARK_VERSION,
  computePlacement,
  type WatermarkVariant,
} from "./watermark-config";
import { WATERMARK_CORDIAL_V1 } from "./watermarks/watermark-cordial-v1";
import { WATERMARK_MORAR_V1 } from "./watermarks/watermark-morar-v1";
import { WATERMARK_MORAR_CORDIAL_V1 } from "./watermarks/watermark-morar-cordial-v1";

const TEMPLATES: Record<WatermarkVariant, string> = {
  cordial: WATERMARK_CORDIAL_V1,
  morar: WATERMARK_MORAR_V1,
  "morar-cordial": WATERMARK_MORAR_CORDIAL_V1,
};

export class WatermarkError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * As três marcas ficam decodificadas em cache de módulo: a logo-base nunca é
 * reconvertida a cada foto, só redimensionada para a geometria da imagem.
 */
const TEMPLATE_BYTES = new Map<WatermarkVariant, Uint8Array>();
function templateBytes(variant: WatermarkVariant): Uint8Array {
  const cached = TEMPLATE_BYTES.get(variant);
  if (cached) return cached;
  const bytes = base64ToBytes(TEMPLATES[variant]);
  TEMPLATE_BYTES.set(variant, bytes);
  return bytes;
}


/** Assinatura real do arquivo — não confiamos no MIME informado pelo navegador. */
export function detectImageType(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
    return "image/png";
  if (
    bytes.length > 12 &&
    String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!) === "RIFF" &&
    String.fromCharCode(bytes[8]!, bytes[9]!, bytes[10]!, bytes[11]!) === "WEBP"
  )
    return "image/webp";
  return null;
}

/** Orientação EXIF de JPEG (1..8); 1 quando ausente. */
export function readExifOrientation(bytes: Uint8Array): number {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1;
  let offset = 2;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  while (offset + 4 < bytes.length) {
    if (view.getUint8(offset) !== 0xff) break;
    const marker = view.getUint8(offset + 1);
    const size = view.getUint16(offset + 2, false);
    if (marker === 0xe1 && offset + 10 < bytes.length) {
      const exifStart = offset + 4;
      const header = String.fromCharCode(...bytes.slice(exifStart, exifStart + 4));
      if (header !== "Exif") return 1;
      const tiff = exifStart + 6;
      const little = view.getUint16(tiff, false) === 0x4949;
      const ifd = tiff + view.getUint32(tiff + 4, little);
      if (ifd + 2 > bytes.length) return 1;
      const entries = view.getUint16(ifd, little);
      for (let i = 0; i < entries; i += 1) {
        const entry = ifd + 2 + i * 12;
        if (entry + 12 > bytes.length) break;
        if (view.getUint16(entry, little) === 0x0112) {
          const value = view.getUint16(entry + 8, little);
          return value >= 1 && value <= 8 ? value : 1;
        }
      }
      return 1;
    }
    if (marker === 0xda) break;
    offset += 2 + size;
  }
  return 1;
}

function applyOrientation(image: PhotonImage, orientation: number): PhotonImage {
  switch (orientation) {
    case 2:
      fliph(image);
      return image;
    case 3:
      return rotate(image, 180);
    case 4:
      flipv(image);
      return image;
    case 5: {
      const rotated = rotate(image, 90);
      fliph(rotated);
      return rotated;
    }
    case 6:
      return rotate(image, 90);
    case 7: {
      const rotated = rotate(image, 270);
      fliph(rotated);
      return rotated;
    }
    case 8:
      return rotate(image, 270);
    default:
      return image;
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type WatermarkResult = {
  variant: WatermarkVariant;
  version: string;
  processed: Uint8Array;
  processedChecksum: string;
  thumbnail: Uint8Array;
  width: number;
  height: number;
};

/**
 * Aplica a marca correspondente ao destino. Reprocessar o mesmo original com a
 * mesma variante/versão produz o mesmo resultado (idempotente).
 */
export async function applyWatermark(
  original: Uint8Array,
  variant: WatermarkVariant,
): Promise<WatermarkResult> {
  if (!original.length) throw new WatermarkError("empty_file", "Arquivo de foto vazio.");
  if (original.length > WATERMARK_LIMITS.maxBytes)
    throw new WatermarkError("too_large", "Foto acima do tamanho máximo permitido.");
  const detected = detectImageType(original);
  if (!detected) throw new WatermarkError("invalid_type", "Arquivo não é uma imagem suportada.");

  let photo: PhotonImage;
  try {
    photo = PhotonImage.new_from_byteslice(original);
  } catch {
    throw new WatermarkError("decode_failed", "Não foi possível ler a foto enviada.");
  }

  if (photo.get_width() * photo.get_height() > WATERMARK_LIMITS.maxPixels)
    throw new WatermarkError("too_many_pixels", "Foto com resolução acima do limite.");

  if (detected === "image/jpeg") photo = applyOrientation(photo, readExifOrientation(original));

  const maxEdge = Math.max(photo.get_width(), photo.get_height());
  if (maxEdge > WATERMARK_GEOMETRY.maxOutputEdgePx) {
    const scale = WATERMARK_GEOMETRY.maxOutputEdgePx / maxEdge;
    photo = resize(
      photo,
      Math.max(1, Math.round(photo.get_width() * scale)),
      Math.max(1, Math.round(photo.get_height() * scale)),
      SamplingFilter.Lanczos3,
    );
  }

  if (Math.min(photo.get_width(), photo.get_height()) < WATERMARK_LIMITS.minEdgePx)
    throw new WatermarkError("too_small", "Foto pequena demais para publicação.");

  const template = PhotonImage.new_from_byteslice(base64ToBytes(TEMPLATES[variant]));
  const placement = computePlacement(
    photo.get_width(),
    photo.get_height(),
    template.get_width(),
    template.get_height(),
    variant,
  );
  const mark = resize(template, placement.width, placement.height, SamplingFilter.Lanczos3);
  photonWatermark(photo, mark, BigInt(placement.x), BigInt(placement.y));

  const processed = photo.get_bytes_jpeg(WATERMARK_GEOMETRY.jpegQuality);
  const thumbWidth = Math.min(WATERMARK_GEOMETRY.thumbnailWidthPx, photo.get_width());
  const thumb = resize(
    photo,
    thumbWidth,
    Math.max(1, Math.round((photo.get_height() * thumbWidth) / photo.get_width())),
    SamplingFilter.Nearest,
  );

  return {
    variant,
    version: WATERMARK_VERSION,
    processed,
    processedChecksum: await sha256Hex(processed),
    thumbnail: thumb.get_bytes_jpeg(WATERMARK_GEOMETRY.thumbnailQuality),
    width: photo.get_width(),
    height: photo.get_height(),
  };
}
