import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { installAudienceAccess } from "./access-fixture";

test("site audience is read-only and brand-scoped for each effective profile", async () => {
  const db = new PGlite();
  const brands = ["cordial", "morar"];
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE FUNCTION public.is_meta_reviewer() RETURNS boolean LANGUAGE sql AS 'SELECT false';
      CREATE FUNCTION public.is_atendimentos_viewer() RETURNS boolean LANGUAGE sql AS 'SELECT false';
      CREATE TABLE public.cordial_site_eligible(public_id uuid PRIMARY KEY);
      CREATE TABLE public.morar_site_eligible(public_id uuid PRIMARY KEY);
    `);
    await db.exec(
      await readFile(
        new URL("../../drizzle/migrations/0116_site_audience.sql", import.meta.url),
        "utf8",
      ),
    );
    await installAudienceAccess(db);
    for (const brand of brands)
      await db.query("SELECT public.site_audience_configure($1,'qa','test',true)", [brand]);

    async function verify(roles: string[], agencies: string[], expected: string[]) {
      const user = randomUUID();
      for (const role of roles)
        await db.query("INSERT INTO public.user_roles VALUES ($1,$2)", [user, role]);
      for (const agency of agencies)
        await db.query("INSERT INTO public.user_agencies VALUES ($1,$2)", [user, agency]);
      await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [user]);
      await db.exec("SET ROLE authenticated");
      const { rows } = await db.query("SELECT public.site_audience_allowed_brands() AS brands");
      assert.deepEqual(rows[0].brands, expected);
      await db.exec("RESET ROLE; SET ROLE service_role");
      for (const brand of brands) {
        for (const view of ["overview", "origins", "pages"]) {
          // Same statement timestamp for both reports, so the permitted payload must match exactly.
          const { rows } = await db.query(
            `SELECT
            public.site_audience_report_for_user($1,$2,'qa','week',0,$3,'test') AS scoped,
            public.site_audience_report($2,'qa','week',0,$3,'test') AS original`,
            [user, brand, view],
          );
          assert.deepEqual(
            rows[0].scoped,
            expected.includes(brand) ? rows[0].original : { status: "unauthorized" },
          );
        }
      }
      await db.exec("RESET ROLE");
    }
    for (const role of ["corretor", "secretaria"]) {
      for (const agencies of [[], ["cordial"], ["morar"], brands])
        await verify([role], agencies, agencies);
    }
    await verify(["admin"], [], brands);
    await verify(["admin", "financeiro"], [], brands);
    await verify([], brands, []);
    await verify(["financeiro", "corretor"], brands, []);
    for (const restricted of ["meta_reviewer", "atendimentos_viewer"])
      await verify([restricted, "admin", "secretaria", "corretor"], brands, []);

    for (const role of ["authenticated", "anon"]) {
      await db.exec("SET ROLE " + role);
      for (const sql of [
        "SELECT * FROM site_audience.events",
        "SELECT public.site_audience_report('cordial','qa','day',0,'overview','test')",
        "SELECT public.site_audience_report_for_user(NULL,'cordial','qa','day',0,'overview','test')",
        "SELECT public.site_audience_configure('cordial','qa','test',false)",
        ...(role === "anon" ? ["SELECT public.site_audience_allowed_brands()"] : []),
      ])
        await assert.rejects(db.exec(sql), { code: "42501" });
      await db.exec("RESET ROLE");
    }
  } finally {
    await db.close();
  }
});
