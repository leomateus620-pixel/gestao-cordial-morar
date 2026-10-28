import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import {
  admin,
  broker,
  mixed,
  reviewer,
  secretary,
  createAuthorizationFixture,
} from "./authorization-fixture";
const read = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");
let db: PGlite;
const property = randomUUID();
let originalAcl: unknown;
before(async () => {
  db = await createAuthorizationFixture();
  await db.exec(`
   ALTER TABLE profiles ADD email varchar(255), ADD iniciais varchar(20), ADD cargo text, ADD is_internal boolean DEFAULT false;
   UPDATE profiles SET email='private@example.invalid',iniciais='TS',cargo='Corretor';
   CREATE TABLE property_history(id uuid DEFAULT gen_random_uuid(),property_id uuid,actor_name text,actor_kind text,category text,title text,summary text,changes jsonb,created_at timestamptz DEFAULT now());
   REVOKE ALL ON property_history FROM authenticated;
   CREATE FUNCTION phone_key(_v text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT nullif(regexp_replace(_v,'[^0-9]','','g'),'') $$;
  `);
  const history = await read("drizzle/migrations/0037_property_history.sql");
  await db.exec(
    history.slice(history.indexOf("CREATE OR REPLACE FUNCTION public.property_history_list(")),
  );
  await db.exec(
    await read("supabase/migrations/20260811104720_508bb79e-bb47-4919-962a-ea77949d8fcb.sql"),
  );
  await db.exec(
    await read("supabase/migrations/20260928200122_74280060-932c-4e5a-8904-d09eeb4492a7.sql"),
  );
  await db.query(
    "INSERT INTO property_history(property_id,actor_name,actor_kind,category,title,changes) VALUES($1,'Owner','user','dados_privados','Private','[{\"field\":\"proprietario_email\",\"to\":\"owner@example.invalid\",\"sensitive\":true}]')",
    [property],
  );
  await db.query(
    "INSERT INTO clients(created_by,full_name,email) VALUES($1,'PRIVATE CLIENT','client@example.invalid')",
    [admin],
  );
  // Representative non-read RPC with a broad existing exception handler: the guard
  // must run outside that block. Its default and ACL must remain unchanged.
  await db.exec(`CREATE FUNCTION public.studio_project_approve(p_value text DEFAULT 'unchanged') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN RETURN jsonb_build_object('value',p_value); EXCEPTION WHEN OTHERS THEN RETURN '{"swallowed":true}'::jsonb; END $$;
    REVOKE ALL ON FUNCTION public.studio_project_approve(text) FROM PUBLIC,anon;
    GRANT EXECUTE ON FUNCTION public.studio_project_approve(text) TO authenticated,service_role;
    CREATE FUNCTION public.agenda_can_access(p_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT p_id IS NOT NULL $$;
    CREATE FUNCTION public.get_my_notification_summary() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ WITH q AS (SELECT 1 AS n) SELECT jsonb_build_object('count',n) FROM q $$;
  `);
  originalAcl = (
    await db.query(
      "SELECT proacl,proargdefaults::text defaults,proowner,provolatile,prorettype,proargtypes FROM pg_proc WHERE oid='studio_project_approve(text)'::regprocedure",
    )
  ).rows;
  await db.exec(await read("drizzle/migrations/0055_meta_reviewer_rpc_boundary.sql"));
});
after(async () => db?.close());
async function as<T>(id: string, action: () => Promise<T>, role = "authenticated") {
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec(`SET ROLE ${role}`);
  try {
    return await action();
  } finally {
    await db.exec("RESET ROLE");
  }
}
test("reviewer dominates every combined role in shared role checks", async () => {
  for (const id of [reviewer, mixed])
    await as(id, async () => {
      for (const role of ["admin", "secretaria", "financeiro", "corretor"])
        assert.equal(
          (
            await db.query<{ allowed: boolean }>("SELECT has_role($1,$2::app_role) allowed", [
              id,
              role,
            ])
          ).rows[0].allowed,
          false,
        );
      assert.equal(
        (await db.query<{ allowed: boolean }>("SELECT has_role($1,'meta_reviewer') allowed", [id]))
          .rows[0].allowed,
        true,
      );
    });
  await as(admin, async () =>
    assert.equal(
      (await db.query<{ allowed: boolean }>("SELECT has_role($1,'admin') allowed", [admin])).rows[0]
        .allowed,
      true,
    ),
  );
});
test("real property history RPC blocks mixed reviewer; staff masking stays unchanged", async () => {
  for (const id of [reviewer, mixed])
    await as(id, async () => {
      await assert.rejects(db.query("SELECT * FROM property_history_list($1)", [property]), {
        code: "42501",
      });
    });
  for (const id of [admin, secretary])
    await as(id, async () => {
      const result = await db.query<{ changes: unknown; private_hidden: boolean }>(
        "SELECT * FROM property_history_list($1)",
        [property],
      );
      assert.equal(result.rows[0].private_hidden, false);
      assert.match(JSON.stringify(result.rows[0].changes), /owner@example.invalid/);
    });
  await as(broker, async () => {
    const result = await db.query<{ changes: unknown; private_hidden: boolean }>(
      "SELECT * FROM property_history_list($1)",
      [property],
    );
    assert.equal(result.rows[0].private_hidden, true);
    assert.ok(!JSON.stringify(result.rows[0].changes).includes("owner@example.invalid"));
  });
});
test("uid-only contact lookup and SQL broker list cannot bypass reviewer RLS", async () => {
  for (const id of [reviewer, mixed])
    await as(id, async () => {
      await assert.rejects(
        db.query(
          "SELECT * FROM find_attendance_contact_matches(null,'client@example.invalid',null)",
        ),
        { code: "42501" },
      );
      await assert.rejects(db.query("SELECT * FROM list_corretores()"), { code: "42501" });
    });
  await as(secretary, async () => {
    assert.equal(
      (
        await db.query(
          "SELECT * FROM find_attendance_contact_matches(null,'client@example.invalid',null)",
        )
      ).rows.length,
      1,
    );
    assert.ok((await db.query("SELECT * FROM list_corretores()")).rows.length > 0);
  });
});
test("SQL scalar/CTE returns and grants/defaults survive; guard cannot be swallowed", async () => {
  await as(mixed, async () => {
    for (const statement of [
      "SELECT studio_project_approve()",
      "SELECT agenda_can_access(gen_random_uuid())",
      "SELECT get_my_notification_summary()",
    ])
      await assert.rejects(db.query(statement), { code: "42501" });
  });
  await as(admin, async () => {
    assert.deepEqual(
      (await db.query<{ v: unknown }>("SELECT studio_project_approve() v")).rows[0].v,
      { value: "unchanged" },
    );
    assert.equal(
      (await db.query<{ v: boolean }>("SELECT agenda_can_access(gen_random_uuid()) v")).rows[0].v,
      true,
    );
    assert.deepEqual(
      (await db.query<{ v: unknown }>("SELECT get_my_notification_summary() v")).rows[0].v,
      { count: 1 },
    );
  });
  assert.deepEqual(
    (
      await db.query(
        "SELECT proacl,proargdefaults::text defaults,proowner,provolatile,prorettype,proargtypes FROM pg_proc WHERE oid='studio_project_approve(text)'::regprocedure",
      )
    ).rows,
    originalAcl,
  );
  await as(
    "",
    async () =>
      assert.deepEqual(
        (await db.query<{ v: unknown }>("SELECT studio_project_approve() v")).rows[0].v,
        { value: "unchanged" },
      ),
    "service_role",
  );
});
test("nested source has exactly one terminator for both END and END-semicolon bodies", async () => {
  // property_history_list/contact lookup use END; while studio_project_approve uses END.
  // PGlite accepts an empty semicolon statement that production PostgreSQL rejects,
  // so verify the generated source as well as executing each real function above.
  const result = await db.query<{ proname: string; prosrc: string }>(
    "SELECT proname,prosrc FROM pg_proc WHERE proname IN ('property_history_list','find_attendance_contact_matches','studio_project_approve')",
  );
  assert.equal(result.rows.length, 3);
  for (const row of result.rows) {
    assert.doesNotMatch(row.prosrc, /;\s*;/, row.proname);
    assert.match(row.prosrc, /END\s*;\s*END\s*;\s*$/i, row.proname);
  }
});
test("sanitized Marketing reads remain available and migration is guard-idempotent", async () => {
  await as(mixed, async () => {
    const result = await db.query<{ v: { financial_visible: boolean; items: unknown[] } }>(
      "SELECT marketing_campaigns_safe() v",
    );
    assert.equal(result.rows[0].v.financial_visible, false);
    assert.equal(result.rows[0].v.items.length, 1);
    assert.ok(!JSON.stringify(result.rows).includes("Private"));
  });
  await db.exec(await read("drizzle/migrations/0055_meta_reviewer_rpc_boundary.sql"));
  await as(
    mixed,
    async () =>
      await assert.rejects(db.query("SELECT studio_project_approve()"), { code: "42501" }),
  );
});
