import assert from "node:assert/strict";
import { test } from "node:test";
import { deletionAllowed, displayOrder, resolveUnknownByWindows } from "./gallery-display";
import { planGalleryRebuild, galleryMatchesExactly } from "./gallery-rebuild";
import { sendOrderForSite } from "./gallery-plan";
import { assertMediaRecoveryAdmin } from "./media-recovery-rules";
import { newCodesSince } from "../imobibrasil/media-rebuild.server";

const it = (code: string, destaque = false) => ({ codigoImagem: code, destaque });

test("ordem exibida: capa primeiro e demais por código crescente (caso 1377 C)", () => {
  const out = displayOrder([it("92153986"), it("92155290"), it("91848075", true), it("92155289")]);
  assert.deepEqual(out.map((x) => x.codigoImagem), ["91848075", "92153986", "92155289", "92155290"]);
});

test("conferência recusa a ordem invertida que antes foi aprovada", () => {
  // Envio decrescente: posição 3 recebeu o menor código.
  const codeTo: Record<string, string> = { "10": "a", "11": "d", "12": "c", "13": "b" };
  const remote = displayOrder([it("10", true), it("11"), it("12"), it("13")])
    .map((x) => ({ codigoImagem: x.codigoImagem, imageId: codeTo[x.codigoImagem]!, destaque: x.destaque }));
  assert.equal(galleryMatchesExactly({ desiredImageIds: ["a", "b", "c", "d"], remote }), false);
});

test("envio crescente gera a ordem final certa no site, com uma única capa", () => {
  const sent = sendOrderForSite([{ id: "c", position: 2 }, { id: "a", position: 0 }, { id: "b", position: 1 }], "a");
  const remote = displayOrder(sent.map((img, i) => it(String(100 + i), img.id === "a")))
    .map((x) => ({ ...x, imageId: sent[Number(x.codigoImagem) - 100]!.id }));
  assert.equal(galleryMatchesExactly({ desiredImageIds: ["a", "b", "c"], remote }), true);
  assert.equal(remote.filter((x) => x.destaque).length, 1);
});

test("capa errada (1404 C) é detectada e exige reconstrução desde o início", () => {
  const plan = planGalleryRebuild({
    desiredImageIds: ["a", "b"],
    remote: [{ codigoImagem: "1", imageId: "b", destaque: true }, { codigoImagem: "2", imageId: "a", destaque: false }],
  });
  assert.equal(plan.needed, true);
  assert.equal(plan.keptPrefix, 0);
});

test("exclusão bloqueada sem leitura confiável, acima de 2 por rodada e pelo disjuntor de 80%", () => {
  const base = { reliable: true, deletedThisRun: 0, startCount: 10, desiredCount: 10, currentCount: 12 };
  assert.deepEqual(deletionAllowed(base), { ok: true });
  assert.deepEqual(deletionAllowed({ ...base, reliable: false }), { ok: false, reason: "leitura_inconclusiva" });
  assert.deepEqual(deletionAllowed({ ...base, currentCount: 0 }), { ok: false, reason: "leitura_inconclusiva" });
  assert.deepEqual(deletionAllowed({ ...base, deletedThisRun: 2 }), { ok: false, reason: "limite_por_rodada" });
  assert.deepEqual(deletionAllowed({ ...base, currentCount: 8 }), { ok: false, reason: "disjuntor" });
});

test("entregas incertas: adota pelo código as que chegaram e reenvia só a que não chegou (caso 1350/1349)", () => {
  const out = resolveUnknownByWindows({
    unknowns: [
      { imageId: "x", at: "2026-10-01T10:00:00Z", beforeCodes: ["1"] },
      { imageId: "y", at: "2026-10-01T10:01:00Z", beforeCodes: ["1", "5"] },
      { imageId: "z", at: "2026-10-01T10:02:00Z", beforeCodes: ["1", "5"] },
    ],
    currentCodes: ["1", "5", "9"],
    linkedCodes: new Set(["1"]),
  });
  assert.deepEqual(out, [
    { imageId: "x", action: "adopt", code: "5" },
    { imageId: "y", action: "resend" },
    { imageId: "z", action: "adopt", code: "9" },
  ]);
});

test("entregas incertas: janela ambígua ou leitura vazia não adota nem reenvia", () => {
  const out = resolveUnknownByWindows({
    unknowns: [
      { imageId: "x", at: "2026-10-01T10:00:00Z", beforeCodes: ["1"] },
      { imageId: "y", at: "2026-10-01T10:01:00Z", beforeCodes: [] },
      { imageId: "w", at: null, beforeCodes: null },
    ],
    currentCodes: ["1", "5", "6"],
    linkedCodes: new Set(["1"]),
  });
  assert.deepEqual(out, [
    { imageId: "x", action: "keep" },
    { imageId: "y", action: "keep" },
    { imageId: "w", action: "keep" },
  ]);
});

test("reconstrução: foto enviada sem código é reconhecida pela única novidade sem dono (deadlock 1401/1404/3398)", () => {
  const gallery = { reliable: true, reason: null, items: [it("1"), it("2"), it("3")].map((x) => ({ ...x, url: null })) } as never;
  assert.deepEqual(newCodesSince(["1", "2"], gallery, new Set(["1", "2"])), ["3"]);
  assert.deepEqual(newCodesSince(["1", "2", "3"], gallery, new Set()), []);
});

test("Reenviar fotos / Reconstruir galeria recusados para quem não é administrador", async () => {
  const fake = (data: unknown) => ({ rpc: async () => ({ data, error: null }) });
  await assert.rejects(assertMediaRecoveryAdmin(fake(false), "u"), /administradores/);
  await assert.rejects(assertMediaRecoveryAdmin(fake(null), "u"), /administradores/);
  await assertMediaRecoveryAdmin(fake(true), "u");
});
