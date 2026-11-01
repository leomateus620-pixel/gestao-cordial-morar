/** Funções do navegador: preparar fotos, preset sem IA, envio e ZIP. */
import { supabase } from "@/integrations/supabase/client";
import { REALCE_WORK_MAX_EDGE, isHeic, resultFileName } from "./model";

export type PreparedPhoto = {
  work: Blob;
  width: number;
  height: number;
  thumbUrl: string;
};

async function decode(file: Blob): Promise<ImageBitmap> {
  // createImageBitmap aplica a orientação EXIF por padrão.
  return createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
}

function toBlob(canvas: HTMLCanvasElement, quality = 0.93): Promise<Blob> {
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), "image/jpeg", quality));
}

/** Converte HEIC quando preciso, aplica orientação e gera cópia de trabalho JPEG (sem EXIF/GPS) e miniatura. */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  let source: Blob = file;
  if (isHeic(file)) {
    try {
      source = await decode(file).then(() => file);
    } catch {
      const { default: heic2any } = await import("heic2any");
      const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.95 });
      source = Array.isArray(converted) ? converted[0]! : converted;
    }
  }
  const bmp = await decode(source);
  const scale = Math.min(1, REALCE_WORK_MAX_EDGE / Math.max(bmp.width, bmp.height));
  const width = Math.round(bmp.width * scale);
  const height = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, 0, 0, width, height);
  const work = await toBlob(canvas);
  const ts = Math.min(1, 480 / Math.max(width, height));
  const t = document.createElement("canvas");
  t.width = Math.round(width * ts);
  t.height = Math.round(height * ts);
  t.getContext("2d")!.drawImage(canvas, 0, 0, t.width, t.height);
  const thumb = await toBlob(t, 0.8);
  bmp.close();
  return { work, width, height, thumbUrl: URL.createObjectURL(thumb) };
}

/**
 * Preset fotográfico controlado (sem IA): equilíbrio de branco parcial, sombras mais claras,
 * proteção dos realces, contraste e saturação discretos e nitidez leve.
 */
export async function applyNaturalPreset(work: Blob): Promise<{ blob: Blob; width: number; height: number }> {
  const bmp = await decode(work);
  const { width: w, height: h } = bmp;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  let sr = 0, sg = 0, sb = 0, n = 0, sumL = 0;
  for (let i = 0; i < d.length; i += 16) {
    const l = 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
    sumL += l;
    if (l > 30 && l < 235) { sr += d[i]!; sg += d[i + 1]!; sb += d[i + 2]!; n++; }
  }
  const meanL = sumL / (d.length / 16);
  const avg = n ? (sr + sg + sb) / (3 * n) : 128;
  const k = 0.35; // equilíbrio parcial, evita neutralizar tons reais
  const gr = n ? 1 + k * (avg / (sr / n) - 1) : 1;
  const gg = n ? 1 + k * (avg / (sg / n) - 1) : 1;
  const gb = n ? 1 + k * (avg / (sb / n) - 1) : 1;
  const lift = Math.max(0, Math.min(0.22, (118 - meanL) / 260)) + 0.04;
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) {
    let x = v / 255;
    x = x + lift * x * (1 - x) * 2.2 * (1 - x); // clareia sombras
    x = x - 0.06 * Math.max(0, x - 0.82); // segura realces
    x = x + 0.08 * (x - 0.5) * (1 - Math.abs(2 * x - 1)); // contraste suave
    lut[v] = Math.round(Math.max(0, Math.min(1, x)) * 255);
  }
  const sat = 1.08;
  for (let i = 0; i < d.length; i += 4) {
    let r = lut[Math.min(255, Math.round(d[i]! * gr))]!;
    let g = lut[Math.min(255, Math.round(d[i + 1]! * gg))]!;
    let b = lut[Math.min(255, Math.round(d[i + 2]! * gb))]!;
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = l + (r - l) * sat; g = l + (g - l) * sat; b = l + (b - l) * sat;
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }
  ctx.putImageData(img, 0, 0);
  // Nitidez leve: mistura com uma versão desfocada (unsharp).
  const blur = document.createElement("canvas");
  blur.width = w; blur.height = h;
  const bctx = blur.getContext("2d")!;
  bctx.filter = "blur(1.2px)";
  bctx.drawImage(canvas, 0, 0);
  const bd = bctx.getImageData(0, 0, w, h).data;
  const sd = ctx.getImageData(0, 0, w, h);
  const s = sd.data;
  for (let i = 0; i < s.length; i += 4) {
    s[i] = s[i]! + 0.35 * (s[i]! - bd[i]!);
    s[i + 1] = s[i + 1]! + 0.35 * (s[i + 1]! - bd[i + 1]!);
    s[i + 2] = s[i + 2]! + 0.35 * (s[i + 2]! - bd[i + 2]!);
  }
  ctx.putImageData(sd, 0, 0);
  return { blob: await toBlob(canvas, 0.93), width: w, height: h };
}

export async function signedUrl(path: string, download?: string) {
  const { data, error } = await supabase.storage.from("realce").createSignedUrl(path, 600, download ? { download } : undefined);
  if (error || !data) throw new Error("Não foi possível abrir o arquivo.");
  return data.signedUrl;
}

export async function downloadResult(path: string, originalName: string) {
  const url = await signedUrl(path, resultFileName(originalName));
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  a.click();
}

export async function downloadZip(items: { path: string; originalName: string }[], zipName: string) {
  const { zipSync } = await import("fflate");
  const files: Record<string, Uint8Array> = {};
  const used = new Set<string>();
  for (const it of items) {
    const { data, error } = await supabase.storage.from("realce").download(it.path);
    if (error || !data) continue;
    let name = resultFileName(it.originalName);
    for (let i = 2; used.has(name); i++) name = name.replace(/(-\d+)?-realce\.jpg$/, `-${i}-realce.jpg`);
    used.add(name);
    files[name] = new Uint8Array(await data.arrayBuffer());
  }
  const zip = zipSync(files, { level: 0 });
  const url = URL.createObjectURL(new Blob([zip as BlobPart], { type: "application/zip" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = zipName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
