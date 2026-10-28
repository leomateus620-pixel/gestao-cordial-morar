import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { PGlite } from "@electric-sql/pglite";
import { createAuthorizationFixture, admin, secretary } from "./authorization-fixture";
const bianca = "b06a522f-65b4-4e2a-8bb4-e9e1f0675b75";
let db: PGlite;
const connections: Record<string, string> = {};
before(async () => {
  db = await createAuthorizationFixture();
  await db.query("INSERT INTO auth.users VALUES($1)", [bianca]);
  await db.query("INSERT INTO profiles VALUES($1,'Synthetic authorized secretary')", [bianca]);
  await db.query("INSERT INTO user_roles VALUES($1,'secretaria'),($1,'corretor')", [bianca]);
  await db.query("INSERT INTO user_agencies VALUES($1,'cordial'),($1,'morar')", [bianca]);
  for (const path of ["0048_meta_ad_commands.sql", "0054_meta_scoped_management_grants.sql"])
    await db.exec(
      await readFile(new URL(`../../drizzle/migrations/${path}`, import.meta.url), "utf8"),
    );
  for (const agency of ["cordial", "morar"])
    connections[agency] = (
      await db.query<{ id: string }>(
        "INSERT INTO ad_platform_connections(user_id,platform,imobiliaria,credential_mode,external_account_id,page_id) VALUES($1,'meta',$2,'system_user','123','456') RETURNING id",
        [admin, agency],
      )
    ).rows[0].id;
});
after(() => db?.close());
async function as<T>(actor: string, run: () => Promise<T>) {
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [actor]);
  await db.exec("SET ROLE authenticated");
  try {
    return await run();
  } finally {
    await db.exec("RESET ROLE");
    await db.query("SELECT set_config('request.jwt.claim.sub','',false)");
  }
}
const allowed = async (actor: string, action: string, agency = "cordial") =>
  (
    await db.query<{ v: boolean }>("SELECT marketing_actor_can_act($1,$2,$3) v", [
      actor,
      action,
      agency,
    ])
  ).rows[0].v;
const save = async (actor = bianca, agency = "cordial") =>
  (
    await db.query<{ id: string; revision: number }>(
      'SELECT * FROM meta_ad_draft_save(NULL,NULL,$1,$2,\'{"pageId":"456"}\', $3)',
      [connections[agency], agency, actor],
    )
  ).rows[0];
test("named grant permits Meta management in both assigned brands without finance or credentials", async () => {
  for (const agency of ["cordial", "morar"]) {
    for (const action of [
      "read_ad_budget",
      "create_draft",
      "send_paused",
      "change_budget",
      "set_delivery",
    ])
      assert.equal(await allowed(bianca, action, agency), true);
    for (const action of ["financial_report", "manage_connection"])
      assert.equal(await allowed(bianca, action, agency), false);
  }
  assert.equal(await allowed(secretary, "read_ad_budget"), false);
  assert.equal(await allowed(secretary, "send_paused"), false);
  await assert.rejects(save(secretary), /forbidden/);
  assert.ok((await save()).id);
  await as(bianca, async () => {
    const p = (
      await db.query<{ v: Record<string, Record<string, boolean>> }>(
        "SELECT marketing_action_permissions() v",
      )
    ).rows[0].v;
    assert.equal(p.cordial.send_paused, true);
    assert.equal(p.morar.financial_report, false);
    const c = await db.query("SELECT * FROM ad_connections_public()");
    assert.equal(c.rows.length, 2);
    assert.ok(c.rows.every((r) => !("access_token" in r) && !("credential_ref" in r)));
    await assert.rejects(db.query("SELECT * FROM marketing_action_grants"), /permission denied/);
    await assert.rejects(save(), /permission denied/);
  });
  await as(secretary, async () =>
    assert.equal((await db.query("SELECT * FROM ad_connections_public()")).rows.length, 0),
  );
});
test("each persisted command checks its exact action and rechecks revocation before claim", async () => {
  const draft = await save();
  await db.query(
    "DELETE FROM marketing_action_grants WHERE user_id=$1 AND imobiliaria='cordial' AND action='send_paused'",
    [bianca],
  );
  const begin = () =>
    db.query<{ id: string }>(
      "SELECT * FROM meta_ad_command_begin($1,1,'create_paused','{}',$2,$3)",
      [draft.id, `create:${draft.id}`, bianca],
    );
  await assert.rejects(begin(), /forbidden/);
  await db.query(
    "INSERT INTO marketing_action_grants(user_id,imobiliaria,action,reason) VALUES($1,'cordial','send_paused','test restoration')",
    [bianca],
  );
  const command = (await begin()).rows[0];
  await db.query("DELETE FROM user_agencies WHERE user_id=$1 AND agency='cordial'", [bianca]);
  assert.equal(await allowed(bianca, "send_paused"), false);
  await assert.rejects(
    db.query("SELECT * FROM meta_ad_command_claim($1,$2,$3)", [command.id, randomUUID(), bianca]),
    /forbidden/,
  );
  await db.query("INSERT INTO user_agencies VALUES($1,'cordial')", [bianca]);
});
test("reviewer role dominates explicit grants, including a combined admin", async () => {
  await db.query("INSERT INTO user_roles VALUES($1,'meta_reviewer'),($1,'admin')", [bianca]);
  for (const action of [
    "read_ad_budget",
    "create_draft",
    "send_paused",
    "change_budget",
    "set_delivery",
    "financial_report",
    "manage_connection",
  ])
    assert.equal(await allowed(bianca, action), false);
  await assert.rejects(save(), /forbidden/);
  await as(bianca, async () => {
    const p = (
      await db.query<{ v: Record<string, Record<string, boolean>> }>(
        "SELECT marketing_action_permissions() v",
      )
    ).rows[0].v;
    assert.equal(p.cordial.read_metrics, true);
    assert.equal(p.cordial.read_ad_budget, false);
  });
});
