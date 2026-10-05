import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as zod from "zod";
import * as xml from "./ipm/xml.ts";
import * as response from "./ipm/response.ts";
import * as rules from "./emission-rules.ts";
import * as validation from "./validation.ts";
import * as profile from "./fiscal-profile.ts";
import * as token from "./preview-token.server.ts";
import type { PostNfseResult } from "./ipm/client.server.ts";

// Execute the real server handlers; only the framework boundary, database and
// municipal transport are replaced. SQL atomicity is covered by PGlite tests.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const contractId = "ba078dd4-2d5b-45e0-851a-c87f44d611ba";
const actor = "b3b8279d-ccaa-43bf-8bd5-a00e1d703a7e";
const compiled = ts.transpileModule(
  readFileSync(new URL("./nfse.functions.ts", import.meta.url), "utf8"),
  {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  },
).outputText;

function fixture() {
  const approvedProfile = {
    operation: "administracao",
    tomadorPapel: "proprietario",
    valorOrigem: "valor_revisado",
    elegibilidade: "revisao_manual",
    descricao: "Serviço revisado na documentação histórica",
    regime: "Perfil de teste sanitizado",
    localPrestacao: "8847",
    layout: "35/2021",
    regraFatoGerador: "revisao_manual",
    retencoes: { ir: 0, inss: 0, contribuicaoSocial: 0, rps: 0, pis: 0, cofins: 0, iss: 0 },
    ibsCbs: false,
    finNFSe: null,
    indFinal: null,
    tpOper: null,
    approvalReference: "Aprovação fiscal fictícia para teste local",
    productionAuthorization: null,
    automation: "assistida",
  };
  const tables: Record<string, Row[]> = {
    rental_contracts: [
      {
        id: contractId,
        brand: "cordial",
        updated_at: "2026-09-30T12:00:00Z",
        valor_mensal: 2000,
        comissao_mensal: 200,
      },
    ],
    nfse_provider_settings: [
      {
        brand: "cordial",
        cnpj: "12ABC34501DE35",
        inscricao_municipal: "123",
        razao_social: "Prestador de fixture",
        cidade_tom: "8847",
        codigo_ibge_municipio: "4317202",
        endpoint_url: validation.IPM_SANTA_ROSA_ENDPOINT,
        codigo_item_lista_servico: "1712",
        codigo_nbs: null,
        aliquota_iss: 3,
        situacao_tributaria: "0",
        tributa_municipio_prestador: "S",
        ibs_cbs_c_ind_op: "020101",
        ibs_cbs_cst: "011",
        ibs_cbs_c_class_trib: "011004",
        modo_teste: true,
        simples_nacional: true,
        config_version: 1,
        fiscal_approved_config_version: 1,
        production_authorized_config_version: null,
        fiscal_profile: approvedProfile,
      },
    ],
    rental_nfse_service_references: [],
    rental_nfse_emissions: [],
    rental_nfse_emission_events: [],
  };
  const calls: Row[] = [];
  const state = {
    allowed: true,
    admin: true,
    send: async (_input: Row): Promise<PostNfseResult> =>
      transport(
        "<retorno><mensagem><codigo>NFS-e válida para emissão.</codigo></mensagem></retorno>",
      ),
  };
  const database = {
    rpc: async (_name: string, args: { _role: string }) => ({
      data: state.allowed && (args._role !== "admin" || state.admin),
      error: null,
    }),
    from: (table: string) => {
      let operation = "select";
      let payload: Row = {};
      let single = false;
      let max = Infinity;
      let offset = 0;
      const filters: ((row: Row) => boolean)[] = [];
      const query = {
        select: (_columns?: string, _options?: unknown) => query,
        eq: (key: string, value: unknown) => {
          filters.push((row) => row[key] === value);
          return query;
        },
        is: (key: string, value: unknown) => {
          filters.push((row) => row[key] === value);
          return query;
        },
        in: (key: string, values: unknown[]) => {
          filters.push((row) => values.includes(row[key]));
          return query;
        },
        lt: (key: string, value: string) => {
          filters.push((row) => row[key] != null && row[key] < value);
          return query;
        },
        gte: (key: string, value: string) => {
          filters.push((row) => row[key] >= value);
          return query;
        },
        order: () => query,
        limit: (value: number) => {
          max = value;
          return query;
        },
        range: (from: number, to: number) => {
          offset = from;
          max = to - from + 1;
          return query;
        },
        update: (value: Row) => {
          operation = "update";
          payload = value;
          return query;
        },
        insert: (value: Row) => {
          operation = "insert";
          payload = value;
          return query;
        },
        upsert: (value: Row) => {
          operation = "upsert";
          payload = value;
          return query;
        },
        single: () => {
          single = true;
          return query;
        },
        maybeSingle: () => {
          single = true;
          return query;
        },
        then: (resolve: (result: Row) => unknown, reject?: (error: unknown) => unknown) =>
          Promise.resolve()
            .then(() => {
              const rows = (tables[table] ??= []);
              let selected = rows.filter((row) => filters.every((filter) => filter(row)));
              if (operation === "insert" || operation === "upsert") {
                const duplicate = rows.find((row) =>
                  table === "rental_nfse_service_references"
                    ? row.contract_id === payload.contract_id &&
                      row.source_key === payload.source_key
                    : table === "rental_nfse_emissions" &&
                      row.issuer_identity === payload.issuer_identity &&
                      (row.identificador === payload.identificador ||
                        ["processando", "incerto"].includes(row.status)),
                );
                if (duplicate && operation === "insert")
                  return { data: null, error: { code: "23505" } };
                if (duplicate) selected = [];
                else {
                  const inserted = {
                    id: randomUUID(),
                    attempts: 1,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    numero_nfse: null,
                    serie_nfse: null,
                    codigo_verificador: null,
                    link_pdf: null,
                    data_emissao_nfse: null,
                    resolved_by: null,
                    resolved_at: null,
                    resolution_reason: null,
                    ...structuredClone(payload),
                  };
                  rows.push(inserted);
                  selected = [inserted];
                }
              }
              if (operation === "update")
                for (const row of selected) Object.assign(row, structuredClone(payload));
              selected = selected.slice(offset, offset + max);
              return {
                data: structuredClone(single ? (selected[0] ?? null) : selected),
                error: null,
                count: selected.length,
              };
            })
            .then(resolve, reject),
      };
      return query;
    },
  };
  const nodeRequire = createRequire(import.meta.url);
  const modules: Record<string, unknown> = {
    zod,
    "./ipm/xml": xml,
    "./ipm/response": response,
    "./emission-rules": rules,
    "./validation": validation,
    "./fiscal-profile": profile,
    "./preview-token.server": token,
    "@/integrations/supabase/auth-middleware": { requireSupabaseAuth: {} },
    "@/integrations/supabase/client.server": { supabaseAdmin: database },
    "./ipm/client.server": {
      postNfse: async (input: Row) => {
        calls.push(input);
        return state.send(input);
      },
    },
    "@tanstack/react-start": {
      createServerFn: () => {
        let validate = (data: unknown) => data;
        const builder = {
          middleware: () => builder,
          inputValidator: (fn: typeof validate) => {
            validate = fn;
            return builder;
          },
          handler: (fn: (input: Row) => unknown) => (data: unknown) =>
            fn({ data: validate(data), context: { supabase: database, userId: actor } }),
        };
        return builder;
      },
    },
  };
  const module = { exports: {} as Record<string, (data?: Row) => Promise<Row>> };
  vm.runInNewContext(
    compiled,
    {
      module,
      exports: module.exports,
      require: (name: string) => modules[name] ?? nodeRequire(name),
      process: { env: { IPM_NFSE_SENHA_CORDIAL: "fixture-secret-no-real-credential" } },
      console,
      Date,
      Error,
      structuredClone,
    },
    { filename: "nfse.functions.test-runtime.cjs" },
  );
  const input = {
    contractId,
    competencia: "2026-09",
    modoTeste: true,
    review: {
      valor: 200,
      dataFatoGerador: "2026-09-30",
      tomador: {
        nome: "Tomador de fixture",
        documento: "52998224725",
        logradouro: "Rua fiscal",
        numero: "12",
        bairro: "Centro",
        cidadeTom: "8847",
        cep: "98900000",
      },
      motivo: "Documento histórico conferido explicitamente em fixture",
    },
  };
  return { api: module.exports, tables, input, calls, state };
}

