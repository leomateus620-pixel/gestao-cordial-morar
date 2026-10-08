import assert from "node:assert/strict";
import { test } from "node:test";
import {
  classifyOrphanedRebuild,
  hasMediaReadHeadroom,
  noProgressDecision,
  noProgressDelaySeconds,
  planCleanRebuild,
  rebuildStateFields,
  resolveUnknownDeliveries,
} from "./media-recovery-rules";
import { planGalleryDelivery } from "./gallery-plan";
import { isSlotRefusal } from "../imobibrasil/image-ops.server";
import { fetchRemoteGallery, SLOT_REFUSED_REASON } from "../imobibrasil/image-ops.server";

test("checkpoint não é apagado quando a rodada não conhece o estado", () => {
  assert.deepEqual(rebuildStateFields(undefined), {});
  assert.deepEqual(rebuildStateFields(null), { media_rebuild_state: null });
  const cp = { deleteRemoteIds: [], reinsertImageIds: ["a"] };
  assert.deepEqual(rebuildStateFields(cp), { media_rebuild_state: cp });
});

const img = (id: string, position: number) => ({ id, position, isCover: position === 0, deliveredHash: "h" });
const row = (image_id: string, extra: Record<string, unknown>) => ({
  image_id, content_hash: "h", status: "pending", synced_position: null, is_cover: false,
  attempts: 0, next_retry_at: null, ...extra,
});

test("rebuild_delete órfão sai do 'waiting' quando não há reconstrução ativa", () => {
  const images = [img("a", 0), img("b", 1)];
  const links = [row("a", { status: "synced", synced_position: 0 }), row("b", { last_op: "rebuild_delete" })];
  const active = planGalleryDelivery(images, links, Date.now(), { rebuildActive: true });
  assert.deepEqual(active.waiting, ["b"]);
  assert.deepEqual(active.orphanedRebuild, []);
  const lost = planGalleryDelivery(images, links, Date.now(), { rebuildActive: false });
  assert.deepEqual(lost.orphanedRebuild, ["b"]);
  assert.deepEqual(lost.waiting, []);
  assert.deepEqual(lost.toSend, []);
});

test("órfãos só voltam ao envio com leitura confiável e nada sem vínculo no site", () => {
  const linked = new Set(["100", "101"]);
  assert.deepEqual(
    classifyOrphanedRebuild({ orphanImageIds: ["b", "c"], galleryReliable: true, remoteCodes: ["100", "101"], linkedCodes: linked }),
    { action: "send", imageIds: ["b", "c"] },
  );
  assert.deepEqual(
    classifyOrphanedRebuild({ orphanImageIds: ["b"], galleryReliable: false, remoteCodes: ["100"], linkedCodes: linked }),
    { action: "hold", reason: "leitura_inconclusiva" },
  );
  // Foto no site sem vínculo pode ser uma das órfãs: nunca reenvia (sem cópia).
  assert.deepEqual(
    classifyOrphanedRebuild({ orphanImageIds: ["b"], galleryReliable: true, remoteCodes: ["100", "999"], linkedCodes: linked }),
    { action: "hold", reason: "fotos_sem_vinculo_no_site" },
  );
});

test("limite de chamadas não vira leitura não confiável do site", async () => {
  assert.equal(isSlotRefusal({ category: "rate_limit" }), true);
  assert.equal(isSlotRefusal({ category: "network" }), false);
  const refused = await fetchRemoteGallery("cordial", "1", "c", async () => {
    throw Object.assign(new Error("sem vaga"), { category: "rate_limit" });
  });
  assert.equal(refused.reason, SLOT_REFUSED_REASON);
  const failed = await fetchRemoteGallery("cordial", "1", "c", async () => { throw new Error("boom"); });
  assert.equal(failed.reason, "falha_consulta");
  assert.equal(hasMediaReadHeadroom(15), true);
  assert.equal(hasMediaReadHeadroom(16), false);
});

test("várias entregas incertas resolvidas só com evidência consistente", () => {
  const unknowns = [
    { imageId: "x", at: "2026-10-01T10:00:00Z", beforeCodes: ["1"] },
    { imageId: "y", at: "2026-10-01T10:01:00Z", beforeCodes: ["1", "5"] },
    { imageId: "z", at: "2026-10-01T10:02:00Z", beforeCodes: ["1", "5", "7"] },
  ];
  assert.deepEqual(resolveUnknownDeliveries({ unknowns, orphanCodes: ["7", "5", "9"] }), [
    { imageId: "x", code: "5" }, { imageId: "y", code: "7" }, { imageId: "z", code: "9" },
  ]);
  // Contagem diferente (cópias no site): nada é vinculado.
  assert.equal(resolveUnknownDeliveries({ unknowns, orphanCodes: ["5", "7", "9", "11"] }), null);
  // Evidência contraditória: nada é vinculado.
  assert.equal(resolveUnknownDeliveries({
    unknowns: [unknowns[0]!, { ...unknowns[1]!, beforeCodes: ["1"] }],
    orphanCodes: ["5", "7"],
  }), null);
  assert.equal(resolveUnknownDeliveries({
    unknowns: [{ ...unknowns[0]!, beforeCodes: null }, unknowns[1]!], orphanCodes: ["5", "7"],
  }), null);
});

test("rodadas sem progresso param de girar e pedem atenção", () => {
  let runs = 0;
  for (let i = 0; i < 4; i += 1) runs = noProgressDecision({ priorRuns: runs, progressed: false, terminal: false }).runs;
  assert.equal(runs, 4);
  const fifth = noProgressDecision({ priorRuns: runs, progressed: false, terminal: false });
  assert.deepEqual(fifth, { runs: 5, needsAttention: true });
  assert.deepEqual(noProgressDecision({ priorRuns: 7, progressed: true, terminal: false }), { runs: 0, needsAttention: false });
  assert.equal(noProgressDelaySeconds(2), 120);
  assert.equal(noProgressDelaySeconds(5), 600);
  assert.equal(noProgressDelaySeconds(6), 1800);
  assert.equal(noProgressDelaySeconds(7), 7200);
  assert.equal(noProgressDelaySeconds(12), 21_600);
});

test("reconstrução limpa apaga extras/cópias e reinsere com a capa = primeira foto do Gestão", () => {
  const plan = planCleanRebuild({
    desiredImageIds: ["a", "b", "c"],
    remote: [
      { codigoImagem: "10", imageId: "b", destaque: true },
      { codigoImagem: "11", imageId: null, destaque: false },
      { codigoImagem: "12", imageId: "a", destaque: false },
    ],
  });
  assert.equal(plan.feasible, true);
  if (!plan.feasible) return;
  assert.equal(plan.keptPrefix, 0);
  assert.deepEqual(plan.reinsertImageIds, ["a", "b", "c"]);
  assert.deepEqual([...plan.deleteRemoteIds].sort(), ["10", "11", "12"]);

  const extrasOnly = planCleanRebuild({
    desiredImageIds: ["a"],
    remote: [
      { codigoImagem: "10", imageId: "a", destaque: true },
      { codigoImagem: "11", imageId: null, destaque: false },
    ],
  });
  assert.equal(extrasOnly.feasible, true);
  if (extrasOnly.feasible) {
    assert.deepEqual(extrasOnly.deleteRemoteIds, ["11"]);
    assert.deepEqual(extrasOnly.reinsertImageIds, []);
  }
  assert.equal(planCleanRebuild({
    desiredImageIds: ["a"], remote: [{ codigoImagem: null, imageId: null, destaque: false }],
  }).feasible, false);
});
