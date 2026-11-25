// Preparação de fotos com pouca memória: decodifica já reduzida quando o
// navegador permite, gera miniatura para prévia local e limita o original.

export const MAX_SIDE = 2048;
export const THUMB_SIDE = 360;
export const ORIGINAL_LIMIT = 15 * 1024 * 1024;
export const TOO_BIG_MESSAGE =
  "Esta foto é grande demais para este aparelho. Tire de novo pela Câmera do app.";

export type ImageHeader = { width: number; height: number; orientation: number };

function u16(b: Uint8Array, o: number, le: boolean) {
  return le ? b[o]! | (b[o + 1]! << 8) : (b[o]! << 8) | b[o + 1]!;
}
function u32(b: Uint8Array, o: number, le: boolean) {
  return le
    ? (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0
    : ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0;
}

function exifOrientation(b: Uint8Array, start: number, end: number): number {
  // start aponta para "Exif\0\0"
  if (end - start < 14) return 1;
  if (String.fromCharCode(b[start]!, b[start + 1]!, b[start + 2]!, b[start + 3]!) !== "Exif") return 1;
  const t = start + 6;
  const le = b[t] === 0x49 && b[t + 1] === 0x49;
  if (!le && !(b[t] === 0x4d && b[t + 1] === 0x4d)) return 1;
  const ifd = t + u32(b, t + 4, le);
  if (ifd + 2 > end) return 1;
  const n = u16(b, ifd, le);
  for (let i = 0; i < n; i++) {
    const e = ifd + 2 + i * 12;
    if (e + 12 > end) break;
    if (u16(b, e, le) === 0x0112) {
      const v = u16(b, e + 8, le);
      return v >= 1 && v <= 8 ? v : 1;
    }
  }
  return 1;
}

/** Lê largura, altura e orientação EXIF do início do arquivo (JPEG, PNG, WebP). */
export function readImageHeader(b: Uint8Array): ImageHeader | null {
  if (b.length >= 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)
    return { width: u32(b, 16, false), height: u32(b, 20, false), orientation: 1 };
  if (
    b.length >= 30 &&
    String.fromCharCode(b[0]!, b[1]!, b[2]!, b[3]!) === "RIFF" &&
    String.fromCharCode(b[8]!, b[9]!, b[10]!, b[11]!) === "WEBP"
  ) {
    const kind = String.fromCharCode(b[12]!, b[13]!, b[14]!, b[15]!);
    if (kind === "VP8X")
      return {
        width: 1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16)),
        height: 1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16)),
        orientation: 1,
      };
    if (kind === "VP8 ")
      return { width: u16(b, 26, true) & 0x3fff, height: u16(b, 28, true) & 0x3fff, orientation: 1 };
    if (kind === "VP8L") {
      const bits = u32(b, 21, true);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, orientation: 1 };
    }
    return null;
  }
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let o = 2;
  let orientation = 1;
  while (o + 4 <= b.length) {
    if (b[o] !== 0xff) return null;
    const marker = b[o + 1]!;
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
      o += 2;
      continue;
    }
    const len = u16(b, o + 2, false);
    if (len < 2) return null;
    if (marker === 0xe1) orientation = exifOrientation(b, o + 4, Math.min(b.length, o + 2 + len));
    const sof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (sof) {
      if (o + 9 > b.length) return null;
      const height = u16(b, o + 5, false);
      const width = u16(b, o + 7, false);
      return width && height ? { width, height, orientation } : null;
    }
    o += 2 + len;
  }
  return null;
}

/** Tamanho como a foto aparece (orientações 5–8 giram 90°). */
export function orientedSize(h: ImageHeader) {
  return h.orientation >= 5 ? { width: h.height, height: h.width } : { width: h.width, height: h.height };
}

