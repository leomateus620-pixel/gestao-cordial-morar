// Preparação de fotos e gravação de áudio no navegador.

import { prepareImageReduced, type PreparedImage } from "./image-prepare";

/** Redimensiona (máx. 2048 px) com decodificação reduzida, aplica orientação, regrava em JPEG (remove EXIF/GPS) e gera miniatura. */
export function prepareImage(file: Blob): Promise<PreparedImage> {
  return prepareImageReduced(file);
}

export const WAV_RATE = 16000;

/**
 * Reamostra para 16 kHz em Int16 enquanto grava (~1,9 MB/min em vez de
 * ~11 MB/min em Float32 a 48 kHz). Mantém a posição fracionária entre blocos.
 */
export function createPcmResampler(inRate: number, outRate = WAV_RATE) {
  const ratio = inRate / outRate;
  let pos = 0; // posição (em amostras de entrada) da próxima saída, relativa ao bloco atual
  let total = 0;
  return {
    push(d: Float32Array): Int16Array {
      const n = pos < d.length ? Math.floor((d.length - 1 - pos) / ratio) + 1 : 0;
      const out = new Int16Array(Math.max(0, n));
      for (let i = 0; i < out.length; i++) {
        const s = Math.max(-1, Math.min(1, d[Math.floor(pos + i * ratio)] ?? 0));
        out[i] = s < 0 ? s * 32768 : s * 32767;
      }
      pos = pos + out.length * ratio - d.length;
      total += out.length;
      return out;
    },
    get samples() {
      return total;
    },
  };
}

/** Monta o WAV a partir do cabeçalho e dos blocos, sem juntar tudo num único array. */
export function wavFromInt16(chunks: Int16Array[], rate = WAV_RATE): Blob {
  const samples = chunks.reduce((s, c) => s + c.length, 0);
  const h = new ArrayBuffer(44);
  const v = new DataView(h);
  const tag = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
  };
  tag(0, "RIFF");
  v.setUint32(4, 36 + samples * 2, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  tag(36, "data");
  v.setUint32(40, samples * 2, true);
  return new Blob([h, ...(chunks as BlobPart[])], { type: "audio/wav" });
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
  const chunks: Int16Array[] = [];
  const resampler = createPcmResampler(ctx.sampleRate);
  let lastLevel = 0;
  node.onaudioprocess = (e) => {
    const d = e.inputBuffer.getChannelData(0);
    const out = resampler.push(d);
    if (out.length) chunks.push(out);
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
      release();
      const seconds = resampler.samples / WAV_RATE;
      if (seconds < 0.6) throw new Error("Gravação muito curta. Fale por mais tempo.");
      const blob = wavFromInt16(chunks);
      chunks.length = 0;
      return { blob, seconds };
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
