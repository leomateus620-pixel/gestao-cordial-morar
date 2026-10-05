import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

export const contractId = "10000000-0000-0000-0000-000000000001";
export const tenantId = "20000000-0000-0000-0000-000000000001";
export const userId = "30000000-0000-0000-0000-000000000001";

/** Actual fiscal migrations against isolated PostgreSQL; sanitized fixture data. */
export async function fiscalDatabase(options: { legacy?: boolean } = {}) {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE FUNCTION public.has_role(uuid, text) RETURNS boolean LANGUAGE sql STABLE AS
      $$ SELECT coalesce(nullif(current_setting('test.app_role', true), ''), 'admin') = $2 $$;
    CREATE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS
      $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
    CREATE TABLE public.rental_tenants (
      id uuid PRIMARY KEY, nome text, cpf_cnpj text, email text, telefone text, endereco text
    );
    CREATE TABLE public.rental_contracts (
      id uuid PRIMARY KEY, created_by uuid, tenant_id uuid REFERENCES rental_tenants(id),
      property_id uuid, brand text, valor_mensal numeric, comissao_mensal numeric,
      payment_status text, proximo_vencimento date, updated_at timestamptz DEFAULT now()
    );
    ALTER TABLE public.rental_contracts ENABLE ROW LEVEL SECURITY;
    CREATE POLICY contract_access ON public.rental_contracts FOR ALL TO authenticated
      USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());
    GRANT SELECT, UPDATE, DELETE ON public.rental_contracts TO authenticated;
    GRANT ALL ON public.rental_contracts, public.rental_tenants TO service_role;
    INSERT INTO auth.users VALUES ('${userId}');
    INSERT INTO rental_tenants VALUES ('${tenantId}', 'Pessoa de teste', '12345678909',
      'fixture@example.invalid', '55999990000', 'Endereço fiscal informado');
    INSERT INTO rental_contracts VALUES ('${contractId}', '${userId}', '${tenantId}',
      '40000000-0000-0000-0000-000000000001', 'ambas', 2000, 200,
      'pendente', '2026-09-30', '2026-09-01T12:00:00Z');
  `);
  for (const file of [
    "20260909104616_ce9917c1-c79f-4bf5-91f8-fea1d8e30c97.sql",
    "20261002011433_9af31070-dbfd-4e26-b84f-b0e67ede9d3f.sql",
    "20261002013038_5358cc73-3222-4d91-9a59-c4c430917850.sql",
    "20261005090000_rental_nfse_integrity.sql",
  ]) {
    if (options.legacy && file === "20261005090000_rental_nfse_integrity.sql") {
      await db.query(
        `INSERT INTO rental_nfse_emissions
        (contract_id, brand, competencia, valor, status, identificador, response_raw)
        VALUES ($1, 'morar', '2026-08-01', 150, 'incerto', 'LEGACY-FIXTURE', 'preserved legacy response')`,
        [contractId],
      );
    }
    await db.exec(
      await readFile(new URL(`../../supabase/migrations/${file}`, import.meta.url), "utf8"),
    );
  }
  await db.exec(`SELECT set_config('request.jwt.claim.sub', '${userId}', false);
    UPDATE nfse_provider_settings SET cnpj = '12ABC34501DE35',
      fiscal_profile = '{"operation":"administracao","approvalReference":"Referência sanitizada de aprovação fiscal","productionAuthorization":"Autorização sanitizada para testar bloqueios SQL"}'
    WHERE brand = 'cordial' ${options.legacy ? "" : "OR brand = 'morar'"};`);
  return db;
}

export async function prepareReference(db: PGlite) {
  const { rows } = await db.query<{ id: string }>(
    `
    INSERT INTO rental_nfse_service_references
      (contract_id, source, source_key, competencia, fato_gerador, valor_servico, contract_snapshot, decision)
    VALUES ($1, 'manual_review', 'administracao:2026-09', '2026-09-01', '2026-09-30', 200,
      '{"tomador":"Pessoa de teste"}', '{"reason":"Revisão explícita com documento da ocorrência"}') RETURNING id`,
    [contractId],
  );
  return rows[0].id;
}

export async function currentSnapshot(db: PGlite, brand = "cordial") {
  const { rows } = await db.query<{ snapshot: Record<string, unknown> }>(
    `SELECT jsonb_build_object(
    'brand', s.brand, 'issuerIdentity', s.cnpj, 'configVersion', s.config_version,
    'profile', s.fiscal_profile, 'contractId', c.id, 'contractRevision', c.updated_at,
    'fiscalSettings', (SELECT jsonb_object_agg(key, value) FROM jsonb_each(to_jsonb(s))
      WHERE key = ANY(ARRAY['brand','cnpj','inscricao_municipal','razao_social','cidade_tom',
        'codigo_ibge_municipio','endpoint_url','codigo_item_lista_servico','codigo_nbs',
        'aliquota_iss','situacao_tributaria','tributa_municipio_prestador','ibs_cbs_c_ind_op',
        'ibs_cbs_cst','ibs_cbs_c_class_trib','simples_nacional']))) AS snapshot
    FROM nfse_provider_settings s CROSS JOIN rental_contracts c WHERE s.brand = $1 AND c.id = $2`,
    [brand, contractId],
  );
  return rows[0].snapshot;
}

export async function prepareEmission(
  db: PGlite,
  referenceId: string,
  options: {
    brand?: string;
    identificador?: string;
    snapshot?: Record<string, unknown>;
    modoTeste?: boolean;
  } = {},
) {
  const brand = options.brand ?? "cordial";
  const snapshot = options.snapshot ?? (await currentSnapshot(db, brand));
  const { rows } = await db.query<{ id: string; attempt_id: string }>(
    `
    INSERT INTO rental_nfse_emissions
      (contract_id, brand, competencia, valor, status, modo_teste, identificador, issuer_identity,
       service_reference_id, snapshot, snapshot_hash, config_version, attempt_id, request_xml, transition_actor, created_by, confirmacao_real_por)
    VALUES ($1, $4, '2026-09-01', 200, 'processando', $7, $6, '12ABC34501DE35',
      $2, $5, 'sanitized-snapshot-v1', ($5::jsonb->>'configVersion')::bigint, gen_random_uuid(), '<nfse>fixture</nfse>', $3, $3, $3)
    RETURNING id, attempt_id`,
    [
      contractId,
      referenceId,
      userId,
      brand,
      JSON.stringify(snapshot),
      options.identificador ?? "FIXTURE-2026-09",
      options.modoTeste ?? true,
    ],
  );
  return rows[0];
}
