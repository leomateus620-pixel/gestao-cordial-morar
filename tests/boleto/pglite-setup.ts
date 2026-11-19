import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

export const ids = {
  admin: "00000000-0000-4000-8000-000000000001",
  secretaria: "00000000-0000-4000-8000-000000000002",
  corretor: "00000000-0000-4000-8000-000000000003",
  outro: "00000000-0000-4000-8000-000000000004",
  reviewer: "00000000-0000-4000-8000-000000000005",
  viewer: "00000000-0000-4000-8000-000000000006",
  contratoCordial: "00000000-0000-4000-8000-0000000000c1",
  contratoMorar: "00000000-0000-4000-8000-0000000000c2",
};
const mig = (f: string) =>
  readFileSync(new URL(`../../drizzle/migrations/${f}`, import.meta.url), "utf8");

/** Real migrations 0099–0101 over minimal stubs of the pre-existing objects they reference. */
export async function bootBoletoDb() {
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TABLE public.test_roles(user_id uuid, role text);
    INSERT INTO public.test_roles VALUES ('${ids.admin}','admin'),('${ids.secretaria}','secretaria'),('${ids.corretor}','corretor'),
      ('${ids.reviewer}','meta_reviewer'),('${ids.reviewer}','admin'),('${ids.viewer}','atendimentos_viewer');
    CREATE FUNCTION public.has_role(id uuid, r text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
      AS $$ SELECT EXISTS(SELECT 1 FROM test_roles WHERE user_id=id AND role=r) $$;
    CREATE FUNCTION public.is_meta_reviewer() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT public.has_role(auth.uid(),'meta_reviewer') $$;
    CREATE FUNCTION public.is_atendimentos_viewer() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT public.has_role(auth.uid(),'atendimentos_viewer') $$;
    CREATE TYPE public.rental_brand AS ENUM ('cordial','morar','ambas');
    CREATE TABLE public.rental_contracts(id uuid PRIMARY KEY, created_by uuid NOT NULL, brand public.rental_brand NOT NULL);
    GRANT SELECT ON public.rental_contracts TO authenticated;
    INSERT INTO public.rental_contracts VALUES ('${ids.contratoCordial}','${ids.corretor}','cordial'),('${ids.contratoMorar}','${ids.secretaria}','morar');
    CREATE TYPE public.rental_emission_type AS ENUM ('nfse','recibo','boleto');
    CREATE TABLE public.rental_emissions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contract_id uuid NOT NULL REFERENCES public.rental_contracts(id),
      tipo public.rental_emission_type NOT NULL, competencia text NOT NULL DEFAULT '2026-11', status text NOT NULL DEFAULT 'emitido', created_by uuid NOT NULL DEFAULT auth.uid());
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.rental_emissions TO authenticated, anon;
    ALTER TABLE public.rental_emissions ENABLE ROW LEVEL SECURITY;
    CREATE POLICY rental_emissions_select ON public.rental_emissions FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.rental_contracts c WHERE c.id = contract_id AND (c.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))));
    CREATE POLICY rental_emissions_insert ON public.rental_emissions FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid() AND EXISTS (SELECT 1 FROM public.rental_contracts c WHERE c.id = contract_id AND (c.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))));
    CREATE POLICY rental_emissions_update ON public.rental_emissions FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.rental_contracts c WHERE c.id = contract_id AND (c.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin')))) WITH CHECK (EXISTS (SELECT 1 FROM public.rental_contracts c WHERE c.id = contract_id AND (c.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))));
    CREATE POLICY rental_emissions_delete ON public.rental_emissions FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.rental_contracts c WHERE c.id = contract_id AND (c.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))));`);
  for (const f of [
    "0099_billing_accounts.sql",
    "0100_rental_boletos.sql",
    "0101_rental_emissions_boleto_guard.sql",
  ])
    await db.exec(mig(f));
  return db;
}

/** Runs `fn` as an authenticated user (or anon when id is null), always resetting the role. */
export async function asUser<T>(db: PGlite, id: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(
    id
      ? `SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${id}',false);`
      : "SET ROLE anon;",
  );
  try {
    return await fn();
  } finally {
    await db.exec("RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);");
  }
}

export async function seedAccount(
  db: PGlite,
  brand: "cordial" | "morar",
  ambiente: "sandbox" | "producao",
  habilitada = false,
) {
  const r = await db.query<{ id: string }>(
    `INSERT INTO public.billing_accounts (brand, ambiente, configurado, consulta_ok_em, emissao_habilitada, liberado_por, liberado_em)
     VALUES ($1,$2,true,${habilitada ? "now()" : "NULL"},$3,${habilitada ? `'${ids.admin}'` : "NULL"},${habilitada ? "now()" : "NULL"}) RETURNING id`,
    [brand, ambiente, habilitada],
  );
  return r.rows[0].id;
}
