import assert from "node:assert/strict";
import test from "node:test";
import {
  canKeepOriginal,
  fitWithin,
  ORIGINAL_LIMIT,
  ImageMemoryError,
  prepareImageReduced,
  readImageHeader,
  reducedDecodeOptions,
  type PrepareDeps,
} from "./image-prepare";

function jpeg(width: number, height: number, orientation?: number): Uint8Array {
  const parts: number[] = [0xff, 0xd8];
  if (orientation) {
    // APP1 Exif, TIFF big-endian, 1 entrada (0x0112)
    const tiff = [
      0x4d,
      0x4d,
      0,
      42,
      0,
      0,
      0,
      8,
      0,
      1,
      0x01,
      0x12,
      0,
      3,
      0,
      0,
      0,
      1,
      0,
      orientation,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    ];
    const body = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
    const len = body.length + 2;
    parts.push(0xff, 0xe1, len >> 8, len & 255, ...body);
  }
  parts.push(
    0xff,
    0xc0,
    0,
    17,
    8,
    height >> 8,
    height & 255,
    width >> 8,
    width & 255,
    3,
    ...new Array(9).fill(0),
  );
  return new Uint8Array(parts);
}
function png(width: number, height: number) {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, width);
  new DataView(b.buffer).setUint32(20, height);
  return b;
}

test("lê tamanho e orientação do cabeçalho JPEG/PNG", () => {
  assert.deepEqual(readImageHeader(jpeg(4000, 3000)), {
    width: 4000,
    height: 3000,
    orientation: 1,
  });
  assert.deepEqual(readImageHeader(jpeg(4000, 3000, 6)), {
    width: 4000,
    height: 3000,
    orientation: 6,
  });
  assert.deepEqual(readImageHeader(png(800, 600)), { width: 800, height: 600, orientation: 1 });
  assert.equal(readImageHeader(new Uint8Array([1, 2, 3, 4, 5])), null);
});

test("orientação EXIF 6 e 8 troca largura/altura no cálculo da redução", () => {
  assert.equal(
    reducedDecodeOptions({ width: 4000, height: 3000, orientation: 1 }).resizeWidth,
    2048,
  );
  assert.equal(
    reducedDecodeOptions({ width: 4000, height: 3000, orientation: 6 }).resizeWidth,
    1536,
  );
  assert.equal(
    reducedDecodeOptions({ width: 4000, height: 3000, orientation: 8 }).resizeWidth,
    1536,
  );
  assert.equal(
    reducedDecodeOptions({ width: 1000, height: 800, orientation: 1 }).resizeWidth,
    1000,
  );
  assert.deepEqual(fitWithin(8000, 6000, 2048), { width: 2048, height: 1536 });
});

function deps(opts: { resize: boolean; fail?: boolean }) {
  const calls: {
    cib: ImageBitmapOptions[];
    load: number;
    draws: Array<[number, number]>;
    closed: number;
    released: number;
  } = {
    cib: [],
    load: 0,
    draws: [],
    closed: 0,
    released: 0,
  };
  const d: PrepareDeps = {
    createImageBitmap: async (_b, o) => {
      calls.cib.push(o!);
      if (opts.fail) throw new Error("sem suporte");
      const w = opts.resize ? (o as { resizeWidth: number }).resizeWidth : 4000;
      const h = Math.round((w * 3) / 4);
      return { width: w, height: h, close: () => calls.closed++ } as unknown as ImageBitmap;
    },
    loadImage: async () => {
      calls.load++;
      return { image: { width: 4000, height: 3000 } as never, release: () => calls.released++ };
    },
    surface: (w, h) => ({
      image: { width: w, height: h } as HTMLCanvasElement,
      draw: () => calls.draws.push([w, h]),
      toBlob: async () => new Blob([new Uint8Array(w)], { type: "image/jpeg" }),
      release: () => undefined,
    }),
  };
  return { d, calls };
}
const file = (bytes: Uint8Array) =>
  new Blob([bytes as BlobPart, new Uint8Array(100)], { type: "image/jpeg" });

test("com suporte a redução: decodifica já reduzida, gera 2048 + miniatura 360 e libera", async () => {
  const { d, calls } = deps({ resize: true });
  const r = await prepareImageReduced(file(jpeg(4000, 3000)), d);
  assert.equal((calls.cib[0] as { resizeWidth: number }).resizeWidth, 2048);
  assert.deepEqual([r.width, r.height], [2048, 1536]);
  assert.deepEqual(calls.draws, [
    [2048, 1536],
    [360, 270],
  ]);
  assert.ok(r.thumb);
  assert.equal(calls.closed, 1);
  assert.equal(calls.load, 0);
});

test("sem suporte a redução (navegador ignora): ainda limita a 2048", async () => {
  const { d, calls } = deps({ resize: false });
  const r = await prepareImageReduced(file(jpeg(4000, 3000)), d);
  assert.deepEqual([r.width, r.height], [2048, 1536]);
  assert.equal(calls.closed, 1);
});

test("createImageBitmap falha ou cabeçalho ilegível: caminho alternativo", async () => {
  const a = deps({ resize: true, fail: true });
  await prepareImageReduced(file(jpeg(4000, 3000)), a.d);
  assert.equal(a.calls.load, 1);
  assert.equal(a.calls.released, 1);
  const b = deps({ resize: true });
  const r = await prepareImageReduced(new Blob([new Uint8Array(50)], { type: "image/heic" }), b.d);
  assert.equal(b.calls.cib.length, 0);
  assert.equal(b.calls.load, 1);
  assert.equal(r.width, 2048);
});

test("original só JPEG/PNG até 15 MB", () => {
  assert.equal(canKeepOriginal({ type: "image/jpeg", size: ORIGINAL_LIMIT }), true);
  assert.equal(canKeepOriginal({ type: "image/png", size: 1000 }), true);
  assert.equal(canKeepOriginal({ type: "image/jpeg", size: ORIGINAL_LIMIT + 1 }), false);
  assert.equal(canKeepOriginal({ type: "image/heic", size: 1000 }), false);
});

test("foto de 48 MP sem redução é interceptada antes da decodificação integral", async () => {
  const { d, calls } = deps({ resize: false, fail: true });
  await assert.rejects(prepareImageReduced(file(jpeg(8000, 6000)), d), ImageMemoryError);
  assert.equal(calls.load, 0);
  assert.deepEqual(calls.draws, []);
});

test("libera a imagem decodificada antes de codificar e tira a miniatura do mesmo quadro", async () => {
  const { d, calls } = deps({ resize: true });
  const main = { width: 2048, height: 1536 } as HTMLCanvasElement;
  const small = { width: 360, height: 270 } as HTMLCanvasElement;
  d.surface = (width) => ({
    image: width === 2048 ? main : small,
    draw: (source) => {
      if (width === 360) assert.equal(source, main);
    },
    toBlob: async () => {
      assert.equal(calls.closed, 1);
      return new Blob();
    },
    release: () => undefined,
  });
  await prepareImageReduced(file(jpeg(4000, 3000)), d);
});
