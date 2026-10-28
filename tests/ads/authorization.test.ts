import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

import {
  createAuthorizationFixture,
  admin,
  secretary,
  broker,
  reviewer,
  mixed,
} from "./authorization-fixture";
let db: PGlite;
before(async () => {
  db = await createAuthorizationFixture();
});
after(async () => db?.close());
async function as<T>(id: string, action: () => Promise<T>) {
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("SET ROLE authenticated");
  try {
    return await action();
  } finally {
    await db.exec("RESET ROLE");
  }
}
test("SQL reviewer deny wins over every combined role; scope remains exact", async () => {
  for (const id of [reviewer, mixed])
    await as(id, async () => {
      for (const action of [
        "read_lead_contacts",
        "manage_leads",
        "create_draft",
        "send_paused",
        "change_budget",
        "set_delivery",
        "financial_report",
        "generate_report",
        "manage_connection",
        "manage_manual",
      ]) {
        const r = await db.query<{ allowed: boolean }>(
          "SELECT marketing_can_act($1,'cordial') allowed",
          [action],
        );
        assert.equal(r.rows[0].allowed, false, action);
      }
      const cordial = await db.query<{ allowed: boolean }>(
        "SELECT marketing_can_read('cordial') allowed",
      );
      assert.equal(cordial.rows[0].allowed, true);
      const morar = await db.query<{ allowed: boolean }>(
        "SELECT marketing_can_read('morar') allowed",
      );
      assert.equal(morar.rows[0].allowed, false);
      const mutation = await db.query<{ allowed: boolean }>(
        "SELECT marketing_can_operate('cordial') allowed",
      );
      assert.equal(mutation.rows[0].allowed, false);
    });
});
test("reviewer RPC sanitizes metadata and financial information even with administrator role", async () => {
  await as(mixed, async () => {
    const result = await db.query<{
      value: { items: Array<Record<string, unknown>>; total: number; financial_visible: boolean };
    }>("SELECT marketing_campaigns_safe() value");
    assert.equal(result.rows[0].value.total, 1);
    assert.equal(result.rows[0].value.financial_visible, false);
    const item = result.rows[0].value.items[0];
    assert.equal(item.investimento, null);
    assert.equal(item.user_id, null);
    assert.equal(item.responsavel, null);
    assert.equal(item.observacoes, null);
    assert.equal(item.referencia_url, null);
    assert.match(item.nome as string, /^Campanha Meta/);
    assert.ok(!JSON.stringify(result).includes("Private"));
  });
});
test("actual authenticated role cannot read contacts/tokens/raw money or invoke service RPCs", async () => {
  for (const id of [reviewer, mixed, secretary, broker])
    await as(id, async () => {
      for (const table of [
        "meta_lead_submissions",
        "meta_lead_form_mappings",
        "ad_platform_connections",
        "marketing_daily_metrics",
      ])
        await assert.rejects(db.query(`SELECT * FROM ${table}`), /permission denied/);
      await assert.rejects(
        db.query("SELECT marketing_actor_can_act($1,'manage_connection','cordial')", [admin]),
        /permission denied/,
      );
      await assert.rejects(
        db.query("SELECT meta_lead_assign($1,$2,$3)", [randomUUID(), broker, admin]),
        /permission denied/,
      );
    });
});
test("restrictive RLS blocks broad policies and self-role writes on mixed reviewer", async () => {
  await as(mixed, async () => {
    assert.equal((await db.query("SELECT * FROM private_test")).rows.length, 0);
    assert.equal((await db.query("SELECT * FROM profiles")).rows.length, 1);
    assert.equal((await db.query("SELECT * FROM user_roles")).rows.length, 3);
    await assert.rejects(
      db.query("INSERT INTO user_roles VALUES($1,'financeiro')", [mixed]),
      /row-level security/,
    );
    await assert.rejects(
      db.query("UPDATE profiles SET nome='Changed' WHERE id=$1", [mixed]),
      /row-level security/,
    );
    assert.equal(
      (await db.query("DELETE FROM profiles WHERE id=$1 RETURNING id", [mixed])).rows.length,
      0,
    );
    assert.equal(
      (await db.query("DELETE FROM user_roles WHERE user_id=$1 RETURNING user_id", [mixed])).rows
        .length,
      0,
    );
  });
});
test("secretary operational scope is isolated and financial reporting stays admin-only", async () => {
  await as(secretary, async () => {
    const result = await db.query<{
      allowed: boolean;
      cross: boolean;
      financial: boolean;
      report: boolean;
    }>(
      "SELECT marketing_can_act('manage_leads','cordial') allowed,marketing_can_act('manage_leads','morar') cross,marketing_can_act('financial_report','cordial') financial,marketing_can_act('generate_report','cordial') report",
    );
    assert.deepEqual(result.rows[0], {
      allowed: true,
      cross: false,
      financial: false,
      report: true,
    });
  });
  await as(broker, async () => {
    await assert.rejects(db.query("SELECT marketing_campaigns_safe()"), /Sem permissão/);
  });
  await as(admin, async () =>
    assert.equal(
      (
        await db.query<{ allowed: boolean }>(
          "SELECT marketing_can_act('send_paused','morar') allowed",
        )
      ).rows[0].allowed,
      true,
    ),
  );
});
