/**
 * Riscos residuais corrigidos em 19/09/2026:
 *  1. foto já sincronizada NUNCA é inserida de novo (checksum/marca d'água);
 *  2. POST de imagem não é idempotente: nada de retry cego;
 *  3. só pode existir UM destaque remoto — 2+ destaques fazem o site repetir o
 *     mesmo imóvel na listagem (sintoma relatado pelo usuário).
 */
import { strict as assert } from "node:assert";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  analyzeRemoteGallery,
  isAmbiguousDeliveryError,
  isRemoteCover,
  planGalleryDelivery,
  shouldSendAsCover,
  type LocalGalleryImage,
  type RemoteGalleryRow,
} from "./gallery-plan";

function local(id: string, position: number, hash: string, isCover = position === 0): LocalGalleryImage {
  return { id, position, isCover, deliveredHash: hash };
}

function remote(id: string, overrides: Partial<RemoteGalleryRow> = {}): RemoteGalleryRow {
  return {
    image_id: id,
    content_hash: `h-${id}`,
    status: "synced",
    synced_position: 0,
    is_cover: false,
    attempts: 0,
    next_retry_at: null,
    ...overrides,
  };
}

test("mesma foto sincronizada com checksum diferente não é reenviada", () => {
  const plan = planGalleryDelivery([local("a", 0, "novo-hash")], [remote("a")]);
  assert.deepEqual(plan.toSend, []);
  assert.equal(plan.syncedCount, 1);
  assert.deepEqual(plan.contentDrift, ["a"]);
});

test("marca d'água aplicada depois do envio não gera inserção", () => {
  const plan = planGalleryDelivery(
    [local("a", 0, "checksum-com-marca"), local("b", 1, "h-b")],
    [remote("a", { content_hash: "checksum-sem-marca" }), remote("b")],
  );
  assert.equal(plan.toSend.length, 0);
  assert.equal(plan.contentDrift.length, 1);
});

test("entrega ambígua não volta para a fila de inserção", () => {
  const plan = planGalleryDelivery([local("a", 0, "h-a")], [remote("a", { status: "delivery_unknown" })]);
  assert.deepEqual(plan.toSend, []);
  assert.deepEqual(plan.unknown, ["a"]);
});

test("timeout, rede e 5xx são entregas ambíguas; validação não é", () => {
  assert.equal(isAmbiguousDeliveryError({ category: "network", ambiguous: true }), true);
  assert.equal(isAmbiguousDeliveryError({ category: "server", status: 502 }), true);
  assert.equal(isAmbiguousDeliveryError({ category: "unknown", status: 523 }), true);
  assert.equal(isAmbiguousDeliveryError({ category: "validation", status: 400 }), false);
});

test("destaque do site é reconhecido em boolean, Sim e 1", () => {
  assert.equal(isRemoteCover({ destaque: "Sim" }), true);
  assert.equal(isRemoteCover({ destaque: true }), true);
  assert.equal(isRemoteCover({ destaque: 1 }), true);
  assert.equal(isRemoteCover({ destaque: "Não" }), false);
  assert.equal(isRemoteCover({ codigoImagem: "1" }), false);
});

test("galeria vazia: primeira foto entra como destaque, as demais não", () => {
  const empty = analyzeRemoteGallery([]);
  assert.equal(shouldSendAsCover({ remote: empty, localIsCover: true, coversSentThisRun: 0 }), true);
  assert.equal(shouldSendAsCover({ remote: empty, localIsCover: false, coversSentThisRun: 1 }), false);
  assert.equal(shouldSendAsCover({ remote: empty, localIsCover: true, coversSentThisRun: 1 }), false);
});

test("galeria já tem destaque: nova capa local entra como destaque=Não", () => {
  const snapshot = analyzeRemoteGallery([{ destaque: "Sim" }, { destaque: "Não" }]);
  assert.equal(snapshot?.coverCount, 1);
  assert.equal(shouldSendAsCover({ remote: snapshot, localIsCover: true, coversSentThisRun: 0 }), false);
});

test("2+ destaques remotos: nenhum destaque novo e divergência marcada", () => {
  const snapshot = analyzeRemoteGallery([{ destaque: "Sim" }, { destaque: true }, { destaque: "Não" }]);
  assert.equal(snapshot?.coverCount, 2);
  assert.equal(snapshot?.multipleCovers, true);
  assert.equal(shouldSendAsCover({ remote: snapshot, localIsCover: true, coversSentThisRun: 0 }), false);
});

test("leitura da galeria indisponível nunca arrisca um segundo destaque", () => {
  assert.equal(shouldSendAsCover({ remote: null, localIsCover: true, coversSentThisRun: 0 }), false);
});

const source = readFileSync(new URL("../imobibrasil/media-sync.server.ts", import.meta.url), "utf8");

test("POST de imagem não tem retry automático de rede", () => {
  assert.match(source, /retryOnNetwork: false/);
  assert.equal(/retryOnNetwork: true/.test(source), false);
});

test("erro ambíguo confere a galeria por leitura antes de qualquer novo envio", () => {
  assert.match(source, /isAmbiguousDeliveryError/);
  // Confirmação por IDENTIDADE (código novo na galeria), não só por contagem.
  assert.match(source, /confirmed_by_read/);
  assert.match(source, /status: "delivery_unknown"/);
});

test("site com mais fotos que o esperado ou 2 destaques nunca fica sincronizado", () => {
  assert.match(source, /const extraRemote =[\s\S]*remoteCount > plan\.expectedCount/);
  assert.match(source, /"remote_multiple_covers"/);
});

test("media_sync nunca chama o cadastro do imóvel", () => {
  const executable = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  assert.equal(executable.includes("/imovel/alterar"), false);
  assert.equal(executable.includes("codigoProprietario"), false);
  assert.equal(executable.includes("codigoCorretor"), false);
});
