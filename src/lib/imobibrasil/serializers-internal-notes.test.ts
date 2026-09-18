import test from "node:test";
import assert from "node:assert/strict";

import { serializeProperty, type LocalPropertyForSync } from "./serializers.ts";

const base: LocalPropertyForSync = {
  id: "1f9d2c34-5678-4abc-9def-0123456789ab",
  operacao: "venda",
  tipo: "Casa",
};

/** Todo texto do payload, em qualquer profundidade. */
function textValues(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => textValues(item, out));
  else if (value && typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach((item) => textValues(item, out));
  }
  return out;
}

function assertNunca(payload: unknown, frases: string[]) {
  const textos = textValues(payload).join("\n").toLowerCase();
  for (const frase of frases) {
    assert.equal(textos.includes(frase.toLowerCase()), false, `vazou: ${frase}`);
  }
}

const OBS_INTERNA = "comissão de 6%\nAg: Felipe Fleck\nProprietário quer R$ 500.000 líquido";
const OUTRAS_INTERNAS = "Chaves com corretor Ricardo";

for (const mode of ["insert", "update"] as const) {
  test(`caso A/E/F (${mode}): observação e outras informações nunca vão para o site`, () => {
    const payload = serializeProperty(
      { ...base, observacao_imovel: OBS_INTERNA, outras_informacoes: OUTRAS_INTERNAS, pontos_fortes: null },
      {},
      { mode },
    );
    assertNunca(payload, [
      "comissão de 6%",
      "Felipe Fleck",
      "Proprietário quer",
      "500.000 líquido",
      "Chaves com corretor",
      "Ricardo",
    ]);
    // Caso 5: campo público vazio precisa limpar o texto antigo do site.
    assert.equal(payload["pontosFortesImovel"], "");
  });
}

test("caso B: apenas o ponto forte legítimo é enviado", () => {
  const payload = serializeProperty(
    {
      ...base,
      observacao_imovel: OBS_INTERNA,
      outras_informacoes: OUTRAS_INTERNAS,
      pontos_fortes: "Valor R$1.500.000,00",
    },
    {},
    { mode: "update" },
  );
  assert.equal(payload["pontosFortesImovel"], "Valor R$1.500.000,00");
  assertNunca(payload, ["comissão", "Felipe Fleck", "Chaves com corretor"]);
});

test("caso C: linhas internas dentro de pontos fortes são removidas", () => {
  const payload = serializeProperty(
    { ...base, pontos_fortes: "comissão 6%\nAg: Felipe\nAmplo quintal" },
    {},
    { mode: "update" },
  );
  assert.equal(payload["pontosFortesImovel"], "Amplo quintal");
});

test("caso D: pontos fortes legítimos são preservados integralmente", () => {
  const payload = serializeProperty(
    { ...base, pontos_fortes: "Amplo quintal\nPróximo ao centro" },
    {},
    { mode: "update" },
  );
  assert.equal(payload["pontosFortesImovel"], "Amplo quintal<br /> Próximo ao centro");
});
