import assert from "node:assert/strict";
import test from "node:test";
import { resolveAudioFormat } from "./audio-format";
import { runNoteTranscription, type PipelineDeps } from "./transcription-pipeline";
import {
  isAutoRunnable,
  isRetryableStatus,
  MAX_TRANSCRIPTION_ATTEMPTS,
  pickNextTranscription,
  transcriptionLabel,
  transcriptionView,
  type TranscribableNote,
} from "./transcription-runner";
import { parseWavHeader, planWavSegments, wavSegmentHeader } from "./wav-split";

const NOW = Date.parse("2026-11-25T18:00:00Z");
const voz = (o: Partial<TranscribableNote> = {}): TranscribableNote => ({
  id: "n1", source: "voz", audio_path: "i/r/k.wav", transcript_original: null,
  status: "pendente_transcricao", transcription_state: "pendente", ...o,
});

test("formato real: webm/m4a/ogg não viram wav; desconhecido cai em wav", () => {
  assert.equal(resolveAudioFormat({ noteMime: "audio/webm;codecs=opus" }).filename, "relato.webm");
  assert.equal(resolveAudioFormat({ noteMime: "audio/mp4" }).filename, "relato.m4a");
  assert.equal(resolveAudioFormat({ path: "a/b/c.ogg" }).mime, "audio/ogg");
  assert.equal(resolveAudioFormat({}).filename, "relato.wav");
});

test("texto e voz sem áudio nunca entram; nota antiga sem estado entra só pendente", () => {
  assert.equal(transcriptionView(voz({ source: "texto" }), NOW), "nenhum");
  assert.equal(transcriptionView(voz({ audio_path: null }), NOW), "nenhum");
  assert.equal(transcriptionView(voz({ transcription_state: null }), NOW), "pendente");
  assert.equal(transcriptionView(voz({ transcription_state: null, status: "descartado" }), NOW), "nenhum");
});

test("reserva ativa bloqueia; reserva vencida vira interrompida e pode rodar", () => {
  const ativa = voz({ transcription_state: "transcrevendo", transcription_lease_until: new Date(NOW + 60_000).toISOString() });
  assert.equal(isAutoRunnable(ativa, NOW), false);
  const vencida = voz({ transcription_state: "transcrevendo", transcription_lease_until: new Date(NOW - 1).toISOString() });
  assert.equal(transcriptionView(vencida, NOW), "interrompida");
  assert.equal(isAutoRunnable(vencida, NOW), true);
});

test("falhou: respeita próxima tentativa e para no limite de 5", () => {
  assert.equal(isAutoRunnable(voz({ transcription_state: "falhou", transcription_next_at: new Date(NOW + 1000).toISOString() }), NOW), false);
  assert.equal(isAutoRunnable(voz({ transcription_state: "falhou", transcription_attempts: MAX_TRANSCRIPTION_ATTEMPTS }), NOW), false);
  assert.equal(pickNextTranscription([voz({ transcript_original: "x" }), voz({ id: "n2" })], NOW)?.id, "n2");
});

test("402/429/5xx/rede repetem depois; 400/403 são terminais", () => {
  for (const s of [402, 429, 500, 503, 408, 0]) assert.equal(isRetryableStatus(s), true, String(s));
  for (const s of [400, 401, 403, 404, 413]) assert.equal(isRetryableStatus(s), false, String(s));
});

test("selo: desligada só mostra detalhe técnico ao admin", () => {
  assert.equal(transcriptionLabel("pendente", { voiceReady: false, isAdmin: false })?.text, "Transcrição indisponível no momento. O áudio está salvo.");
  assert.match(transcriptionLabel("pendente", { voiceReady: false, isAdmin: true })!.text, /desligada no servidor/);
  assert.equal(transcriptionLabel("falhou", { voiceReady: true, isAdmin: false, error: "x." })?.text, "Não foi possível transcrever: x.");
});

function wav(dataLen: number, dataSizeField = dataLen) {
  const info = { audioFormat: 1, channels: 1, sampleRate: 16000, byteRate: 32000, blockAlign: 2, bitsPerSample: 16, dataOffset: 44, dataSize: dataLen };
  const h = wavSegmentHeader(info, dataSizeField);
  return { head: h, total: 44 + dataLen };
}