function transport(raw: string, httpStatus = 200): PostNfseResult {
  return {
    transport: "ok",
    raw,
    parsed: response.parseNfseResponse(raw),
    httpStatus,
    responseComplete: true,
    parserVersion: response.NFSE_PARSER_VERSION,
    durationMs: 1,
    transportError: null,
  };
}
async function approved(f: ReturnType<typeof fixture>) {
  const preview = await f.api.previewRentalNfse(f.input);
  assert.equal(preview.bloqueado, false, JSON.stringify(preview.checklist));
  assert.ok(preview.previewToken);
  return { ...f.input, previewToken: preview.previewToken };
}
function prepareRealFixture(f: ReturnType<typeof fixture>) {
  const settings = f.tables.nfse_provider_settings[0];
  settings.modo_teste = false;
  settings.production_authorized_config_version = 1;
  settings.fiscal_profile.productionAuthorization =
    "Autorização exclusivamente sintética do teste local";
  f.tables.rental_nfse_emissions.push({
    id: randomUUID(),
    contract_id: randomUUID(),
    brand: "cordial",
    config_version: 1,
    status: "teste_ok",
    modo_teste: true,
  });
  f.input.modoTeste = false;
}

test("handler invalida confirmação após mudança de valor ou configuração e não transmite", async () => {
  const f = fixture();
  const request = await approved(f);
  await assert.rejects(
    f.api.emitRentalNfse({ ...request, review: { ...request.review, valor: 201 } }),
    /prévia mudou/,
  );
  f.tables.nfse_provider_settings[0].aliquota_iss = 4;
  await assert.rejects(f.api.emitRentalNfse(request), /prévia mudou/);
  assert.equal(f.calls.length, 0);
  assert.equal(f.tables.rental_nfse_emissions.length, 0);
});

