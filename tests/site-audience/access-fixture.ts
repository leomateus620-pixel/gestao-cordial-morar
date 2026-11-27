import { readFile } from "node:fs/promises";
import type { PGlite } from "@electric-sql/pglite";

// Stand-ins for Supabase Auth and the two base tables, using the deployed role/agency rules.
export async function installAudienceAccess(db: PGlite) {
  await db.exec(`
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TYPE public.app_role AS ENUM ('admin','financeiro','secretaria','corretor','meta_reviewer','atendimentos_viewer');
    CREATE TABLE public.user_roles (user_id uuid, role public.app_role);
    CREATE TABLE public.user_agencies (user_id uuid, agency text);
  `);
  for (const [file, name] of [
    ["drizzle/migrations/0091_atendimentos_viewer_boundary.sql", "has_role"],
    [
      "supabase/migrations/20260728034224_9d1c2eb8-19fa-473c-9eda-cdd9707505a7.sql",
      "has_notification_agency_access",
    ],
  ]) {
    const source = await readFile(new URL("../../" + file, import.meta.url), "utf8");
    const start = source.indexOf("CREATE OR REPLACE FUNCTION public." + name + "(");
    const end = source.indexOf("$$;", start);
    if (start < 0 || end < 0) throw new Error("Missing fixture dependency: " + name);
    await db.exec(source.slice(start, end + 3));
  }
  await db.exec(
    await readFile(
      new URL("../../drizzle/migrations/0121_site_audience_brand_access.sql", import.meta.url),
      "utf8",
    ),
  );
}
