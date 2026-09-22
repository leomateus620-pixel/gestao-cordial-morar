import { strict as assert } from "node:assert";
import test from "node:test";
import { normalizeRichText } from "./payload-diff";
import { verifyFields } from "./characteristics-diff";

test("descrição com <br>, entidades e acentos em dupla codificação confere", () => {
  const remote = "&#10024; Terreno com localizaÃ§Ã£o ideal<br /><br />&#128205; Bairro Cruzeiro";
  const sent = "✨ Terreno com localização ideal\n\n📍 Bairro Cruzeiro";
  assert.equal(normalizeRichText(remote), normalizeRichText(sent));
  const r = verifyFields({ descricaoImovel: sent }, { descricaoImovel: normalizeRichText(remote) }, () => false);
  assert.deepEqual(r.confirmed, ["descricaoImovel"]);
});

test("mudança real na descrição continua divergente", () => {
  const r = verifyFields({ descricaoImovel: "Texto novo" }, { descricaoImovel: "Texto antigo" }, () => true);
  assert.deepEqual(r.divergent, ["descricaoImovel"]);
});
