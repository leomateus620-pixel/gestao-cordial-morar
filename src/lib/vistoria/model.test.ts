import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRoomPlan,
  canOpenInspection,
  meterText,
  mediaPath,
  pathBelongsTo,
  propertyFamily,
  resolveResponsible,
  reviewIssues,
  canFinalize,
  shouldApplyVoiceResult,
  sniffImageMime,
  progress,
  type ReviewInput,
} from "./model.ts";

const names = (p: ReturnType<typeof buildRoomPlan>) => p.map((r) => r.name);

test("casa: 3 dormitórios com 1 suíte não duplica quartos (dormitórios incluem suítes)", () => {
  const plan = buildRoomPlan({ tipo: "Casa", dormitorios: 3, suites: 1, banheiros: 2, vagas: 1, salas: null });
  const n = names(plan);
  assert.equal(n.filter((x) => x.startsWith("Suíte")).length, 1);
  assert.equal(n.filter((x) => x.startsWith("Dormitório")).length, 2);
  assert.equal(n.filter((x) => x.startsWith("Banheiro social")).length, 1);
  assert.ok(n.includes("Banheiro da suíte"));
  assert.ok(n.includes("Garagem"));
  assert.ok(n.includes("Área externa"));
});

test("apartamento sem quartos informados não inventa dormitórios", () => {
  const n = names(buildRoomPlan({ tipo: "Apartamento", dormitorios: 0, suites: 0, banheiros: null, vagas: 0, salas: 0 }));
  assert.equal(n.some((x) => x.startsWith("Dormitório") || x.startsWith("Suíte")), false);
  assert.equal(n.some((x) => x.startsWith("Banheiro")), false);
  assert.equal(n.includes("Área externa"), false);
  assert.equal(n.includes("Vaga de garagem"), false);
});

test("suítes acima de dormitórios contam como dormitórios", () => {
  const n = names(buildRoomPlan({ tipo: "Apartamento", dormitorios: 1, suites: 2, banheiros: 2, vagas: 1, salas: 1 }));
  assert.equal(n.filter((x) => x.startsWith("Suíte")).length, 2);
  assert.equal(n.filter((x) => x.startsWith("Dormitório")).length, 0);
  assert.equal(n.filter((x) => x.startsWith("Banheiro social")).length, 0);
  assert.ok(n.includes("Vaga de garagem"));
});

test("comercial e terreno não geram cômodos residenciais", () => {
  const com = names(buildRoomPlan({ tipo: "Sala comercial", dormitorios: 2, suites: 0, banheiros: 1, vagas: 0, salas: 2 }));
  assert.deepEqual(com, ["Sala comercial 1", "Sala comercial 2", "Banheiro", "Fachada e acesso"]);
  const ter = buildRoomPlan({ tipo: "Terreno", dormitorios: 3, suites: 1, banheiros: 2, vagas: 2, salas: 1 });
  assert.deepEqual(names(ter), ["Terreno"]);
  assert.ok(ter[0].items.some((i) => i.name === "Muros e cercas"));
  assert.equal(propertyFamily("Lote em condomínio"), "terreno");
  assert.deepEqual(buildRoomPlan({ tipo: "", dormitorios: 2, suites: 0, banheiros: 1, vagas: 0, salas: 1 }), []);
});

test("cozinha e banheiro trazem itens hidráulicos; mobiliado adiciona inventário", () => {
  const plan = buildRoomPlan({ tipo: "Casa", dormitorios: 1, suites: 0, banheiros: 1, vagas: 0, salas: 1, furnished: true });
  const coz = plan.find((r) => r.kind === "cozinha")!;
  assert.ok(coz.items.some((i) => i.name === "Hidráulica e vazamentos"));
  assert.ok(coz.items.some((i) => i.category === "mobilia"));
  const ban = plan.find((r) => r.kind === "banheiro")!;
  assert.ok(ban.items.some((i) => i.name === "Ralos"));
  assert.equal(ban.items.some((i) => i.category === "mobilia"), false);
});

test("medidor não informado nunca vira zero; N/A e desligado são explícitos", () => {
  assert.equal(meterText({ status: "nao_informado" }), "Não informado");
  assert.equal(meterText({ status: "informado", reading: "0" }), "0");
  assert.equal(meterText({ status: "informado", reading: "" }), "Leitura não preenchida");
  assert.equal(meterText({ status: "nao_aplicavel" }), "Não aplicável");
  assert.equal(meterText({ status: "desligado" }), "Fornecimento desligado");
});

const base = (): ReviewInput => ({
  basics: { inspected_at: "2026-10-20T10:00:00-03:00", responsible_id: "u1", plan_confirmed: true },
  rooms: [{ id: "r1", name: "Sala" }],
  items: [
    { id: "i1", room_id: "r1", name: "Piso", state: "bom" },
    { id: "i2", room_id: "r1", name: "Tomadas", state: "nao_testado", untested_reason: "Sem energia" },
    { id: "i3", room_id: "r1", name: "Teto", state: "nao_se_aplica" },
  ],
  media: [{ id: "m1", room_id: "r1", status: "confirmada" }],
  notes: [{ id: "n1", room_id: "r1", status: "revisado" }],
});

