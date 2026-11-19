import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { boletoSeuNumero } from "../../src/lib/boleto/sicredi/seu-numero";
import { asUser, bootBoletoDb, ids, seedAccount } from "./pglite-setup";

let db: PGlite;
let sandboxCordial: string;
let prodCordial: string;
const snapshot = JSON.stringify({ versao: 1, competencia: "2026-11", vencimento: { data: "2026-11-28", original: "2026-11-10", alterado: true } });
const prepare = (contract: string, account: string, comp = "2026-11") =>
  db.query<{ out_id: string; out_estado: string; out_created: boolean }>(
    "select * from public.rental_boleto_prepare($1,$2,$3,$4::jsonb,205000,'2026-11-28',$5)",
    [contract, account, comp, snapshot, ids.admin],
  );

beforeAll(async () => {
  db = await bootBoletoDb();
  sandboxCordial = await seedAccount(db, "cordial", "sandbox");
  prodCordial = await seedAccount(db, "cordial", "producao", false);
});
afterAll(() => db.close());

describe("banco: emissão idempotente e protegida", () => {
  it("duplo clique / duas abas geram um único título vivo", async () => {
    const [a, b] = await Promise.all([prepare(ids.contratoCordial, sandboxCordial), prepare(ids.contratoCordial, sandboxCordial)]);
    expect(a.rows[0].out_id).toBe(b.rows[0].out_id);
    expect([a.rows[0].out_created, b.rows[0].out_created].sort()).toEqual([false, true]);
    const n = await db.query<{ n: number }>("select count(*)::int n from rental_boletos where contract_id=$1", [ids.contratoCordial]);
    expect(n.rows[0].n).toBe(1);
  });
  it("seuNumero do banco é igual ao do servidor", async () => {
    const row = await db.query<{ seu_numero: string; ocorrencia: number; id_titulo_empresa: string }>(
      "select seu_numero, ocorrencia, id_titulo_empresa from rental_boletos where contract_id=$1",
      [ids.contratoCordial],
    );
    expect(row.rows[0].seu_numero).toBe(await boletoSeuNumero(ids.contratoCordial, "2026-11", row.rows[0].ocorrencia));
    expect(row.rows[0].id_titulo_empresa).toBe(`${row.rows[0].seu_numero}202611`);
  });
  it("produção desligada, conta de outra marca e transição inválida são recusadas", async () => {
    await expect(prepare(ids.contratoCordial, prodCordial)).rejects.toThrow("production issuance disabled");
    await expect(prepare(ids.contratoMorar, sandboxCordial)).rejects.toThrow("contract brand mismatch");
    const id = (await prepare(ids.contratoCordial, sandboxCordial)).rows[0].out_id;
    await expect(db.query("update rental_boletos set estado='registrado' where id=$1", [id])).rejects.toThrow();
  });
  it("liberar produção sem teste de conexão é impossível no banco", async () => {
    await expect(
      db.query("update billing_accounts set emissao_habilitada=true where id=$1", [prodCordial]),
    ).rejects.toThrow("billing_accounts_release_requires_test");
  });
  it("snapshot é imutável e boleto nunca é apagado", async () => {
    const id = (await prepare(ids.contratoCordial, sandboxCordial)).rows[0].out_id;
    await expect(db.query("update rental_boletos set snapshot='{}'::jsonb where id=$1", [id])).rejects.toThrow("immutable");
    await expect(db.query("update rental_boletos set total_centavos=1 where id=$1", [id])).rejects.toThrow("immutable");
    await expect(db.query("delete from rental_boletos where id=$1", [id])).rejects.toThrow("permanent");
  });
  it("rejeitado libera nova ocorrência com outro seuNumero", async () => {
    const first = (await prepare(ids.contratoCordial, sandboxCordial, "2026-10")).rows[0].out_id;
    await db.query("select * from rental_boleto_transition($1, array['preparando'], 'rejeitado', '{}'::jsonb, $2)", [first, ids.admin]);
    const second = (await prepare(ids.contratoCordial, sandboxCordial, "2026-10")).rows[0];
    expect(second.out_created).toBe(true);
    const rows = await db.query<{ ocorrencia: number; seu_numero: string }>(
      "select ocorrencia, seu_numero from rental_boletos where contract_id=$1 and competencia='2026-10' order by ocorrencia",
      [ids.contratoCordial],
    );
    expect(rows.rows.map((r) => r.ocorrencia)).toEqual([1, 2]);
    expect(rows.rows[0].seu_numero).not.toBe(rows.rows[1].seu_numero);
  });
});

