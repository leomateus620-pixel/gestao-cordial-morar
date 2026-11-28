import { readFile } from "node:fs/promises";
import { inspectionDatabase, otherId, userId } from "../vistoria/database";
export async function rentalDatabase(t?: import("node:test").TestContext) {
  const db = await inspectionDatabase();
  t?.after(() => db.close());
  await db.exec(`
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TABLE public.attendances(id uuid PRIMARY KEY);
    CREATE TABLE public.sale_documents(id uuid PRIMARY KEY);
    CREATE TYPE public.app_role AS ENUM ('admin','secretaria','corretor','atendimentos_viewer','meta_reviewer');
    CREATE FUNCTION public.has_role(uuid,public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT public.has_role($1,$2::text)
    $$;
    CREATE OR REPLACE FUNCTION public.has_role(uuid,text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT $1=auth.uid() AND $2=coalesce(nullif(current_setting('test.role',true),''),'secretaria')
    $$;
    CREATE FUNCTION is_meta_reviewer() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT has_role(auth.uid(),'meta_reviewer'::text) $$;
    CREATE FUNCTION is_atendimentos_viewer() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT has_role(auth.uid(),'atendimentos_viewer'::text) $$;
    CREATE FUNCTION public.has_notification_agency_access(uuid,text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT $1=auth.uid() AND ($2 IN ('cordial','ambas') OR ($2='morar' AND coalesce(current_setting('test.morar',true),'off')='on'))
    $$;
    CREATE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END $$;
    INSERT INTO auth.users VALUES ('${userId}'),('${otherId}');
    GRANT ALL ON storage.objects TO service_role;
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  `);
  const legacy = [
    "20260630182115_589f6034-eec5-4dbb-b9f3-6d57aa377d92",
    "20260716173541_4b7ef2e1-2a85-4a4a-b861-02fe4a26e693",
    "20260716191325_818d430d-0305-4771-857a-d287b1eeed68",
    "20260717181654_2e79e10c-ad6f-41c8-86d9-0402ba459d0b",
    "20260720134731_612f5957-0b6d-4485-8e98-c1c0cbb83e5d",
    "20260722191254_77b9eb6e-320e-4ca1-bcdb-d6d2a2fcefa0",
  ];
  for (const name of legacy)
    await db.exec(
      await readFile(new URL(`../../supabase/migrations/${name}.sql`, import.meta.url), "utf8"),
    );
  await db.exec(`
    ALTER TABLE rental_contracts ADD COLUMN comissao_mensal numeric, ADD COLUMN last_payment_reference_id uuid;
    ALTER TABLE rental_contract_documents ADD COLUMN drive_file_id text;
    ALTER TABLE rental_properties ADD COLUMN proprietario_telefone text;
    ALTER TABLE inspections ADD COLUMN rental_contract_id uuid REFERENCES rental_contracts(id), ADD COLUMN rental_kind text;
  `);
  for (const name of [
    "0067_rental_docs_unique_file_path",
    "0104_rental_contract_entry_inspection",
    "0105_inspection_rental_property",
    "0108_rental_spouse_versions_exit_inspection",
    "0111_rental_contract_workflow",
    "0112_rental_inspection_scope",
    "0114_rental_confirm_workflow_file_null_person",
    "0123_inspection_term_snapshot",
  ]) {
    await db.exec(
      await readFile(new URL(`../../drizzle/migrations/${name}.sql`, import.meta.url), "utf8"),
    );
  }
  return db;
}