test("handlers validam papel do servidor antes de acessar emissão ou diagnóstico", async () => {
  const f = fixture();
  f.state.allowed = false;
  await assert.rejects(f.api.previewRentalNfse(f.input), /administração ou o financeiro/);
  await assert.rejects(
    f.api.listRentalNfseEmissions({ contractId }),
    /administração ou o financeiro/,
  );
  assert.equal(f.calls.length, 0);
});

test("clique repetido retorna operação persistida; concorrência transmite uma única vez", async () => {
  const f = fixture();
  const request = await approved(f);
  const results = await Promise.allSettled([
    f.api.emitRentalNfse(request),
    f.api.emitRentalNfse(request),
  ]);
  assert.ok(results.some((result) => result.status === "fulfilled"));
  assert.equal(f.calls.length, 1);
  assert.equal(f.tables.rental_nfse_emissions.length, 1);
  const repeated = await f.api.emitRentalNfse(request);
  assert.equal(repeated.emission.id, f.tables.rental_nfse_emissions[0].id);
  assert.equal(f.calls.length, 1);
});

test("resposta tardia preserva evidência e não sobrescreve tentativa mais recente", async () => {
  const f = fixture();
  const request = await approved(f);
  f.state.send = async () => {
    const row = f.tables.rental_nfse_emissions[0];
    row.attempt_id = randomUUID();
    row.status = "incerto";
    return transport(
      "<retorno><mensagem><codigo>NFS-e válida para emissão.</codigo></mensagem></retorno>",
    );
  };
  await assert.rejects(f.api.emitRentalNfse(request), /resposta foi preservada/);
  assert.equal(f.tables.rental_nfse_emissions[0].status, "incerto");
  const evidence = f.tables.rental_nfse_emission_events[0];
  assert.equal(evidence.evidence_kind, "late_response");
  assert.notEqual(evidence.attempt_id, f.tables.rental_nfse_emissions[0].attempt_id);
  assert.match(evidence.details.response_raw, /válida para emissão/);
});

