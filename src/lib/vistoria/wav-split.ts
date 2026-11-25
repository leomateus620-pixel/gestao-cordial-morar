// Divisão de WAV grande em segmentos alinhados ao quadro, com cabeçalho reescrito.
// Puro: o servidor lê só o cabeçalho e cada intervalo de bytes (nunca o arquivo inteiro).

export const SEGMENT_MAX_BYTES = 24 * 1024 * 1024;
export const WAV_MAX_BYTES = 60 * 1024 * 1024;
export const OTHER_MAX_BYTES = 24 * 1024 * 1024;

export type WavInfo = {
  audioFormat: number;
  channels: number;
  sampleRate: number;
  byteRate: number;
  blockAlign: number;
  bitsPerSample: number;
  dataOffset: number;
  dataSize: number;
};

const tag = (b: Uint8Array, o: number) => String.fromCharCode(b[o]!, b[o + 1]!, b[o + 2]!, b[o + 3]!);

/**
 * Lê o cabeçalho a partir dos primeiros bytes do arquivo. Pula blocos extras
 * (LIST, fact...). Tamanho de `data` zerado, 0xFFFFFFFF ou além do arquivo
 * (gravação interrompida) → usa os bytes restantes, alinhados ao quadro.
 */
export function parseWavHeader(head: Uint8Array, totalSize: number): WavInfo | null {
  if (head.length < 12 || tag(head, 0) !== "RIFF" || tag(head, 8) !== "WAVE") return null;
  const dv = new DataView(head.buffer, head.byteOffset, head.byteLength);
  let o = 12;
  let fmt: Omit<WavInfo, "dataOffset" | "dataSize"> | null = null;
  while (o + 8 <= head.length) {
    const id = tag(head, o);
    const size = dv.getUint32(o + 4, true);
    const body = o + 8;
    if (id === "fmt ") {
      if (body + 16 > head.length) return null;
      fmt = {
        audioFormat: dv.getUint16(body, true),
        channels: dv.getUint16(body + 2, true),
        sampleRate: dv.getUint32(body + 4, true),
        byteRate: dv.getUint32(body + 8, true),
        blockAlign: dv.getUint16(body + 12, true),
        bitsPerSample: dv.getUint16(body + 14, true),
      };
    } else if (id === "data") {
      if (!fmt || fmt.blockAlign <= 0) return null;
      const remaining = Math.max(0, totalSize - body);
      let dataSize = size;
      if (size === 0 || size === 0xffffffff || size > remaining) dataSize = remaining;
      dataSize -= dataSize % fmt.blockAlign;
      return { ...fmt, dataOffset: body, dataSize };
    }
    o = body + size + (size % 2);
  }
  return null;
}

export type ByteRange = { start: number; end: number }; // end exclusivo

export function planWavSegments(info: WavInfo, maxBytes = SEGMENT_MAX_BYTES): ByteRange[] {
  const payload = maxBytes - 44;
  const step = payload - (payload % info.blockAlign);
  const out: ByteRange[] = [];
  for (let s = 0; s < info.dataSize; s += step) {
    out.push({ start: info.dataOffset + s, end: info.dataOffset + Math.min(info.dataSize, s + step) });
  }
  return out;
}

/** Cabeçalho canônico de 44 bytes para um segmento com `dataLen` bytes de amostras. */
export function wavSegmentHeader(info: WavInfo, dataLen: number): Uint8Array {
  const h = new Uint8Array(44);
  const dv = new DataView(h.buffer);
  const w = (o: number, s: string) => {
    for (let i = 0; i < 4; i++) h[o + i] = s.charCodeAt(i);
  };
  w(0, "RIFF");
  dv.setUint32(4, 36 + dataLen, true);
  w(8, "WAVE");
  w(12, "fmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, info.audioFormat, true);
  dv.setUint16(22, info.channels, true);
  dv.setUint32(24, info.sampleRate, true);
  dv.setUint32(28, info.byteRate, true);
  dv.setUint16(32, info.blockAlign, true);
  dv.setUint16(34, info.bitsPerSample, true);
  w(36, "data");
  dv.setUint32(40, dataLen, true);
  return h;
}
