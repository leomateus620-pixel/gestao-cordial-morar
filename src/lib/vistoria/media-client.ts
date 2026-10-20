// Preparação de fotos e gravação de áudio no navegador.

/** Redimensiona (máx. 2048 px), aplica orientação e regrava em JPEG (remove EXIF/GPS). */
export async function prepareImage(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
  try {
    const max = 2048;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Sem suporte a imagem neste aparelho");
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob>((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error("Falha ao converter a foto"))), "image/jpeg", 0.85),
    );
    canvas.width = canvas.height = 0;
    return { blob, width, height };
  } finally {
    bitmap.close();
  }
}

function encodeWav(chunks: Float32Array[], inRate: number, outRate = 16000): Blob {
  const ratio = inRate / outRate;
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const outLen = Math.floor(total / ratio);
  const flat = new Float32Array(total);
  let o = 0;
  for (const c of chunks) {
    flat.set(c, o);
    o += c.length;
  }
  const buf = new ArrayBuffer(44 + outLen * 2);
  const v = new DataView(buf);
  const tag = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
  };
  tag(0, "RIFF");
  v.setUint32(4, 36 + outLen * 2, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, outRate, true);
  v.setUint32(28, outRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  tag(36, "data");
  v.setUint32(40, outLen * 2, true);
  for (let i = 0; i < outLen; i++) {
    const s = Math.max(-1, Math.min(1, flat[Math.floor(i * ratio)] ?? 0));
    v.setInt16(44 + i * 2, s * (s < 0 ? 32768 : 32767), true);
  }
  return new Blob([buf], { type: "audio/wav" });
}

export type Recorder = {
  /** Encerra o segmento atual e devolve WAV completo (decodificável em iOS/Android). */
  stop: () => Promise<{ blob: Blob; seconds: number }>;
  /** Cancela sem gerar arquivo e libera microfone. */
  cancel: () => void;
  level: () => number;
};

/**
 * Grava PCM via Web Audio e gera WAV completo — evita MP4 fragmentado do Safari
 * e fragmentos sem cabeçalho do MediaRecorder. Sempre encerra as trilhas.
 */
export async function startRecorder(onInterrupted?: () => void): Promise<Recorder> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("Este navegador não permite gravar áudio.");
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  await ctx.resume();
  const source = ctx.createMediaStreamSource(stream);
  const node = ctx.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  let lastLevel = 0;
  node.onaudioprocess = (e) => {
    const d = e.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(d));
    let peak = 0;
    for (let i = 0; i < d.length; i += 64) peak = Math.max(peak, Math.abs(d[i]));
    lastLevel = peak;
  };
  source.connect(node);
  node.connect(ctx.destination);
  const track = stream.getAudioTracks()[0];
  const interrupted = () => onInterrupted?.();
  track?.addEventListener("ended", interrupted);
  ctx.addEventListener("statechange", () => {
    if (ctx.state === "interrupted" as AudioContextState || ctx.state === "suspended") interrupted();
  });
  let done = false;
  const release = () => {
    stream.getTracks().forEach((t) => t.stop());
    track?.removeEventListener("ended", interrupted);
    node.onaudioprocess = null;
    try {
      node.disconnect();
      source.disconnect();
    } catch {
      /* já desconectado */
    }
    void ctx.close().catch(() => undefined);
  };
  return {
    level: () => lastLevel,
    cancel() {
      if (done) return;
      done = true;
      release();
    },
    async stop() {
      if (done) throw new Error("Gravação já encerrada");
      done = true;
      const rate = ctx.sampleRate;
      release();
      const samples = chunks.reduce((s, c) => s + c.length, 0);
      const seconds = samples / rate;
      if (seconds < 0.6) throw new Error("Gravação muito curta. Fale por mais tempo.");
      return { blob: encodeWav(chunks, rate), seconds };
    },
  };
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Download compatível com iOS/Safari: compartilhar arquivo quando suportado, senão abrir o Blob. */
export async function deliverPdf(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const file = new File([blob], filename, { type: "application/pdf" });
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isIOS && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch {
      /* usuário cancelou: cai no fallback */
    }
  }
  const url = URL.createObjectURL(blob);
  if (isIOS) {
    window.open(url, "_blank");
  } else {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
