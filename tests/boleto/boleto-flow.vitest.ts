import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import {
  issuePreparedBoleto,
  reconcileUncertainBoleto,
  refreshRegisteredBoleto,
  type BoletoRow,
  type BoletoStore,
  type FlowDeps,
} from "../../src/lib/boleto/flow.server";
import type { BoletoSnapshot } from "../../src/lib/boleto/preview";
import type { SicrediCobrancaClient } from "../../src/lib/boleto/sicredi/cobranca.server";
import { SicrediError } from "../../src/lib/boleto/sicredi/http.server";
import { bootBoletoDb, ids, seedAccount } from "./pglite-setup";

const DOC_LINHA = "74891125110061420512803153351030188640000050000";
const DOC_BARRAS = "74891886400000500001125100614205120315335103";
let db: PGlite;
let sandbox: string;
let prod: string;
const uploads: string[] = [];

function pgStore(): BoletoStore {
  const get = async (id: string) =>
    ((await db.query<{ r: BoletoRow }>("select to_jsonb(b) r from rental_boletos b where id=$1", [id])).rows[0]?.r ?? null);
  return {
    async prepare(a) {
      const r = (
        await db.query<{ out_id: string; out_estado: BoletoRow["estado"]; out_created: boolean }>(
          "select * from rental_boleto_prepare($1,$2,$3,$4::jsonb,$5,$6::date,$7)",
          [a.contractId, a.accountId, a.competencia, JSON.stringify(a.snapshot), a.totalCentavos, a.vencimento, a.actor],
        )
      ).rows[0];
      return { id: r.out_id, estado: r.out_estado, created: r.out_created };
    },
    get,
    async transition(id, from, to, patch, actor, meta = {}) {
      const r = await db.query<{ id: string }>(
        "select id from rental_boleto_transition($1,$2::text[],$3,$4::jsonb,$5,$6,$7,$8::jsonb)",
        [id, from, to, JSON.stringify(patch), actor, meta.http ?? null, meta.mensagem ?? null, JSON.stringify(meta.detalhe ?? {})],
      );
      return r.rows[0] ? get(id) : null;
    },
    async uploadPdf(path) {
      uploads.push(path);
    },
    async recordEmission(row) {
      if (row.emission_id) return row.emission_id;
      const r = await db.query<{ id: string }>(
        "insert into rental_emissions(contract_id,tipo,created_by) values ($1,'boleto',$2) returning id",
        [row.contract_id, ids.admin],
      );
      return r.rows[0].id;
    },
    async findByNossoNumero(accountId, nossos) {
      const r = await db.query<{ r: BoletoRow }>(
        "select to_jsonb(b) r from rental_boletos b where account_id=$1 and nosso_numero = any($2::text[])",
        [accountId, nossos],
      );
      return r.rows.map((x) => x.r);
    },
  };
}
type Behaviour = { cadastrar: () => Promise<unknown>; pdf?: () => Promise<Uint8Array>; cadastrados?: () => Promise<unknown[]> };
function client(b: Behaviour) {
  const calls = { cadastrar: 0, pdf: 0 };
  const c = {
    async cadastrar() {
      calls.cadastrar++;
      return b.cadastrar();
    },
    async pdf() {
      calls.pdf++;
      return b.pdf ? b.pdf() : new TextEncoder().encode("%PDF-1.4");
    },
    async consultar() {
      return { situacao: "LIQUIDADO", nossoNumero: "251006142", seuNumero: null, dataPagamento: "2026-11-20", valorLiquidado: 2050 };
    },
    async cadastrados() {
      return b.cadastrados ? b.cadastrados() : [];
    },
    async liquidadosDia() {
      return { items: [], hasNext: false };
    },
  } as unknown as SicrediCobrancaClient;
  return { c, calls };
}
let seq = 100;
const ok = async () => ({ nossoNumero: String(251006000 + seq++), linhaDigitavel: DOC_LINHA, codigoBarras: DOC_BARRAS });
const snap = (competencia: string, ambiente: "sandbox" | "producao" = "sandbox"): BoletoSnapshot => ({
  versao: 1,
  fonte: "contrato",
  competencia,
  composicao: [{ rotulo: "Aluguel", centavos: 205000 }],
  total_centavos: 205000,
  vencimento: { data: "2026-12-10", original: "2026-12-10", alterado: false },
  pagador: { tipoPessoa: "PESSOA_FISICA", documento: "12345678909", nome: "A", endereco: "R", cidade: "C", uf: "RS", cep: "98780000" },
  encargos: { ativo: false },
  conta: { brand: "cordial", ambiente },
  especieDocumento: "RECIBO",
  tipoCobranca: "NORMAL",
});
const deps = (c: SicrediCobrancaClient): FlowDeps => ({ store: pgStore(), client: c, codigoBeneficiario: "12345", actor: ids.secretaria });

