import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
const admin = "00000000-0000-4000-8000-000000000001",
  reviewer = "00000000-0000-4000-8000-000000000002",
  secretary = "00000000-0000-4000-8000-000000000003",
  connection = "00000000-0000-4000-8000-000000000010",
  worker = "00000000-0000-4000-8000-000000000020";
const db = new PGlite();
async function save(actor = admin, agency = "cordial", pageId = "123") {
  return (
    await db.query<{ id: string; revision: number }>(
      "select * from meta_ad_draft_save(null,null,$1,$2,$3,$4)",
      [connection, agency, JSON.stringify({ pageId, name: "Synthetic draft" }), actor],
    )
  ).rows[0];
}
async function begin(draft: { id: string; revision: number }, actor = admin) {
  return (
    await db.query<{ id: string }>(
      "select * from meta_ad_command_begin($1,$2,'create_paused','{}',$3,$4)",
      [draft.id, draft.revision, `create:${draft.id}`, actor],
    )
  ).rows[0];
}
beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TABLE public.test_roles(user_id uuid,role text); INSERT INTO test_roles VALUES('${admin}','admin'),('${reviewer}','meta_reviewer'),('${reviewer}','admin'),('${secretary}','secretaria');
    CREATE FUNCTION public.has_role(id uuid,r text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM test_roles WHERE user_id=id AND role=r) $$;
    CREATE TABLE public.ad_platform_connections(id uuid PRIMARY KEY,imobiliaria text,platform text,external_account_id text,page_id text);
    INSERT INTO public.ad_platform_connections VALUES('${connection}','cordial','meta','act_99','123');`);
  await db.exec(
    readFileSync(
      new URL("../../../drizzle/migrations/0048_meta_ad_commands.sql", import.meta.url),
      "utf8",
    ),
  );
});
afterAll(() => db.close());
describe("command SQL using real PostgreSQL roles (local PGlite)", () => {
  it("reviewer dominance denies a combined admin+reviewer and secretaria cannot write financial drafts", async () => {
    await expect(save(reviewer)).rejects.toThrow("Meta action forbidden");
    await expect(save(secretary)).rejects.toThrow("Meta action forbidden");
    await expect(save(admin, "morar")).rejects.toThrow("Connection context mismatch");
    await expect(save(admin, "cordial", "999")).rejects.toThrow("Connection context mismatch");
  });
  it("authenticated role cannot bypass functions or read service-only command payloads", async () => {
    await db.exec("SET ROLE authenticated");
    try {
      await expect(db.query("SELECT * FROM meta_ad_drafts")).rejects.toThrow("permission denied");
      await expect(save(admin)).rejects.toThrow("permission denied");
    } finally {
      await db.exec("RESET ROLE");
    }
  });
  it("every new table carries an explicit restrictive reviewer policy", async () => {
    const policies = await db.query<{ tablename: string; permissive: string }>(
      "select tablename,permissive from pg_policies where policyname='meta_reviewer_block'",
    );
    expect(policies.rows).toHaveLength(4);
    expect(policies.rows.every((p) => p.permissive === "RESTRICTIVE")).toBe(true);
  });
  it("duplicate intent and claim are deduplicated, revision checks and fencing reject stale callers", async () => {
    const draft = await save();
    const command = await begin(draft);
    expect((await begin(draft)).id).toBe(command.id);
    const first = await db.query<{ fence: number }>(
      "select * from meta_ad_command_claim($1,$2,$3)",
      [command.id, worker, admin],
    );
    expect(first.rows).toHaveLength(1);
    expect(
      (await db.query("select * from meta_ad_command_claim($1,$2,$3)", [command.id, worker, admin]))
        .rows,
    ).toHaveLength(0);
    await expect(
      db.query("select meta_ad_command_step($1,$2,99,'campaign','{\"state\":\"sending\"}',$3)", [
        command.id,
        worker,
        admin,
      ]),
    ).rejects.toThrow("Stale command lease");
    await expect(
      db.query("select * from meta_ad_draft_save($1,1,$2,'cordial','{\"pageId\":\"123\"}',$3)", [
        draft.id,
        connection,
        admin,
      ]),
    ).rejects.toThrow("Draft revision or scope conflict");
    await db.query(
      "select meta_ad_command_step($1,$2,$3,'campaign','{\"state\":\"sending\"}',$4)",
      [command.id, worker, first.rows[0].fence, admin],
    );
    await db.query(
      "update meta_ad_commands set lease_until=now()-interval '1 second' where id=$1",
      [command.id],
    );
    expect(
      (await db.query("select * from meta_ad_command_claim($1,$2,$3)", [command.id, worker, admin]))
        .rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query<{ state: string }>("select state from meta_ad_commands where id=$1", [
          command.id,
        ])
      ).rows[0].state,
    ).toBe("uncertain");
  });
  it("cannot claim completion without every paused creation step or mutate confirmed IDs", async () => {
    const draft = await save();
    const command = await begin(draft);
    const claim = (
      await db.query<{ fence: number }>("select * from meta_ad_command_claim($1,$2,$3)", [
        command.id,
        worker,
        admin,
      ])
    ).rows[0];
    await expect(
      db.query("select meta_ad_command_finish($1,$2,$3,'done',null,$4)", [
        command.id,
        worker,
        claim.fence,
        admin,
      ]),
    ).rejects.toThrow("Incomplete command");
    await db.query(
      'select meta_ad_command_step($1,$2,$3,\'campaign\',\'{"state":"done","id":"901"}\',$4)',
      [command.id, worker, claim.fence, admin],
    );
    await expect(
      db.query("select meta_ad_command_step($1,$2,$3,'campaign','{\"state\":\"sending\"}',$4)", [
        command.id,
        worker,
        claim.fence,
        admin,
      ]),
    ).rejects.toThrow("Confirmed step immutable");
  });
});
