import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const userA = "10000000-0000-4000-8000-000000000001";
const userB = "10000000-0000-4000-8000-000000000002";
const admin = "10000000-0000-4000-8000-000000000003";
const conversationA = "20000000-0000-4000-8000-000000000001";
const conversationB = "20000000-0000-4000-8000-000000000002";
test("actual assistant migration enforces ownership, immutable browser records and atomic Brasília quota", async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY);
      CREATE TABLE public.user_roles (user_id uuid, role text);
      CREATE TABLE public.user_agencies (user_id uuid, agency text);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      CREATE FUNCTION public.has_role(uuid, text) RETURNS boolean LANGUAGE sql STABLE AS
        $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=$1 AND role=$2) $$;
      GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
      GRANT SELECT ON public.user_roles, public.user_agencies TO authenticated, service_role;
      INSERT INTO auth.users VALUES ('${userA}'), ('${userB}'), ('${admin}');
      INSERT INTO user_roles VALUES ('${userA}','corretor'), ('${userB}','corretor'), ('${admin}','admin');
      INSERT INTO user_agencies VALUES ('${userA}','cordial'), ('${userB}','morar'), ('${admin}','cordial'), ('${admin}','morar');
    `);
    await db.exec(
      await readFile(
        new URL("../../drizzle/migrations/0013_assistant_foundation.sql", import.meta.url),
        "utf8",
      ),
    );
    await db.exec(`
      SET ROLE service_role;
      INSERT INTO assistant_conversations (id,user_id,bot_id,scope_key,title) VALUES
        ('${conversationA}','${userA}','agenda','corretor:cordial','Agenda teste A'), ('${conversationB}','${userB}','match','corretor:morar','Match teste B');
      INSERT INTO assistant_messages (conversation_id,user_id,role,content) VALUES
        ('${conversationA}','${userA}','assistant','Os resultados desta conversa foram atualizados conforme seu acesso atual.'), ('${conversationB}','${userB}','user','Pedido de teste B');
      INSERT INTO assistant_audit (user_id,conversation_id,bot_id,scope_key,tool) VALUES
        ('${userA}','${conversationA}','agenda','corretor:cordial','agenda_today'), ('${userB}','${conversationB}','match','corretor:morar','search_properties');
      RESET ROLE;
    `);
    const assume = async (userId: string) =>
      db.exec(
        `RESET ROLE; SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${userId}',false);`,
      );

    await t.test("each user sees only their conversations, messages and audit", async () => {
      for (const userId of [userA, userB]) {
        await assume(userId);
        for (const table of ["assistant_conversations", "assistant_messages", "assistant_audit"]) {
          const data = await db.query<{ user_id: string }>(`SELECT user_id FROM ${table}`);
          assert.deepEqual(
            data.rows.map((row) => row.user_id),
            [userId],
          );
        }
      }
    });
    await t.test(
      "admin can read all, but cannot forge or edit any persisted assistant response/audit",
      async () => {
        await assume(admin);
        for (const table of ["assistant_conversations", "assistant_messages", "assistant_audit"]) {
          const result = await db.query(`SELECT * FROM ${table}`);
          assert.equal(result.rows.length, 2);
          await assert.rejects(
            () => db.exec(`UPDATE ${table} SET user_id = '${admin}'`),
            /permission denied/,
          );
          await assert.rejects(() => db.exec(`DELETE FROM ${table}`), /permission denied/);
        }
        await assert.rejects(
          () =>
            db.exec(
              `INSERT INTO assistant_audit (user_id,bot_id,tool) VALUES ('${admin}','agenda','fake')`,
            ),
          /permission denied/,
        );
      },
    );
    await t.test(
      "authenticated owners cannot forge messages, alter quota or consume another user's quota",
      async () => {
        await assume(userA);
        await assert.rejects(
          () =>
            db.exec(
              `INSERT INTO assistant_messages(conversation_id,user_id,role,content) VALUES ('${conversationA}','${userA}','assistant','forged')`,
            ),
          /permission denied/,
        );
        await assert.rejects(
          () => db.exec(`UPDATE assistant_daily_usage SET turns = 0`),
          /permission denied/,
        );
        await assert.rejects(
          () => db.exec(`SELECT assistant_take_daily_quota('${userB}',10)`),
          /permission denied/,
        );
      },
    );
    await t.test(
      "server persistence cannot associate a message/audit with a different owner",
      async () => {
        await db.exec("RESET ROLE; SET ROLE service_role;");
        await assert.rejects(
          () =>
            db.exec(
              `INSERT INTO assistant_messages(conversation_id,user_id,role,content) VALUES ('${conversationA}','${userB}','assistant','Os resultados desta conversa foram atualizados conforme seu acesso atual.')`,
            ),
          /foreign key/,
        );
        await assert.rejects(
          () =>
            db.exec(
              `INSERT INTO assistant_audit(conversation_id,user_id,bot_id,scope_key,tool) VALUES ('${conversationA}','${userB}','agenda','corretor:morar','wrong-owner')`,
            ),
          /foreign key/,
        );
      },
    );
    await t.test(
      "role or agency changes hide old conversations, messages and audit even through direct SQL",
      async () => {
        for (const change of [
          `UPDATE user_roles SET role='secretaria' WHERE user_id='${userA}'`,
          `UPDATE user_agencies SET agency='morar' WHERE user_id='${userA}'`,
        ]) {
          await db.exec(`RESET ROLE; ${change}`);
          await assume(userA);
          for (const table of [
            "assistant_conversations",
            "assistant_messages",
            "assistant_audit",
          ]) {
            const result = await db.query(`SELECT * FROM ${table}`);
            assert.equal(result.rows.length, 0);
          }
          await db.exec(
            `RESET ROLE; UPDATE user_roles SET role='corretor' WHERE user_id='${userA}'; UPDATE user_agencies SET agency='cordial' WHERE user_id='${userA}';`,
          );
        }
      },
    );
    await t.test(
      "assistant model prose is never accepted as a persisted business snapshot",
      async () => {
        await db.exec("RESET ROLE; SET ROLE service_role;");
        await assert.rejects(
          () =>
            db.exec(
              `INSERT INTO assistant_messages(conversation_id,user_id,role,content) VALUES ('${conversationA}','${userA}','assistant','Nome privado e valores de um resultado antigo')`,
            ),
          /check constraint/,
        );
      },
    );
    await t.test("parallel quota calls stop exactly at the daily limit", async () => {
      await db.exec("RESET ROLE; SET ROLE service_role;");
      const responses = await Promise.all(
        Array.from({ length: 12 }, () =>
          db.query<{ allowed: boolean }>(
            `SELECT assistant_take_daily_quota('${userA}',5) AS allowed`,
          ),
        ),
      );
      assert.equal(responses.filter((r) => r.rows[0].allowed).length, 5);
      const counter = await db.query<{ turns: number }>("SELECT turns FROM assistant_daily_usage");
      assert.equal(counter.rows[0].turns, 5);
    });
    await t.test("quota uses São Paulo day regardless of database session time zone", async () => {
      await db.exec("RESET ROLE; SET ROLE service_role; SET TIME ZONE 'Pacific/Auckland';");
      await db.query(`SELECT assistant_take_daily_quota('${userB}',5)`);
      const dates = await db.query<{ actual: string; expected: string }>(
        `SELECT usage_day::text AS actual, (now() AT TIME ZONE 'America/Sao_Paulo')::date::text AS expected FROM assistant_daily_usage WHERE user_id='${userB}'`,
      );
      assert.equal(dates.rows[0].actual, dates.rows[0].expected);
      const boundary = await db.query<{ before: string; after: string }>(
        `SELECT ('2026-10-17T02:59:59Z'::timestamptz AT TIME ZONE 'America/Sao_Paulo')::date::text AS before, ('2026-10-17T03:00:00Z'::timestamptz AT TIME ZONE 'America/Sao_Paulo')::date::text AS after`,
      );
      assert.deepEqual(boundary.rows[0], { before: "2026-10-16", after: "2026-10-17" });
    });
    await t.test("anonymous callers cannot read assistant content", async () => {
      await db.exec("RESET ROLE; SET ROLE anon;");
      for (const table of [
        "assistant_conversations",
        "assistant_messages",
        "assistant_audit",
        "assistant_daily_usage",
      ])
        await assert.rejects(() => db.exec(`SELECT * FROM ${table}`), /permission denied/);
    });
  } finally {
    await db.close();
  }
});