test("recuperação conserva XML/identificador e limpa evidência da tentativa anterior antes de transmitir", async () => {
  const f = fixture();
  const request = await approved(f);
  f.state.send = async () =>
    transport("<retorno><mensagem><codigo>00383 - Serviço inválido</codigo></mensagem></retorno>");
  await f.api.emitRentalNfse(request);
  const row = f.tables.rental_nfse_emissions[0];
  const previousAttempt = row.attempt_id;
  const previousXml = row.request_xml;
  const previousId = row.identificador;
  f.state.send = async (input) => {
    assert.notEqual(row.attempt_id, previousAttempt);
    for (const key of ["response_raw", "http_status", "parser_version", "transport", "finished_at"])
      assert.equal(row[key], null, key);
    assert.equal(row.response_complete, false);
    assert.equal(input.xml, previousXml);
    assert.equal(row.identificador, previousId);
    return transport("<retorno/>", 503);
  };
  await f.api.reconcileRentalNfse({ emissionId: row.id, modo: "reenvio" });
  assert.equal(row.status, "incerto");
  assert.equal(row.attempts, 2);
  const classified = await f.api.reclassifyStuckNfse();
  assert.equal(classified.alteradas.length, 0);
  assert.equal(row.status, "incerto");
});

test("reabrir histórico expira envio abandonado sem liberar duplicidade nem expor XML", async () => {
  const f = fixture();
  const request = await approved(f);
  await f.api.emitRentalNfse(request);
  const row = f.tables.rental_nfse_emissions[0];
  row.status = "processando";
  row.updated_at = "2020-01-01T00:00:00Z";
  const history = await f.api.listRentalNfseEmissions({ contractId });
  assert.equal(history[0].status, "incerto");
  assert.equal(history[0].request_xml, undefined);
  assert.equal(history[0].response_raw, undefined);
  assert.equal(f.calls.length, 1);
});

test("ocorrência de pagamento fornece valor histórico, independentemente da comissão atual", async () => {
  const f = fixture();
  const historical = {
    id: randomUUID(),
    contract_id: contractId,
    source: "payment",
    source_key: "payment:2026-09-30",
    vencimento_original: "2026-09-30",
    competencia: null,
    fato_gerador: null,
    valor_servico: 200,
    contract_snapshot: { comissao_mensal: 200, tenant_id: "tomador-anterior" },
    decision: {},
    created_at: "2026-09-30T12:00:00Z",
  };
  f.tables.rental_nfse_service_references.push(historical);
  Object.assign(f.tables.nfse_provider_settings[0].fiscal_profile, {
    elegibilidade: "pagamento",
    valorOrigem: "comissao_mensal",
  });
  f.tables.rental_contracts[0].comissao_mensal = 999;
  Object.assign(f.input.review, { referenceId: historical.id });
  const request = await approved(f);
  await f.api.emitRentalNfse(request);
  const row = f.tables.rental_nfse_emissions[0];
  assert.equal(row.valor, 200);
  assert.equal(row.competencia, "2026-09-01");
  assert.equal(row.snapshot.reference.contract_snapshot.comissao_mensal, 200);
  const revised = f.tables.rental_nfse_service_references.find(
    (ref) => ref.id === row.service_reference_id,
  )!;
  assert.equal(revised.source, "manual_review");
  assert.equal(revised.decision.source_reference_id, historical.id);
  assert.equal(revised.competencia, "2026-09-01");
  assert.equal(revised.valor_servico, 200);
  assert.equal(historical.competencia, null, "ocorrência original não recebe competência inferida");
  assert.ok(revised.decision.reason.length >= 15);
});

