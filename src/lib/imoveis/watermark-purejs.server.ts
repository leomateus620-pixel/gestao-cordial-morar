/**
 * Marca-d'água em JavaScript puro (sem WebAssembly).
 *
 * O servidor publicado não carrega o módulo WASM do Photon ("No such module
 * wasm/photon_rs_bg-*.wasm"), então este caminho é usado sempre que o Photon
 * não inicializa. Mesma geometria, mesmo resultado lógico: orientação EXIF,
 * limite de 2560 px, marca no canto inferior direito, JPEG q90 + miniatura.
 */
import jpeg from "jpeg-js";
import { decode as decodePng } from "fast-png";

export type Raster = { width: number; height: number; data: Uint8Array }; // RGBA

export function decodeRaster(bytes: Uint8Array, type: string): Raster {
  if (type === "image/jpeg") {
    const img = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 1024, maxResolutionInMP: 60 });
    return { width: img.width, height: img.height, data: img.data as Uint8Array };
  }
  if (type === "image/png") {
    const png = decodePng(bytes);
    const { width, height } = png;
    const src = png.data as Uint8Array | Uint16Array;
    const ch = png.channels;
    const shift = png.depth === 16 ? 8 : 0;
    const out = new Uint8Array(width * height * 4);
    for (let i = 0, j = 0; i < width * height; i += 1, j += ch) {
      const g = (v: number) => (shift ? v >> 8 : v);
      if (ch >= 3) {
        out[i * 4] = g(src[j]!); out[i * 4 + 1] = g(src[j + 1]!); out[i * 4 + 2] = g(src[j + 2]!);
        out[i * 4 + 3] = ch === 4 ? g(src[j + 3]!) : 255;
      } else {
        const v = g(src[j]!);
        out[i * 4] = v; out[i * 4 + 1] = v; out[i * 4 + 2] = v;
        out[i * 4 + 3] = ch === 2 ? g(src[j + 1]!) : 255;
      }
    }
    return { width, height, data: out };
  }
  throw new Error("unsupported");
}

export function encodeJpeg(r: Raster, quality: number): Uint8Array {
  const out = jpeg.encode({ width: r.width, height: r.height, data: r.data }, quality);
  return new Uint8Array(out.data);
}

/** Orientação EXIF 1..8 → pixels na orientação correta. */
export function orient(r: Raster, o: number): Raster {
  if (o <= 1 || o > 8) return r;
  const { width: w, height: h, data } = r;
  const swap = o >= 5;
  const nw = swap ? h : w;
  const nh = swap ? w : h;
  const out = new Uint8Array(nw * nh * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let nx: number; let ny: number;
      switch (o) {
        case 2: nx = w - 1 - x; ny = y; break;
        case 3: nx = w - 1 - x; ny = h - 1 - y; break;
        case 4: nx = x; ny = h - 1 - y; break;
        case 5: nx = y; ny = x; break;
        case 6: nx = h - 1 - y; ny = x; break;
        case 7: nx = h - 1 - y; ny = w - 1 - x; break;
        default: nx = y; ny = w - 1 - x; break; // 8
      }
      const s = (y * w + x) * 4; const d = (ny * nw + nx) * 4;
      out[d] = data[s]!; out[d + 1] = data[s + 1]!; out[d + 2] = data[s + 2]!; out[d + 3] = data[s + 3]!;
    }
  }
  return { width: nw, height: nh, data: out };
}

/** Redução por média de área (boa qualidade para reduzir); ampliação bilinear. */
export function resizeRaster(r: Raster, nw: number, nh: number): Raster {
  const { width: w, height: h, data } = r;
  const out = new Uint8Array(nw * nh * 4);
  if (nw >= w || nh >= h) {
    for (let y = 0; y < nh; y += 1) {
      const fy = Math.min(h - 1, ((y + 0.5) * h) / nh - 0.5);
      const y0 = Math.max(0, Math.floor(fy)); const y1 = Math.min(h - 1, y0 + 1); const ty = Math.max(0, fy - y0);
      for (let x = 0; x < nw; x += 1) {
        const fx = Math.min(w - 1, ((x + 0.5) * w) / nw - 0.5);
        const x0 = Math.max(0, Math.floor(fx)); const x1 = Math.min(w - 1, x0 + 1); const tx = Math.max(0, fx - x0);
        for (let c = 0; c < 4; c += 1) {
          const a = data[(y0 * w + x0) * 4 + c]!; const b = data[(y0 * w + x1) * 4 + c]!;
          const d = data[(y1 * w + x0) * 4 + c]!; const e = data[(y1 * w + x1) * 4 + c]!;
          out[(y * nw + x) * 4 + c] = Math.round((a * (1 - tx) + b * tx) * (1 - ty) + (d * (1 - tx) + e * tx) * ty);
        }
      }
    }
    return { width: nw, height: nh, data: out };
  }
  const sx = w / nw; const sy = h / nh;
  const acc = new Float64Array(4);
  for (let y = 0; y < nh; y += 1) {
    const ys = Math.floor(y * sy); const ye = Math.max(ys + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < nw; x += 1) {
      const xs = Math.floor(x * sx); const xe = Math.max(xs + 1, Math.floor((x + 1) * sx));
      acc.fill(0); let n = 0;
      for (let yy = ys; yy < ye && yy < h; yy += 1) {
        let p = (yy * w + xs) * 4;
        for (let xx = xs; xx < xe && xx < w; xx += 1, p += 4) {
          acc[0]! += data[p]!; acc[1]! += data[p + 1]!; acc[2]! += data[p + 2]!; acc[3]! += data[p + 3]!; n += 1;
        }
      }
      const d = (y * nw + x) * 4;
      out[d] = acc[0]! / n; out[d + 1] = acc[1]! / n; out[d + 2] = acc[2]! / n; out[d + 3] = acc[3]! / n;
    }
  }
  return { width: nw, height: nh, data: out };
}

/** Composição alfa da marca sobre a foto (a foto fica opaca). */
export function overlay(photo: Raster, mark: Raster, x0: number, y0: number): void {
  for (let y = 0; y < mark.height; y += 1) {
    const py = y0 + y; if (py < 0 || py >= photo.height) continue;
    for (let x = 0; x < mark.width; x += 1) {
      const px = x0 + x; if (px < 0 || px >= photo.width) continue;
      const m = (y * mark.width + x) * 4; const a = mark.data[m + 3]! / 255;
      if (a <= 0) continue;
      const p = (py * photo.width + px) * 4;
      for (let c = 0; c < 3; c += 1) photo.data[p + c] = Math.round(mark.data[m + c]! * a + photo.data[p + c]! * (1 - a));
      photo.data[p + 3] = 255;
    }
  }
}
