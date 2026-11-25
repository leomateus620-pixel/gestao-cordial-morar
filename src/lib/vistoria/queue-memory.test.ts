import assert from "node:assert/strict";
import test from "node:test";
import { stabilizePending, type PendingEntry } from "./local-store";
import { createPcmResampler, wavFromInt16 } from "./media-client";

const e = (key: string, patch: Partial<PendingEntry> = {}): PendingEntry => ({
  key,
  userId: "u",
  inspectionId: "i",
  roomId: "r",
  itemId: null,
  clientKey: key,
  kind: "photo",
  blob: new Blob(["x"]),
  mime: "image/jpeg",
  takenAt: "t",
  timeSource: "captura",
  status: "local",
  attempts: 0,
  createdAt: key,
  ...patch,
});

test("refresh sem mudança mantém a mesma lista (não recarrega prévias)", () => {
  const prev = [e("a"), e("b")];
  assert.equal(stabilizePending(prev, [e("a"), e("b")]), prev);
});
test("muda só o registro alterado; os outros mantêm a referência", () => {
  const prev = [e("a"), e("b")];
  const next = stabilizePending(prev, [e("a"), e("b", { status: "enviando" })]);
  assert.notEqual(next, prev);
  assert.equal(next[0], prev[0]);
  assert.notEqual(next[1], prev[1]);
  assert.equal(stabilizePending(prev, [e("a")]).length, 1);
});

test("áudio: reamostra 48 kHz → 16 kHz Int16 sem perder amostras entre blocos", () => {
  const r = createPcmResampler(48000);
  let out = 0;
  for (let i = 0; i < 10; i++) out += r.push(new Float32Array(4096).fill(0.5)).length;
  assert.ok(Math.abs(out - (40960 / 3)) <= 1);
  assert.equal(r.samples, out);
  const one = r.push(new Float32Array(3).fill(1));
  assert.equal(one[0], 32767);
});
test("áudio: WAV válido com cabeçalho e duração", async () => {
  const chunks = [new Int16Array(16000), new Int16Array(8000)];
  const wav = wavFromInt16(chunks);
  const b = new DataView(await wav.arrayBuffer());
  assert.equal(wav.size, 44 + 24000 * 2);
  assert.equal(b.getUint32(24, true), 16000);
  assert.equal(b.getUint32(40, true), 48000);
  assert.equal(String.fromCharCode(b.getUint8(8), b.getUint8(9), b.getUint8(10), b.getUint8(11)), "WAVE");
});