test("reclassificação considera evidência tardia somente da tentativa vigente", async () => {
  const f = fixture();
  const request = await approved(f);
  await f.api.emitRentalNfse(request);
  const row = f.tables.rental_nfse_emissions[0];
  const previousAttempt = row.attempt_id;
  Object.assign(row, {
    status: "incerto",
    attempt_id: randomUUID(),
    response_raw: null,
    http_status: null,
    response_complete: false,
    parser_version: null,
    transport: null,
  });
  const details = {
    ...transport(
      "<retorno><mensagem><codigo>NFS-e válida para emissão.</codigo></mensagem></retorno>",
    ),
    response_raw:
      "<retorno><mensagem><codigo>NFS-e válida para emissão.</codigo></mensagem></retorno>",
    http_status: 200,
    response_complete: true,
    parser_version: response.NFSE_PARSER_VERSION,
    mode: "reenvio",
  };
  f.tables.rental_nfse_emission_events.push({
    emission_id: row.id,
    attempt_id: previousAttempt,
    evidence_kind: "late_response",
    details,
  });
  const oldEvidence = await f.api.reclassifyStuckNfse();
  assert.equal(oldEvidence.alteradas.length, 0);
  assert.equal(row.status, "incerto");
  f.tables.rental_nfse_emission_events.push({
    emission_id: row.id,
    attempt_id: row.attempt_id,
    evidence_kind: "late_response",
    details,
  });
  const currentEvidence = await f.api.reclassifyStuckNfse();
  assert.equal(currentEvidence.alteradas.length, 1);
  assert.equal(row.status, "teste_ok");
  assert.equal(f.calls.length, 1, "reclassificação não retransmite");
});

test("resposta de outro prestador conserva número/verificador/link anteriores", async () => {
  const f = fixture();
  prepareRealFixture(f);
  const request = await approved(f);
  f.state.send = async () =>
    transport(
      "<retorno><numero_nfse>50</numero_nfse><cod_verificador_autenticidade>AUTH-50</cod_verificador_autenticidade><link_nfse>https://santarosa.atende.net/nfse/50</link_nfse></retorno>",
      503,
    );
  const first = await f.api.emitRentalNfse({ ...request, confirmarEmissaoReal: true });
  const row = f.tables.rental_nfse_emissions.find((item) => item.id === first.emission.id)!;
  assert.equal(row.status, "incerto");
  f.state.send = async (input) => {
    assert.match(input.xml, /<pesquisa>/);
    assert.doesNotMatch(input.xml, /<nfse_teste>/);
    return transport(
      "<retorno><nfse><nfe><numero_nfse>900</numero_nfse><cod_verificador_autenticidade>OTHER</cod_verificador_autenticidade><link_nfse>https://santarosa.atende.net/nfse/900</link_nfse></nfe><prestador><cpfcnpj>42767687000135</cpfcnpj></prestador></nfse></retorno>",
    );
  };
  await f.api.reconcileRentalNfse({ emissionId: row.id, modo: "consulta" });
  assert.equal(row.status, "incerto");
  assert.equal(row.numero_nfse, "50");
  assert.equal(row.codigo_verificador, "AUTH-50");
  assert.equal(row.link_pdf, "https://santarosa.atende.net/nfse/50");
  assert.match(
    row.response_raw,
    /42767687000135/,
    "retorno alheio é preservado somente como diagnóstico",
  );
});

test("recusa em consulta não libera a operação nem após reclassificação administrativa", async () => {
  const f = fixture();
  prepareRealFixture(f);
  const request = await approved(f);
  f.state.send = async () =>
    transport(
      "<retorno><numero_nfse>50</numero_nfse><cod_verificador_autenticidade>AUTH-50</cod_verificador_autenticidade></retorno>",
      503,
    );
  const first = await f.api.emitRentalNfse({ ...request, confirmarEmissaoReal: true });
  const row = f.tables.rental_nfse_emissions.find((item) => item.id === first.emission.id)!;
  f.state.send = async () =>
    transport("<retorno><mensagem><codigo>00100 - Consulta recusada</codigo></mensagem></retorno>");
  await f.api.reconcileRentalNfse({ emissionId: row.id, modo: "consulta" });
  assert.equal(row.status, "incerto");
  const result = await f.api.reclassifyStuckNfse();
  assert.equal(result.alteradas.length, 0);
  assert.equal(row.status, "incerto");
});

