/** Product limits: a deliberately narrow single-image Facebook feed format, not universal Meta limits. */
export function validateMetaImage(bytes: Uint8Array): {
  mime: "image/png" | "image/jpeg";
  width: number;
  height: number;
} {
  if (!bytes.length || bytes.length > 5 * 1024 * 1024)
    throw new Error("Selecione JPEG/PNG com até 5 MB.");
  let width = 0,
    height = 0;
  let mime: "image/png" | "image/jpeg";
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    bytes.length >= 24 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v) &&
    String.fromCharCode(...bytes.slice(12, 16)) === "IHDR"
  ) {
    mime = "image/png";
    width = view.getUint32(16);
    height = view.getUint32(20);
  } else if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    mime = "image/jpeg";
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 0xff) throw new Error("JPEG inválido.");
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) throw new Error("JPEG truncado.");
      if ([0xc0, 0xc1, 0xc2].includes(marker) && length >= 7) {
        height = view.getUint16(offset + 3);
        width = view.getUint16(offset + 5);
        break;
      }
      offset += length;
    }
  } else throw new Error("Formato não suportado. Use JPEG ou PNG.");
  if (
    width < 600 ||
    height < 600 ||
    width * height > 20_000_000 ||
    width / height < 0.8 ||
    width / height > 1.91
  )
    throw new Error(
      "Para este formato, use ao menos 600 × 600 px, até 20 MP e proporção entre 4:5 e 1,91:1.",
    );
  return { mime, width, height };
}