test("revisão completa permite concluir", () => {
  assert.deepEqual(reviewIssues(base()), []);
  assert.equal(canFinalize(base()), true);
  assert.equal(progress(base().rooms, base().items).percent, 100);
});

test("itens começam pendentes e bloqueiam; não testado exige motivo; ruim exige avaria", () => {
  const i = base();
  i.items = [
    { id: "a", room_id: "r1", name: "Piso", state: "pendente" },
    { id: "b", room_id: "r1", name: "Tomadas", state: "nao_testado", untested_reason: " " },
    { id: "c", room_id: "r1", name: "Porta", state: "ruim", damage: "" },
  ];
  const kinds = reviewIssues(i).map((x) => x.kind);
  assert.deepEqual(kinds, ["item_pendente", "nao_testado_sem_motivo", "avaria_sem_descricao"]);
  assert.equal(progress(i.rooms, i.items).done, 0);
});

test("ambiente sem foto precisa de motivo; mídia/áudio/envio local pendente bloqueiam", () => {
  const i = base();
  i.media = [{ id: "m1", room_id: "r1", status: "pendente" }];
  i.notes = [{ id: "n1", room_id: "r1", status: "transcrito" }];
  i.localPending = [{ room_id: "r1", kind: "photo", status: "erro" }];
  const kinds = reviewIssues(i).map((x) => x.kind);
  assert.ok(kinds.includes("ambiente_sem_foto"));
  assert.ok(kinds.includes("midia_pendente"));
  assert.ok(kinds.includes("relato_pendente"));
  assert.ok(kinds.includes("envio_local"));
  i.rooms = [{ id: "r1", name: "Sala", no_photo_reason: "Cômodo trancado" }];
  i.media = [];
  i.notes = [];
  i.localPending = [];
  assert.equal(canFinalize(i), true);
});

test("planta não confirmada e dados básicos ausentes bloqueiam", () => {
  const i = base();
  i.basics = { inspected_at: null, responsible_id: null, plan_confirmed: false };
  assert.equal(reviewIssues(i).filter((x) => x.kind === "dados_basicos").length, 2);
  assert.ok(reviewIssues(i).some((x) => x.kind === "planta_nao_confirmada"));
});

test("resposta de voz atrasada não é aplicada em outro cômodo nem outra sessão", () => {
  const origin = { inspectionId: "v1", roomId: "sala", sessionId: "s1" };
  assert.equal(shouldApplyVoiceResult({ ...origin }, origin), true);
  assert.equal(shouldApplyVoiceResult({ ...origin, roomId: "cozinha" }, origin), false);
  assert.equal(shouldApplyVoiceResult({ ...origin, sessionId: "s2" }, origin), false);
  assert.equal(shouldApplyVoiceResult({ ...origin, inspectionId: "v2" }, origin), false);
  assert.equal(shouldApplyVoiceResult(null, origin), false);
});

test("caminhos de mídia são presos à vistoria e ao cômodo (sem mistura entre imóveis)", () => {
  const v = "11111111-1111-4111-8111-111111111111";
  const r1 = "22222222-2222-4222-8222-222222222222";
  const r2 = "33333333-3333-4333-8333-333333333333";
  const p = mediaPath(v, r1, "abc_12345678", "jpg");
  assert.equal(p, `${v}/${r1}/abc_12345678.jpg`);
  assert.equal(pathBelongsTo(p, v, r1), true);
  assert.equal(pathBelongsTo(p, v, r2), false);
  assert.equal(pathBelongsTo(`${v}/${r1}/../x.jpg`, v, r1), false);
  // mesma chave em cômodos distintos gera caminhos distintos; repetir é idempotente
  assert.notEqual(mediaPath(v, r2, "abc_12345678", "jpg"), p);
  assert.equal(mediaPath(v, r1, "abc_12345678", "jpg"), p);
  assert.throws(() => mediaPath("x", r1, "abc_12345678", "jpg"));
  assert.throws(() => mediaPath(v, r1, "../../etc", "jpg"));
});

test("validação de tipo real da imagem pelos bytes", () => {
  assert.equal(sniffImageMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(sniffImageMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])), "image/png");
  assert.equal(sniffImageMime(new TextEncoder().encode("<html>oops</html>")), null);
});

test("corretor só abre as próprias/atribuídas e não atribui a outro", () => {
  const insp = { responsible_id: "outro", created_by: "outro" };
  assert.equal(canOpenInspection({ id: "eu", perfil: "corretor" }, insp), false);
  assert.equal(canOpenInspection({ id: "eu", perfil: "corretor" }, { responsible_id: "eu", created_by: "outro" }), true);
  assert.equal(canOpenInspection({ id: "eu", perfil: "secretaria" }, insp), true);
  assert.equal(canOpenInspection({ id: "eu", perfil: "financeiro_admin" }, { responsible_id: "eu", created_by: "eu" }), false);
  assert.equal(resolveResponsible("corretor", "eu", "outro"), "eu");
  assert.equal(resolveResponsible("admin_owner", "eu", "outro"), "outro");
});
