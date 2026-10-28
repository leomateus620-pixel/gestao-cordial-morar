import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
export const admin = randomUUID(),
  secretary = randomUUID(),
  broker = randomUUID(),
  reviewer = randomUUID(),
  mixed = randomUUID();

const sql = async (path: string) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");
export async function createAuthorizationFixture() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TYPE app_role AS ENUM('admin','secretaria','corretor','financeiro','meta_reviewer');
    CREATE TABLE user_roles(user_id uuid,role app_role); CREATE TABLE user_agencies(user_id uuid,agency text); CREATE TABLE profiles(id uuid PRIMARY KEY,nome text);
    CREATE FUNCTION has_role(_user_id uuid,_role app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=_user_id AND role=_role) $$;
    CREATE FUNCTION has_notification_agency_access(_user_id uuid,_agency text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM user_agencies WHERE user_id=_user_id AND agency=_agency) $$;
    CREATE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=now();RETURN NEW;END $$;
    CREATE FUNCTION _try_uuid(v text) RETURNS uuid LANGUAGE plpgsql IMMUTABLE AS $$ BEGIN RETURN v::uuid;EXCEPTION WHEN OTHERS THEN RETURN NULL;END $$;
    CREATE TABLE properties(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),carteira text DEFAULT 'cordial',publish_targets text[] DEFAULT '{}');
    CREATE TABLE app_settings(key text PRIMARY KEY,value jsonb);
    CREATE TABLE private_test(id integer PRIMARY KEY,note text); INSERT INTO private_test VALUES(1,'private owner data');
    ALTER TABLE private_test ENABLE ROW LEVEL SECURITY; CREATE POLICY staff_read ON private_test FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT ALL ON private_test TO authenticated;
    ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY; CREATE POLICY existing_admin ON user_roles FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT ALL ON user_roles TO authenticated;
    ALTER TABLE profiles ENABLE ROW LEVEL SECURITY; CREATE POLICY existing_profiles ON profiles FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT ALL ON profiles TO authenticated;
    ALTER TABLE user_agencies ENABLE ROW LEVEL SECURITY; CREATE POLICY existing_agencies ON user_agencies FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT ALL ON user_agencies TO authenticated;
  `);
  for (const path of [
    "supabase/migrations/20260623164154_300122c8-e893-41e9-b156-8d3957f43d39.sql",
    "supabase/migrations/20260623165615_33d18d7c-c7f7-4d96-af7c-886e9e298b5c.sql",
    "supabase/migrations/20260706130707_383a3dde-77b5-4274-8f4c-b7da25f2118b.sql",
  ]) {
    let source = await sql(path);
    if (path.includes("20260706130707"))
      source = source.slice(
        source.indexOf("-- ---------- marketing_campaigns"),
        source.indexOf("-- ---------- Auxiliary indexes"),
      );
    await db.exec(source);
  }
  await db.exec(
    "ALTER TABLE attendances ADD COLUMN fonte_prospeccao text,ADD COLUMN pipeline_stage text,ADD COLUMN imovel_ref text,ADD COLUMN interesse_descricao text;",
  );
  await db.exec(await sql("drizzle/migrations/0009_marketing_ads_connectors.sql"));
  await db.exec(await sql("drizzle/migrations/0039_meta_ads_leadgen.sql"));
  await db.exec(await sql("drizzle/migrations/0042_meta_reviewer_role.sql"));
  await db.exec(await sql("drizzle/migrations/0047_meta_action_authorization.sql"));
  for (const [id, roles, agency] of [
    [admin, ["admin"], "cordial"],
    [secretary, ["secretaria"], "cordial"],
    [broker, ["corretor"], "cordial"],
    [reviewer, ["meta_reviewer"], "cordial"],
    [mixed, ["meta_reviewer", "admin", "secretaria"], "cordial"],
  ] as const) {
    await db.query("INSERT INTO auth.users VALUES($1)", [id]);
    await db.query("INSERT INTO profiles VALUES($1,$2)", [id, roles.join(",")]);
    for (const role of roles)
      await db.query("INSERT INTO user_roles VALUES($1,$2::app_role)", [id, role]);
    await db.query("INSERT INTO user_agencies VALUES($1,$2)", [id, agency]);
  }
  for (const agency of ["cordial", "morar"])
    await db.query(
      "INSERT INTO marketing_campaigns(user_id,imobiliaria,nome,canal,objetivo,data_inicio,data_fim,investimento,platform,responsavel,observacoes,referencia_url) VALUES($1,$2,'Private campaign name','Facebook','Leads','2026-10-01','2026-10-31',99123,'meta','Private owner','Private note','https://private.example')",
      [admin, agency],
    );
  return db;
}