export function fitWithin(width: number, height: number, max: number) {
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function canKeepOriginal(file: { type: string; size: number }) {
  return (file.type === "image/jpeg" || file.type === "image/png") && file.size <= ORIGINAL_LIMIT;
}

type Drawable = CanvasImageSource & { width: number; height: number };
type Surface = {
  draw(src: CanvasImageSource, w: number, h: number): void;
  toBlob(quality: number): Promise<Blob>;
  release(): void;
};

export type PrepareDeps = {
  createImageBitmap?: (src: Blob, opts?: ImageBitmapOptions) => Promise<ImageBitmap>;
  loadImage?: (src: Blob) => Promise<{ image: Drawable; release: () => void }>;
  surface?: (w: number, h: number) => Surface;
};

function defaultSurface(w: number, h: number): Surface {
  const canvas: OffscreenCanvas | HTMLCanvasElement =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(w, h)
      : Object.assign(document.createElement("canvas"), { width: w, height: h });
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) throw new Error("Sem suporte a imagem neste aparelho");
  return {
    draw(src, dw, dh) {
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(src, 0, 0, dw, dh);
    },
    toBlob(quality) {
      if ("convertToBlob" in canvas) return canvas.convertToBlob({ type: "image/jpeg", quality });
      return new Promise((res, rej) =>
        (canvas as HTMLCanvasElement).toBlob(
          (b) => (b ? res(b) : rej(new Error("Falha ao converter a foto"))),
          "image/jpeg",
          quality,
        ),
      );
    },
    release() {
      canvas.width = 0;
      canvas.height = 0;
    },
  };
}

async function defaultLoadImage(src: Blob) {
  const url = URL.createObjectURL(src);
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  try {
    await img.decode();
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
  return {
    image: Object.assign(img, { width: img.naturalWidth, height: img.naturalHeight }) as Drawable,
    release: () => {
      img.src = "";
      URL.revokeObjectURL(url);
    },
  };
}

/** Opções de decodificação reduzida calculadas pelo cabeçalho (já com a orientação). */
export function reducedDecodeOptions(header: ImageHeader) {
  const o = orientedSize(header);
  const t = fitWithin(o.width, o.height, MAX_SIDE);
  return { imageOrientation: "from-image", resizeWidth: t.width, resizeQuality: "high" } as const;
}

export type PreparedImage = { blob: Blob; width: number; height: number; thumb: Blob | null };

/** Decodifica reduzida, desenha em no máx. 2048 px, gera miniatura e libera tudo. */
export async function prepareImageReduced(file: Blob, deps: PrepareDeps = {}): Promise<PreparedImage> {
  const cib =
    deps.createImageBitmap ??
    (typeof createImageBitmap === "function" ? createImageBitmap.bind(globalThis) : undefined);
  const surface = deps.surface ?? defaultSurface;
  const head = new Uint8Array(await file.slice(0, 65536).arrayBuffer());
  const header = readImageHeader(head);

  let source: Drawable | null = null;
  let release = () => undefined as void;
  if (header && cib) {
    try {
      // Só a largura: mantém a proporção mesmo se o navegador girar depois de reduzir.
      const bmp = await cib(file, reducedDecodeOptions(header) as ImageBitmapOptions);
      source = bmp;
      release = () => bmp.close();
    } catch {
      source = null;
    }
  }
  if (!source) {
    // Caminho alternativo: cabeçalho ilegível ou sem suporte a redução.
    const loaded = await (deps.loadImage ?? defaultLoadImage)(file);
    source = loaded.image;
    release = loaded.release;
  }
  try {
    const out = fitWithin(source.width, source.height, MAX_SIDE);
    const main = surface(out.width, out.height);
    let blob: Blob;
    try {
      main.draw(source, out.width, out.height);
      blob = await main.toBlob(0.85);
    } finally {
      main.release();
    }
    let thumb: Blob | null = null;
    try {
      const ts = fitWithin(source.width, source.height, THUMB_SIDE);
      const small = surface(ts.width, ts.height);
      try {
        small.draw(source, ts.width, ts.height);
        thumb = await small.toBlob(0.7);
      } finally {
        small.release();
      }
    } catch {
      thumb = null;
    }
    return { blob, width: out.width, height: out.height, thumb };
  } finally {
    release();
  }
}
