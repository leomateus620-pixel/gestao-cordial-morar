import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  CADASTRAL_ACTIONS,
  MEDIA_ACTIONS,
  claimActionsFor,
  claimLimitFor,
  isLeaseExpired,
  leaseSecondsFor,
  shouldCancelForPause,
} from "./queue-policy";

const syncSource = readFileSync("src/lib/imobibrasil/sync.server.ts", "utf8");
const mediaSource = readFileSync("src/lib/imobibrasil/media-sync.server.ts", "utf8");
const cadastralRoute = readFileSync(
  "src/routes/api/public/hooks/property-sync-worker.ts",
  "utf8",
);
const mediaRoute = readFileSync("src/routes/api/public/hooks/property-media-worker.ts", "utf8");

describe("política da fila de publicação", () => {
  it("worker cadastral nunca reivindica media_sync", () => {
    expect(claimActionsFor("cadastral")).toEqual(CADASTRAL_ACTIONS);
    expect(claimActionsFor("cadastral")).not.toContain("media_sync");
  });

  it("worker de mídia reivindica apenas media_sync, um job por vez", () => {
    expect(claimActionsFor("media")).toEqual(MEDIA_ACTIONS);
    expect(claimLimitFor("media", 10)).toBe(1);
    expect(claimLimitFor("cadastral", 10)).toBe(10);
    expect(claimLimitFor("cadastral", 99)).toBe(10);
  });

  it("um media_sync lento não pode compartilhar lote com publish", () => {
    // Regressão do incidente 18/09/2026: 8 jobs (media_sync + publish) num só lote.
    const media = claimActionsFor("media");
    const cadastral = claimActionsFor("cadastral");
    expect(media.some((action) => cadastral.includes(action))).toBe(false);
    expect(leaseSecondsFor("media")).toBeGreaterThan(leaseSecondsFor("cadastral"));
  });

  it("lease expirado volta para retry", () => {
    const now = new Date("2026-09-18T19:45:00Z");
    expect(isLeaseExpired({ status: "processing", lock_expires_at: "2026-09-18T19:42:33Z" }, now)).toBe(
      true,
    );
    expect(isLeaseExpired({ status: "processing", lock_expires_at: "2026-09-18T19:50:00Z" }, now)).toBe(
      false,
    );
    expect(isLeaseExpired({ status: "succeeded", lock_expires_at: null }, now)).toBe(false);
  });

  it("com a pausa ligada, só update é bloqueado; publish continua permitido", () => {
    expect(shouldCancelForPause("update", true)).toBe(true);
    expect(shouldCancelForPause("publish", true)).toBe(false);
    expect(shouldCancelForPause("media_sync", true)).toBe(false);
    expect(shouldCancelForPause("update", false)).toBe(false);
  });
});

describe("separação cadastro x mídia (regressão de código)", () => {
  it("publish/update não aguarda a entrega da galeria", () => {
    expect(syncSource).not.toMatch(/await\s+syncImages\(/);
    expect(syncSource).not.toMatch(/deliverGallery/);
    expect(syncSource).toMatch(/queueMediaAfterCadastral/);
  });

  it("o status cadastral não depende de falha de foto", () => {
    expect(syncSource).toMatch(/const finalStatus = verified \? "published" : "partial";/);
  });

  it("media_sync nunca chama /imovel/alterar", () => {
    expect(mediaSource).not.toContain("/imovel/alterar");
    expect(mediaRoute).not.toContain("/imovel/alterar");
  });

  it("cada rota usa o worker do seu tipo", () => {
    expect(cadastralRoute).toMatch(/kind: "cadastral"/);
    expect(mediaRoute).toMatch(/kind: "media"/);
  });

  it("a recuperação de lease é automática (RPC no claim), não manual", () => {
    expect(syncSource).toMatch(/property_sync_reclaim_stale/);
  });
});