describe("banco: permissões", () => {
  it("navegador (authenticated/anon) não grava boleto nem chama as funções do servidor", async () => {
    await asUser(db, ids.admin, async () => {
      await expect(prepare(ids.contratoCordial, sandboxCordial)).rejects.toThrow("permission denied");
      await expect(
        db.query("insert into rental_boletos(contract_id,account_id,brand,ambiente,competencia,ocorrencia,seu_numero,id_titulo_empresa,snapshot,total_centavos,vencimento,created_by) values ($1,$2,'cordial','sandbox','2026-12',1,'AAAAAAAAAA','A','{}',1,'2026-12-10',$3)", [ids.contratoCordial, sandboxCordial, ids.admin]),
      ).rejects.toThrow("permission denied");
      await expect(db.query("update billing_accounts set apelido='x'")).rejects.toThrow("permission denied");
    });
    await asUser(db, null, async () => {
      await expect(db.query("select * from rental_boletos")).rejects.toThrow("permission denied");
      await expect(db.query("select * from rental_emissions")).rejects.toThrow("permission denied");
    });
  });
  it("só o responsável do contrato e o admin leem; outro usuário, revisor e visualizador não", async () => {
    const count = async (u: string) =>
      asUser(db, u, async () => (await db.query<{ n: number }>("select count(*)::int n from rental_boletos")).rows[0].n);
    expect(await count(ids.admin)).toBeGreaterThan(0);
    expect(await count(ids.corretor)).toBeGreaterThan(0);
    expect(await count(ids.outro)).toBe(0);
    expect(await count(ids.reviewer)).toBe(0);
    expect(await count(ids.viewer)).toBe(0);
    const acc = async (u: string) =>
      asUser(db, u, async () => (await db.query<{ n: number }>("select count(*)::int n from billing_accounts")).rows[0].n);
    expect(await acc(ids.admin)).toBe(2);
    expect(await acc(ids.secretaria)).toBe(0);
    expect(await acc(ids.reviewer)).toBe(0);
  });
  it("boleto pelo navegador em rental_emissions é negado; recibo continua permitido", async () => {
    await asUser(db, ids.corretor, async () => {
      await expect(
        db.query("insert into rental_emissions(contract_id,tipo,created_by) values ($1,'boleto',$2)", [ids.contratoCordial, ids.corretor]),
      ).rejects.toThrow("row-level security");
      const ok = await db.query<{ id: string }>(
        "insert into rental_emissions(contract_id,tipo,created_by) values ($1,'recibo',$2) returning id",
        [ids.contratoCordial, ids.corretor],
      );
      expect(ok.rows).toHaveLength(1);
    });
    await db.query("insert into rental_emissions(contract_id,tipo,created_by) values ($1,'boleto',$2)", [ids.contratoCordial, ids.admin]);
    await asUser(db, ids.corretor, async () => {
      const del = await db.query("delete from rental_emissions where tipo='boleto' returning id");
      expect(del.rows).toHaveLength(0);
      const upd = await db.query("update rental_emissions set status='erro' where tipo='boleto' returning id");
      expect(upd.rows).toHaveLength(0);
    });
  });
  it("todas as tabelas novas têm os bloqueios restritivos", async () => {
    const r = await db.query<{ tablename: string; n: number }>(
      "select tablename, count(*)::int n from pg_policies where permissive='RESTRICTIVE' and policyname in ('meta_reviewer_block','atendimentos_viewer_block') group by 1 order by 1",
    );
    expect(r.rows).toEqual([
      { tablename: "billing_account_events", n: 2 },
      { tablename: "billing_accounts", n: 2 },
      { tablename: "rental_boleto_events", n: 2 },
      { tablename: "rental_boletos", n: 2 },
    ]);
  });
});