test("WAV: tamanho de data zerado/além do arquivo usa os bytes reais alinhados", () => {
  const { head, total } = wav(1001, 0);
  assert.equal(parseWavHeader(head, total)?.dataSize, 1000);
  const b = wav(1000, 0xffffffff);
  assert.equal(parseWavHeader(b.head, b.total)?.dataSize, 1000);
});

test("WAV: segmentos alinhados ao quadro e contíguos", () => {
  const info = parseWavHeader(wav(10_000).head, 10_044)!;
  const segs = planWavSegments(info, 44 + 3001);
  assert.equal(segs[0]!.start, 44);
  for (const s of segs) assert.equal((s.end - s.start) % 2, 0);
  for (let i = 1; i < segs.length; i++) assert.equal(segs[i]!.start, segs[i - 1]!.end);
  assert.equal(segs.at(-1)!.end, 10_044);
});

function deps(o: Partial<PipelineDeps> = {}, total = 160_000) {
  const calls: string[] = [];
  const finished: any[] = [];
  const d: PipelineDeps = {
    readRange: async (s, e) => ({ bytes: new Uint8Array(Math.max(0, Math.min(e, total) - s)), total }),
    claim: async () => (calls.push("claim"), { claimed: true, token: "t", note: null }),
    renew: async () => true,
    finish: async (_t, r) => (finished.push(r), r),
    transcribe: async () => (calls.push("transcribe"), "sala ok"),
    organize: async () => ({ observacoes: [] }),
    ...o,
  };
  return { d, calls, finished };
}
const note = { id: "n1", audio_path: "i/r/k.wav", audio_mime: "audio/wav" };

test("sucesso grava transcrição; falha da organização não invalida", async () => {
  const { d, finished } = deps({ organize: async () => { throw new Error("x"); } });
  await runNoteTranscription(note, d);
  assert.equal(finished[0].transcript, "sala ok");
  assert.equal(finished[0].suggestion, null);
});

test("outra tela reservou: não transcreve nem grava", async () => {
  const { d, calls, finished } = deps({ claim: async () => ({ claimed: false, token: null, note: "atual" }) });
  assert.equal(await runNoteTranscription(note, d), "atual");
  assert.deepEqual(calls, []);
  assert.equal(finished.length, 0);
});

test("403 é terminal (sem repetição) e 429 fica para depois", async () => {
  const e403 = deps({ transcribe: async () => { throw Object.assign(new Error("acesso negado."), { status: 403 }); } });
  await runNoteTranscription(note, e403.d);
  assert.equal(e403.finished[0].retryable, false);
  const e429 = deps({ transcribe: async () => { throw Object.assign(new Error("ocupado."), { status: 429 }); } });
  await runNoteTranscription(note, e429.d);
  assert.equal(e429.finished[0].retryable, true);
});

test("WAV grande é dividido e transcrito em ordem; reserva perdida não grava", async () => {
  const total = 30 * 1024 * 1024;
  const head = wav(total - 44).head;
  const readRange = async (s: number, e: number) => ({ bytes: s === 0 ? head : new Uint8Array(e - s > 1024 ? 1024 : e - s), total });
  const ok = deps({ readRange }, total);
  await runNoteTranscription(note, ok.d);
  assert.equal(ok.calls.filter((c) => c === "transcribe").length, 2);
  assert.equal(ok.finished[0].transcript, "sala ok sala ok");
  const lost = deps({ readRange, renew: async () => false }, total);
  await runNoteTranscription(note, lost.d);
  assert.equal(lost.finished.length, 0);
});

test("áudio vazio ou acima do limite: falha sem repetição", async () => {
  const empty = deps({ transcribe: async () => "  " });
  await runNoteTranscription(note, empty.d);
  assert.equal(empty.finished[0].retryable, false);
  const big = deps({}, 70 * 1024 * 1024);
  await runNoteTranscription(note, big.d);
  assert.match(big.finished[0].error, /muito longo/);
});
