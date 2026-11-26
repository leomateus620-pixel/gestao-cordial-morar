import assert from "node:assert/strict";
import test from "node:test";
import {
  armCaptureMarker,
  clearCaptureMarker,
  markerKey,
  readResumeMarker,
  RESUME_TTL_MS,
} from "./capture-resume";

function mem() {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}
const base = {
  userId: "u",
  inspectionId: "i",
  roomId: "sala",
  itemId: "piso",
  origin: "camera" as const,
};

test("grava antes de abrir e restaura cômodo/item depois de recarga real", () => {
  const s = mem();
  armCaptureMarker(s, base, 1000, "load-a");
  assert.ok(s.m.has(markerKey("u", "i")));
  const r = readResumeMarker(s, "u", "i", 1000 + 60_000, "load-b");
  assert.equal(r?.roomId, "sala");
  assert.equal(r?.itemId, "piso");
});

test("mesmo carregamento: sem aviso enquanto o seletor ainda pode entregar o arquivo", () => {
  const s = mem();
  armCaptureMarker(s, base, 1000, "load-a");
  assert.equal(readResumeMarker(s, "u", "i", 2000, "load-a"), null);
  assert.equal(s.m.size, 1);
});

test("expira após um dia", () => {
  const s = mem();
  armCaptureMarker(s, base, 0, "a");
  assert.equal(readResumeMarker(s, "u", "i", RESUME_TTL_MS, "b"), null);
  assert.equal(s.m.size, 0);
});

test("apaga quando a foto chega", () => {
  const s = mem();
  armCaptureMarker(s, base, 0, "a");
  clearCaptureMarker(s, "u", "i");
  assert.equal(readResumeMarker(s, "u", "i", 10, "b"), null);
});

test("isolado por usuário e vistoria", () => {
  const s = mem();
  armCaptureMarker(s, base, 0, "a");
  assert.equal(readResumeMarker(s, "outro", "i", 10, "b"), null);
  assert.equal(readResumeMarker(s, "u", "outra", 10, "b"), null);
  assert.ok(readResumeMarker(s, "u", "i", 10, "b"));
});

test("só a tentativa correspondente pode apagar o marcador em outra aba ou seleção", () => {
  const s = mem();
  const old = armCaptureMarker(s, { ...base, clientKey: "foto-velha" }, 0, "a");
  const next = armCaptureMarker(s, { ...base, clientKey: "foto-nova", roomId: "cozinha" }, 1, "b");
  clearCaptureMarker(s, "u", "i", old);
  assert.deepEqual(readResumeMarker(s, "u", "i", 10, "c"), next);
});
