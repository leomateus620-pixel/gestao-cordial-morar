import test from "node:test";
import assert from "node:assert/strict";
import { nfseDocActions, nfseShareText, whatsappShareUrl } from "./nfse-share.ts";

test("modo teste: só faixa, sem ver/baixar/compartilhar", () => {
  assert.deepEqual(nfseDocActions({ modoTeste: true, pdfStatus: "salvo" }), {
    view: false, download: false, share: false, testBanner: true,
  });
});

test("nota real com PDF salvo libera as três ações", () => {
  const a = nfseDocActions({ modoTeste: false, pdfStatus: "salvo" });
  assert.ok(a.view && a.download && a.share && !a.testBanner);
  assert.equal(nfseDocActions({ modoTeste: false, pdfStatus: "pendente" }).share, false);
});

test("compartilhar usa o link oficial, nunca o temporário", () => {
  const t = nfseShareText({ fileName: "NFS-e 12 - Cordial - 09-2026.pdf", officialLink: "https://santarosa.atende.net/x" });
  assert.equal(t, "NFS-e 12 - Cordial - 09-2026\nAutenticidade: https://santarosa.atende.net/x");
  assert.match(whatsappShareUrl(t), /^https:\/\/wa\.me\/\?text=NFS-e%2012/);
});