beforeAll(async () => {
  db = await bootBoletoDb();
  sandbox = await seedAccount(db, "cordial", "sandbox");
  prod = await seedAccount(db, "cordial", "producao", true);
});
afterAll(() => db.close());

describe("fluxo de emissão", () => {
  it("duplo clique envia um único POST e o segundo recebe o mesmo título", async () => {
    const k = client({ cadastrar: ok });
    const input = { contractId: ids.contratoCordial, accountId: sandbox, snapshot: snap("2026-01") };
    const [a, b] = await Promise.all([issuePreparedBoleto(deps(k.c), input), issuePreparedBoleto(deps(k.c), input)]);
    expect(k.calls.cadastrar).toBe(1);
    expect(a.row.id).toBe(b.row.id);
    const final = await pgStore().get(a.row.id);
    expect(final?.estado).toBe("registrado");
    expect(final?.pdf_estado).toBe("pronto");
    expect(final?.linha_validada).toBe(false);
  });
  it("timeout deixa 'incerto' e nunca reenvia sozinho", async () => {
    const k = client({ cadastrar: async () => Promise.reject(new SicrediError("timeout", null, "O Sicredi não respondeu")) });
    const input = { contractId: ids.contratoCordial, accountId: sandbox, snapshot: snap("2026-02") };
    const first = await issuePreparedBoleto(deps(k.c), input);
    expect(first.row.estado).toBe("incerto");
    const again = await issuePreparedBoleto(deps(k.c), input);
    expect(again.reaproveitado).toBe(true);
    expect(k.calls.cadastrar).toBe(1);
  });
  it("incerto na homologação só é liberado com motivo; depois permite nova ocorrência", async () => {
    const row = (await db.query<{ id: string }>("select id from rental_boletos where competencia='2026-02'")).rows[0];
    const k = client({ cadastrar: ok });
    const r0 = (await pgStore().get(row.id))!;
    const semMotivo = await reconcileUncertainBoleto(deps(k.c), r0);
    expect(semMotivo.row.estado).toBe("incerto");
    const liberado = await reconcileUncertainBoleto(deps(k.c), r0, { liberarMotivo: "Conferido no Internet Banking: não existe" });
    expect(liberado.row.estado).toBe("rejeitado");
    const novo = await issuePreparedBoleto(deps(k.c), { contractId: ids.contratoCordial, accountId: sandbox, snapshot: snap("2026-02") });
    expect(novo.row.ocorrencia).toBe(2);
    expect(novo.row.estado).toBe("registrado");
  });
  it("recusa 4xx vira 'rejeitado'; falha do PDF não desfaz o título", async () => {
    const recusa = client({ cadastrar: async () => Promise.reject(new SicrediError("http", 422, "não aceitou")) });
    const r = await issuePreparedBoleto(deps(recusa.c), { contractId: ids.contratoCordial, accountId: sandbox, snapshot: snap("2026-03") });
    expect(r.row.estado).toBe("rejeitado");
    const semPdf = client({ cadastrar: ok, pdf: async () => Promise.reject(new SicrediError("http", 503, "indisponível")) });
    const p = await issuePreparedBoleto(deps(semPdf.c), { contractId: ids.contratoCordial, accountId: sandbox, snapshot: snap("2026-04") });
    expect(p.row.estado).toBe("registrado");
    expect(p.row.pdf_estado).toBe("erro");
  });
  it("produção: conciliação encontra o título por seuNumero e registra nas emissões", async () => {
    const k = client({ cadastrar: async () => Promise.reject(new SicrediError("http", 504, "indisponível")), cadastrados: async () => [await ok()] });
    const input = { contractId: ids.contratoCordial, accountId: prod, snapshot: snap("2026-05", "producao") };
    const first = await issuePreparedBoleto(deps(k.c), input);
    expect(first.row.estado).toBe("incerto");
    const rec = await reconcileUncertainBoleto(deps(k.c), first.row);
    expect(rec.row.estado).toBe("registrado");
    expect(rec.row.emission_id).toBeTruthy();
    const upd = await refreshRegisteredBoleto(deps(k.c), rec.row);
    expect(upd.row.estado).toBe("liquidado");
    expect(k.calls.cadastrar).toBe(1);
  });
  it("homologação: consulta nunca muda o estado (retorno fixo do banco)", async () => {
    const row = (await db.query<{ r: BoletoRow }>("select to_jsonb(b) r from rental_boletos b where competencia='2026-01'")).rows[0].r;
    const out = await refreshRegisteredBoleto(deps(client({ cadastrar: ok }).c), row);
    expect(out.row.estado).toBe("registrado");
    expect(out.row.situacao_banco).toBe("LIQUIDADO");
  });
});
