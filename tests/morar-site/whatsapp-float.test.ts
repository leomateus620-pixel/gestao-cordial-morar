import { test } from "node:test";
import assert from "node:assert/strict";
import { floatWhatsappLink } from "../../src/lib/cordial-site/whatsapp-float";

test("mensagem geral vai para 5555996590199", () => {
  const url = floatWhatsappLink("5555996590199", "Morar Imóveis");
  assert.ok(url.startsWith("https://wa.me/5555996590199?text="));
  assert.equal(
    decodeURIComponent(url.split("text=")[1]),
    "Olá! Vim pelo site da Morar Imóveis e gostaria de atendimento.",
  );
});

test("página de imóvel inclui o link do imóvel", () => {
  const url = floatWhatsappLink("5555996590199", "Morar Imóveis", "https://x.com/imovel/1");
  assert.match(decodeURIComponent(url), /tenho interesse neste imóvel: https:\/\/x\.com\/imovel\/1$/);
});
