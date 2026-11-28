// JPEG mínimos (gerados via pdf-lib-compatíveis): usamos PNG 1x1 escalado em proporções diferentes.
export async function pngOf(w: number, h: number, scene = 0): Promise<Uint8Array> {
  // PNG sólido gerado com zlib nativo
  const { deflateSync } = await import("node:zlib");
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      if (scene) {
        // Synthetic interior, four visible edges and a fissure at the right margin.
        const u = x / w,
          v = y / h,
          wall = 0.63 + Math.abs(u - 0.58) * 0.15;
        let color = [229 - (scene % 5) * 7, 220, 204 + (scene % 3) * 8];
        if (u < 0.24) color = [190, 183, 168];
        if (v > wall) color = [173, 146, 120];
        if (u > 0.32 && u < 0.71 && v > 0.17 && v < 0.47)
          color =
            Math.abs(u - 0.52) < 0.014 || Math.abs(v - 0.32) < 0.009
              ? [94, 88, 80]
              : [161, 194, 205];
        if (
          v > wall &&
          (Math.floor((v - wall) * 100) % 12 === 0 ||
            Math.floor(((u - 0.48) / (v + 0.1)) * 45) % 12 === 0)
        )
          color = [129, 112, 94];
        if (Math.abs(u - (0.968 + 0.015 * Math.sin(v * 48))) < 0.007 && v > 0.22 && v < 0.6)
          color = [66, 57, 51];
        if (x < 2 || y < 2 || x >= w - 2 || y >= h - 2) color = [48, 73, 74];
        raw.set(color, y * (w * 3 + 1) + 1 + x * 3);
        continue;
      }
      raw.set([40 + (x % 200), 90, 120 + (y % 100)], y * (w * 3 + 1) + 1 + x * 3);
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}