async function refusedReal(f: ReturnType<typeof fixture>) {
  prepareRealFixture(f);
  const request = await approved(f);
  f.state.send = async () =>
    transport("<retorno><mensagem><codigo>00383 - Serviço inválido</codigo></mensagem></retorno>");
  const first = await f.api.emitRentalNfse({ ...request, confirmarEmissaoReal: true });
  const parent = f.tables.rental_nfse_emissions.find((row) => row.id === first.emission.id)!;
  assert.equal(parent.status, "erro");
  Object.assign(f.input.review, {
    replacesEmissionId: parent.id,
    valor: 201,
    motivo: "Revisão explícita após recusa comprovada e conferência documental",
  });
  return parent;
}

test("recusa comprovada permite revisão material com nova identidade e histórico preservado", async () => {
  const f = fixture();
  const parent = await refusedReal(f);
  const priorXml = parent.request_xml;
  const priorHash = parent.snapshot_hash;
  const revised = await approved(f);
  f.state.send = async () =>
    transport(
      "<retorno><numero_nfse>901</numero_nfse><serie_nfse>1</serie_nfse><situacao_codigo_nfse>1</situacao_codigo_nfse></retorno>",
    );
  const emitted = await f.api.emitRentalNfse({ ...revised, confirmarEmissaoReal: true });
  const child = f.tables.rental_nfse_emissions.find((row) => row.id === emitted.emission.id)!;
  assert.equal(child.status, "emitida");
  assert.equal(child.valor, 201);
  assert.notEqual(child.identificador, parent.identificador);
  assert.equal(child.snapshot.revisionOf.id, parent.id);
  assert.equal(parent.status, "erro");
  assert.equal(parent.request_xml, priorXml);
  assert.equal(parent.snapshot_hash, priorHash);
  const repeated = await f.api.emitRentalNfse({ ...revised, confirmarEmissaoReal: true });
  assert.equal(repeated.emission.id, child.id);
  assert.equal(f.calls.length, 2, "repetir a confirmação não transmite novamente");
});

test("incerteza, corpo incompleto, erro de consulta e HTTP503 nunca autorizam nova identidade real", async () => {
  const variants: ((row: Row) => void)[] = [
    (row) => {
      row.status = "incerto";
    },
    (row) => {
      row.response_complete = false;
    },
    (row) => {
      row.http_status = 503;
    },
    (row) => {
      row.transition_details = { mode: "consulta" };
    },
    (row) => {
      row.numero_nfse = "900";
    },
    (row) => {
      row.issuer_identity = "42767687000135";
    },
  ];
  for (const alter of variants) {
    const f = fixture();
    const parent = await refusedReal(f);
    alter(parent);
    const preview = await f.api.previewRentalNfse(f.input);
    assert.equal(preview.bloqueado, true);
    assert.equal(preview.previewToken, null);
    assert.equal(f.calls.length, 1);
  }
});

test("resolução manual registrada permite revisão e ausência de motivo não permite", async () => {
  const f = fixture();
  const parent = await refusedReal(f);
  Object.assign(parent, {
    status: "nao_emitida",
    resolved_by: actor,
    resolved_at: new Date().toISOString(),
    resolution_reason: "Conferido no portal com comprovação de não emissão",
  });
  const approvedResolution = await f.api.previewRentalNfse(f.input);
  assert.equal(approvedResolution.bloqueado, false);
  assert.ok(approvedResolution.previewToken);
  parent.resolution_reason = null;
  const noEvidence = await f.api.previewRentalNfse(f.input);
  assert.equal(noEvidence.bloqueado, true);
  assert.equal(noEvidence.previewToken, null);
});

test("revisão real exige administração atual também depois de gerar a prévia", async () => {
  const f = fixture();
  await refusedReal(f);
  const request = await approved(f);
  f.state.admin = false;
  await assert.rejects(f.api.previewRentalNfse(f.input), /administração/);
  await assert.rejects(
    f.api.emitRentalNfse({ ...request, confirmarEmissaoReal: true }),
    /administração/,
  );
  assert.equal(f.calls.length, 1);
});

