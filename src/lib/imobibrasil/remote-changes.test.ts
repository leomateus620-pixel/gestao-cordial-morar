import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { planRemoteChanges, type PublicationState } from "./remote-changes.server";
import type { NormalizedProperty } from "./import-normalizers";

const remoteBase: NormalizedProperty = {
  externalId: "4355160",
  externalReference: "REF-1381",
  carteira: "cordial",
  operacao: "venda",
  finalidade: "venda",
  tipo: "Casa",
  cidade: "Passo Fundo",
  uf: "RS",
  bairro: "Centro",
  cep: "99010000",
  logradouro: "Rua A",
  numero: "10",
  complemento: null,
  localizacaoExibida: "Centro",
  valor: 450000,
  valorCondominio: null,
  valorIptu: null,
  dormitorios: 3,
  suites: 1,
  banheiros: 2,
  salas: 1,
  vagas: 2,
  acomodacoes: null,
  anoConstrucao: null,
  areaPrivativa: 120,
  areaTotal: null,
  areaTerreno: null,
  areaConstruida: null,
  areaPrincipal: 120,
  areaTipo: "privativa",
  descricao: "Casa ampla",
  observacao: null,
  pontosFortes: "Pátio grande",
  codigo: "1381",
  exibirImovel: true,
  caracteristicas: [],
};

const publication: PublicationState = {
  id: "pub-1",
  property_id: "prop-1",
  provider: "cordial",
  confirmed_field_snapshot: {
    valor: 450000,
    descricao_imovel: "Casa ampla",
    bairro: "Centro",
    dormitorios: 3,
  },
  echo_payload_hash: null,
  echo_expires_at: null,
};

const localBase = {
  valor: 450000,
  descricao_imovel: "Casa ampla",
  bairro: "Centro",
  dormitorios: 3,
};

describe("planRemoteChanges", () => {
  it("importa automaticamente o que mudou só no site", () => {
    const plan = planRemoteChanges({
      publication,
      localRow: localBase,
      remote: { ...remoteBase, valor: 470000 },
      remoteHash: "h-novo",
    });
    assert.equal(plan.patch["valor"], 470000);
    assert.equal(plan.conflicts.length, 0);
  });

  it("preserva edição local pendente e limpeza intencional", () => {
    const plan = planRemoteChanges({
      publication,
      localRow: { ...localBase, descricao_imovel: "Casa reformada", bairro: null },
      remote: remoteBase,
      remoteHash: "h-igual",
    });
    assert.ok(!("descricao_imovel" in plan.patch));
    assert.ok(!("bairro" in plan.patch));
    assert.equal(plan.fullyConfirmed, false, "referência não avança com diferença preservada");
  });

  it("em divergência aplica o valor do site e registra o caso", () => {
    const plan = planRemoteChanges({
      publication,
      localRow: { ...localBase, valor: 460000 },
      remote: { ...remoteBase, valor: 480000 },
      remoteHash: "h-conflito",
    });
    assert.equal(plan.patch["valor"], 480000);
    assert.deepEqual(plan.conflicts.map((c) => c.field), ["valor"]);
    assert.equal(plan.conflicts[0]!.local, 460000);
  });

  it("não altera nada quando a leitura é eco do próprio envio", () => {
    const plan = planRemoteChanges({
      publication: {
        ...publication,
        echo_payload_hash: "h-eco",
        echo_expires_at: new Date(Date.now() + 60_000).toISOString(),
      },
      localRow: { ...localBase, valor: 460000 },
      remote: { ...remoteBase, valor: 480000 },
      remoteHash: "h-eco",
    });
    assert.deepEqual(plan.patch, {});
    assert.equal(plan.conflicts.length, 0);
    assert.equal(plan.echo, true);
  });

  it("nunca toca em campos protegidos (código, referência, pontos fortes)", () => {
    const plan = planRemoteChanges({
      publication,
      localRow: { ...localBase, codigo: "1381", referencia: "REF-1381", pontos_fortes: "Local" },
      remote: { ...remoteBase, codigo: "9999", externalReference: "OUTRA", pontosFortes: "Outro" },
      remoteHash: "h-prot",
    });
    for (const key of ["codigo", "referencia", "pontos_fortes"]) {
      assert.ok(!(key in plan.patch), `${key} não pode ser importado`);
    }
  });

  it("campo que a leitura não descreve fica fora da decisão", () => {
    const plan = planRemoteChanges({
      publication,
      localRow: { ...localBase, valor_iptu: 900 },
      remote: remoteBase,
      remoteHash: "h-null",
    });
    assert.ok(!("valor_iptu" in plan.patch));
    assert.ok(plan.report.unverifiable.some((f) => f.field === "valor_iptu"));
  });
});
