import { strict as assert } from "node:assert";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  CADASTRAL_ACTIONS,
  MEDIA_ACTIONS,
  claimActionsFor,
  claimLimitFor,
  isLeaseExpired,
  leaseSecondsFor,
  isWriteBlockedByPause,
  shouldDeferForPause,
} from "./queue-policy";

const syncSource = readFileSync("src/lib/imobibrasil/sync.server.ts", "utf8");
const mediaSource = readFileSync("src/lib/imobibrasil/media-sync.server.ts", "utf8");
const cadastralRoute = readFileSync("src/routes/api/public/hooks/property-sync-worker.ts", "utf8");
const mediaRoute = readFileSync("src/routes/api/public/hooks/property-media-worker.ts", "utf8");

test("worker cadastral nunca reivindica media_sync", () => {
  assert.deepEqual(claimActionsFor("cadastral"), CADASTRAL_ACTIONS);
  assert.ok(!claimActionsFor("cadastral").includes("media_sync"));
});

test("worker de mídia reivindica apenas media_sync, um job por vez", () => {
  assert.deepEqual(claimActionsFor("media"), MEDIA_ACTIONS);
  assert.equal(claimLimitFor("media", 10), 1);
  assert.equal(claimLimitFor("cadastral", 10), 10);
  assert.equal(claimLimitFor("cadastral", 99), 10);
});

test("um media_sync lento não compartilha lote com publish (incidente 18/09/2026)", () => {
  const media = claimActionsFor("media");
  const cadastral = claimActionsFor("cadastral");
  assert.equal(
    media.some((action) => cadastral.includes(action)),
    false,
  );
  assert.ok(leaseSecondsFor("media") > leaseSecondsFor("cadastral"));
});

test("job com lease expirado é reconhecido para voltar a retry", () => {
  const now = new Date("2026-09-18T19:45:00Z");
  assert.equal(
    isLeaseExpired({ status: "processing", lock_expires_at: "2026-09-18T19:42:33Z" }, now),
    true,
  );
  assert.equal(
    isLeaseExpired({ status: "processing", lock_expires_at: "2026-09-18T19:50:00Z" }, now),
    false,
  );
  assert.equal(isLeaseExpired({ status: "succeeded", lock_expires_at: null }, now), false);
});

test("com a pausa ligada, alteração e retirada esperam; criação e fotos seguem", () => {
  assert.equal(isWriteBlockedByPause("update", true), true);
  assert.equal(isWriteBlockedByPause("unpublish", true), true);
  assert.equal(isWriteBlockedByPause("publish", true), false);
  assert.equal(isWriteBlockedByPause("media_sync", true), false);
  assert.equal(isWriteBlockedByPause("update", false), false);
});

test("bloqueio pela pausa é retomável, nunca cancelamento definitivo", () => {
  assert.equal(shouldDeferForPause("update", true), true);
  assert.equal(syncSource.includes("PausedWriteError"), true);
  // O único cancelamento permitido é o de versão antiga absorvida por outra.
  const cancels = syncSource.match(/status:\s*"cancelled"[\s\S]{0,160}/g) ?? [];
  assert.ok(cancels.every((snippet) => snippet.includes("Absorvido por versão mais nova")));
});

test("publish/update não aguarda a entrega da galeria", () => {
  assert.equal(/await\s+syncImages\(/.test(syncSource), false);
  assert.equal(syncSource.includes("deliverGallery"), false);
  assert.ok(syncSource.includes("queueMediaAfterCadastral"));
});

test("status cadastral não depende de falha de foto", () => {
  const match = syncSource.match(/const finalStatus =([\s\S]*?);/);
  assert.ok(match);
  // Depende de cadastro e características, nunca das fotos.
  assert.equal(/media|image|foto/i.test(match![1]!), false);
  assert.ok(match![1]!.includes("characteristics.incomplete"));
});

const stripComments = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
    .join("\n");

test("media_sync nunca chama /imovel/alterar", () => {
  assert.equal(stripComments(mediaSource).includes("/imovel/alterar"), false);
  assert.equal(stripComments(mediaRoute).includes("/imovel/alterar"), false);
});


test("cada rota usa o worker do seu tipo", () => {
  assert.ok(cadastralRoute.includes('kind: "cadastral"'));
  assert.ok(mediaRoute.includes('kind: "media"'));
});

test("recuperação de lease é automática via RPC, não manual", () => {
  assert.ok(syncSource.includes("property_sync_reclaim_stale"));
});