test("revisões de teste mudam a identidade material e repetição idêntica mantém a mesma", async () => {
  const f = fixture();
  const first = await approved(f);
  const original = await f.api.emitRentalNfse(first);
  f.input.review.valor = 201;
  const second = await approved(f);
  const changed = await f.api.emitRentalNfse(second);
  assert.notEqual(changed.emission.identificador, original.emission.identificador);
  const repeat = await f.api.emitRentalNfse(second);
  assert.equal(repeat.emission.identificador, changed.emission.identificador);
  assert.equal(f.calls.length, 2);
});

async function uncertainReal(f: ReturnType<typeof fixture>) {
  prepareRealFixture(f);
  const request = await approved(f);
  f.state.send = async () => ({
    ...transport(""),
    transport: "timeout",
    httpStatus: null,
    responseComplete: false,
    transportError: "Tempo esgotado na fixture",
  });
  const sent = await f.api.emitRentalNfse({ ...request, confirmarEmissaoReal: true });
  const row = f.tables.rental_nfse_emissions.find((item) => item.id === sent.emission.id)!;
  assert.equal(row.status, "incerto");
  return row;
}

test("recusa ou não envio na recuperação nunca esclarece emissão anterior incerta", async () => {
  const failures: PostNfseResult[] = [
    transport(
      "<retorno><mensagem><codigo>00383 - Serviço recusado</codigo></mensagem></retorno>",
      400,
    ),
    {
      ...transport(""),
      transport: "nao_enviado",
      httpStatus: null,
      responseComplete: false,
      transportError: "Credencial ausente na fixture",
    },
  ];
  for (const failure of failures) {
    const f = fixture();
    const row = await uncertainReal(f);
    const identifier = row.identificador;
    f.state.send = async () => failure;
    await f.api.reconcileRentalNfse({
      emissionId: row.id,
      modo: "reenvio",
      confirmarReenvioReal: true,
    });
    assert.equal(row.status, "incerto");
    assert.equal(row.transition_details.previous_status, "incerto");
    assert.equal(row.identificador, identifier);
    const reclassified = await f.api.reclassifyStuckNfse();
    assert.equal(reclassified.alteradas.length, 0);
    assert.equal(row.status, "incerto");
    assert.equal(f.calls.length, 2, "reclassificar não transmite");
  }
});

test("recuperação de recusa definitiva mantém erro quando nova tentativa também é recusada", async () => {
  const f = fixture();
  const row = await refusedReal(f);
  f.state.send = async () =>
    transport(
      "<retorno><mensagem><codigo>00383 - Serviço recusado</codigo></mensagem></retorno>",
      400,
    );
  await f.api.reconcileRentalNfse({
    emissionId: row.id,
    modo: "reenvio",
    confirmarReenvioReal: true,
  });
  assert.equal(row.status, "erro");
  assert.equal(row.transition_details.previous_status, "erro");
  assert.equal(row.attempts, 2);
});

test("recusa tardia de reenvio incerto é evidência sem transição e não libera via reclassificação", async () => {
  const f = fixture();
  const row = await uncertainReal(f);
  f.state.send = async () => {
    row.status = "incerto"; // expiração concorrente da mesma tentativa antes da resposta.
    return transport(
      "<retorno><mensagem><codigo>00383 - Serviço recusado</codigo></mensagem></retorno>",
      400,
    );
  };
  await assert.rejects(
    f.api.reconcileRentalNfse({ emissionId: row.id, modo: "reenvio", confirmarReenvioReal: true }),
    /resposta foi preservada/,
  );
  const evidence = f.tables.rental_nfse_emission_events.at(-1)!;
  assert.equal(evidence.to_status, null);
  assert.equal(evidence.evidence_kind, "late_response");
  assert.equal(evidence.details.previous_status, "incerto");
  const reclassified = await f.api.reclassifyStuckNfse();
  assert.equal(reclassified.alteradas.length, 0);
  assert.equal(row.status, "incerto");
});
