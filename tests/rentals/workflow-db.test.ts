import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { inspectionDatabase, otherId, userId } from "../vistoria/database";

const rentalId = "70000000-0000-4000-8000-000000000001";
const entryId = "70000000-0000-4000-8000-000000000002";
const exitId = "70000000-0000-4000-8000-000000000003";

async function rentalDatabase(t: import("node:test").TestContext) {
  const db = await inspectionDatabase();
  t.after(() => db.close());
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
  ]) {
    await db.exec(
      await readFile(new URL(`../../drizzle/migrations/${name}.sql`, import.meta.url), "utf8"),
    );
  }
  return db;
}

test("rascunho, retomada, conferência idempotente e saída com termo na revisão corrente", async (t) => {
  const db = await rentalDatabase(t);
  await db.exec("set role service_role");
  const save = (revision: number, input: Record<string, unknown>) =>
    db.query<{ value: number }>("select rental_save_workspace_draft($1,$2,$3,$4) value", [
      userId,
      rentalId,
      revision,
      input,
    ]);
  assert.equal((await save(0, { brand: "cordial" })).rows[0].value, 1);
  assert.equal((await save(0, { brand: "cordial" })).rows[0].value, 1);
  await assert.rejects(save(0, { brand: "cordial", old: true }), /mudou em outra tela/);
  await assert.rejects(save(1, { brand: "morar" }), /Sem acesso/);
  await db.exec("select set_config('test.morar','on',false)");
  assert.equal((await save(1, { brand: "morar" })).rows[0].value, 2);
  assert.equal((await db.query("select id from rental_contracts")).rows.length, 0);
  await db.exec("reset role");

  const path = `${rentalId}/gen-test.docx`;
  await db.query("insert into storage.objects values('rental-documents',$1)", [path]);
  const register = (
    revision: string,
    category = "contrato_aluguel",
    origin = "gerado",
    filePath = path,
  ) =>
    db.query<{ file: { id: string } }>(
      "select rental_register_workflow_file($1,$2,$3,true,$4) file",
      [
        userId,
        rentalId,
        revision,
        {
          filePath,
          fileName: "Teste.docx",
          mimeType: "application/octet-stream",
          category,
          origin,
          sizeBytes: 123,
        },
      ],
    );
  await assert.rejects(register("1"), /rascunho mudou/);
  const doc = (await register("2")).rows[0].file.id;
  assert.equal((await register("2")).rows[0].file.id, doc);
  const materialize = {
    property: {
      apelido: "Casa teste",
      tipo: "casa",
      logradouro: "Rua de Teste",
      status: "alugado",
    },
    tenants: [{ nome: "Pessoa fictícia", telefone: "55000000000" }],
    guarantees: [{ tipo: "caucao", valor_caucao: 2000 }],
    contract: {
      valor_mensal: 1000,
      data_inicio: "2026-11-24",
      data_fim: "2027-11-24",
      dia_vencimento: 10,
      status: "pendente_assinatura",
      payment_status: "pendente",
      garantia_tipo: "caucao",
      template_options: {},
      valor_caucao: 2000,
    },
  };
  const confirm = (payload: Record<string, unknown> | null, id = doc, revision = "2") =>
    db.query<{ doc: { id: string; contractId: string; reviewedAt: string } }>(
      "select rental_confirm_workflow_file($1,$2,$3,$4,true,$5) doc",
      [userId, rentalId, id, revision, payload],
    );
  await assert.rejects(confirm({ ...materialize, tenants: [] }), /not-null/);
  assert.equal((await db.query("select id from rental_workspace_files")).rows.length, 1);
  assert.equal((await db.query("select id from rental_contracts")).rows.length, 0);
  const result = (await confirm(materialize)).rows[0].doc;
  assert.equal(result.contractId, rentalId);
  assert.equal(result.id, doc);
  assert.ok(result.reviewedAt);
  assert.deepEqual((await confirm(null)).rows[0].doc, result);
  assert.equal((await db.query("select id from rental_contracts")).rows.length, 1);
  assert.equal((await db.query("select id from rental_contract_documents")).rows.length, 1);

  const [{ property_id: property }] = (
    await db.query<{ property_id: string }>("select property_id from rental_contracts")
  ).rows;
  const create = (id: string, kind: "entrada" | "saida", propertyId = property) =>
    db.query("select inspection_create($1,'[]')", [
      {
        id,
        rental_property_id: propertyId,
        rental_contract_id: rentalId,
        rental_kind: kind,
        kind,
        agency: "morar",
        responsible_id: userId,
        inspected_at: "2026-11-24T12:00:00Z",
        participants: [],
        furnished: "nao_informado",
        cleaning: "nao_informado",
        keys: [],
        meters: {},
        property_snapshot: {},
        plan_confirmed: true,
      },
    ]);
  await db.exec("set role authenticated");
  await assert.rejects(create(entryId, "entrada", otherId), /incompatível/);
  await assert.rejects(create(exitId, "saida"), /termo registrado/);
  await assert.rejects(
    db.query(
      "update rental_contract_documents set reviewed_at=now() + interval '1 day' where id=$1",
      [doc],
    ),
    /exigem o servidor/,
  );
  await db.exec("reset role");
  await db.query("update rental_contracts set valor_mensal=1200 where id=$1", [rentalId]);
  await db.exec("set role authenticated");
  await assert.rejects(create(entryId, "entrada"), /Confirme e salve/);
  await db.exec("reset role");

  // A legacy checklist cannot enable the entry. A separately attached and reviewed contract can.
  await db.query(
    `insert into rental_contract_documents(contract_id,file_path,file_name,category)
    values($1,$1::uuid::text||'/legacy.pdf','Checklist antigo','checklist_aluguel')`,
    [rentalId],
  );
  await assert.rejects(create(entryId, "entrada"), /Confirme e salve/);
  const extPath = `${rentalId}/ext.pdf`;
  await db.query("insert into storage.objects values('rental-documents',$1)", [extPath]);
  const rev = (
    await db.query<{ rev: string }>("select rental_contract_data_revision($1) rev", [rentalId])
  ).rows[0].rev;
  const id = (
    await db.query<{ file: { id: string } }>(
      "select rental_register_workflow_file($1,$2,$3,false,$4) file",
      [
        userId,
        rentalId,
        rev,
        {
          filePath: extPath,
          fileName: "Externo.pdf",
          mimeType: "application/pdf",
          sizeBytes: 100,
          category: "contrato_aluguel",
          origin: "externo",
        },
      ],
    )
  ).rows[0].file.id;
  assert.ok((await confirm(null, id, rev)).rows[0].doc.reviewedAt);
  await db.exec("set role authenticated");
  await create(entryId, "entrada");
  await create(entryId, "entrada");
  assert.equal(
    (await db.query("select id from inspections where rental_contract_id=$1", [rentalId])).rows
      .length,
    1,
  );
  await assert.rejects(create(exitId, "saida"), /termo registrado/);

  await db.query(
    "insert into inspection_rooms(inspection_id,name,no_photo_reason) values($1,'Cozinha','Sem acesso para foto')",
    [entryId],
  );
  await db.exec("reset role");
  await db.query("update inspections set plan_confirmed=true where id=$1", [entryId]);
  const sha = "a".repeat(64);
  const pdfPath = `${entryId}/docs/v1-${sha.slice(0, 16)}.pdf`;
  await db.query("insert into storage.objects values('inspection-media',$1)", [pdfPath]);
  const snapshot = (
    await db.query<{ s: { inspection: { revision: number } } }>(
      "select inspection_snapshot($1) s",
      [entryId],
    )
  ).rows[0].s;
  await db.query("select inspection_finalize_server($1,$2,$3,$4,100,$5,$6)", [
    userId,
    entryId,
    snapshot.inspection.revision,
    pdfPath,
    sha,
    snapshot,
  ]);
  await db.exec("set role authenticated");
  await create(exitId, "saida");
  assert.equal(
    (
      await db.query<{ entry_inspection_id: string }>(
        "select entry_inspection_id from inspections where id=$1",
        [exitId],
      )
    ).rows[0].entry_inspection_id,
    entryId,
  );
  await db.exec("select set_config('test.morar','off',false)");
  assert.equal(
    (await db.query("select id from rental_contracts where id=$1", [rentalId])).rows.length,
    0,
  );
  assert.equal(
    (await db.query("select id from inspections where rental_contract_id=$1", [rentalId])).rows
      .length,
    0,
  );
  assert.equal(
    (await db.query("select id from inspection_rooms where inspection_id=$1", [entryId])).rows
      .length,
    0,
  );
});

test("conferência materializa rascunho com seguro-fiança, caução, sem garantia e fiador", async (t) => {
  const db = await rentalDatabase(t);
  const base = (garantia: string) => ({
    property: { apelido: `Casa ${garantia}`, tipo: "casa", logradouro: "Rua Teste", status: "alugado" },
    tenants: [{ nome: "Pessoa fictícia", telefone: "55000000000" }],
    contract: {
      valor_mensal: 1000,
      data_inicio: "2026-11-24",
      data_fim: "2027-11-24",
      dia_vencimento: 10,
      status: "pendente_assinatura",
      payment_status: "pendente",
      garantia_tipo: garantia,
      template_options: {},
    },
  });
  const cases: Array<[string, Record<string, unknown>[], number]> = [
    ["seguro_fianca", [{ tipo: "seguro_fianca", seguro_seguradora: "Loft", seguro_valor_mensal: 90 }], 0],
    ["caucao_null", [{ tipo: "caucao", person: null, valor_caucao: 2000 }], 0],
    ["sem_garantia", [{ tipo: "sem_garantia", person: null }], 0],
    ["fiador", [{ tipo: "fiador", person: { nome: "Fiador fictício" } }], 1],
    [
      "fiador_conjuge",
      [{ tipo: "fiador", person: { nome: "Fiador 2" }, conjuge: { nome: "Cônjuge fictício" } }],
      1,
    ],
  ];
  let n = 10;
  async function run(guarantees: Record<string, unknown>[], tipo: string) {
    const id = `70000000-0000-4000-8000-0000000000${n++}`;
    await db.exec("set role service_role");
    await db.query("select rental_save_workspace_draft($1,$2,0,$3)", [userId, id, { brand: "cordial" }]);
    await db.exec("reset role");
    const path = `${id}/externo.docx`;
    await db.query("insert into storage.objects values('rental-documents',$1)", [path]);
    const doc = (
      await db.query<{ file: { id: string } }>(
        "select rental_register_workflow_file($1,$2,'1',true,$3) file",
        [userId, id, { filePath: path, fileName: "Externo.docx", mimeType: "application/octet-stream", category: "contrato_aluguel", origin: "externo", sizeBytes: 10 }],
      )
    ).rows[0].file.id;
    const res = db.query<{ doc: { contractId: string; reviewedAt: string } }>(
      "select rental_confirm_workflow_file($1,$2,$3,'1',true,$4) doc",
      [userId, id, doc, { ...base(tipo), guarantees }],
    );
    return { id, res };
  }
  for (const [tipo, guarantees, fiadores] of cases) {
    const before = Number((await db.query<{ c: string }>("select count(*) c from rental_guarantors")).rows[0].c);
    const { id, res } = await run(guarantees, tipo.replace("_null", "").replace("_conjuge", ""));
    const doc = (await res).rows[0].doc;
    assert.equal(doc.contractId, id, tipo);
    assert.ok(doc.reviewedAt, tipo);
    assert.equal((await db.query("select id from rental_workspace_drafts where id=$1", [id])).rows.length, 0);
    assert.equal((await db.query("select id from rental_contract_tenants where contract_id=$1", [id])).rows.length, 1);
    const g = (await db.query<{ guarantor_id: string | null; conjuge: unknown }>(
      "select guarantor_id, conjuge from rental_contract_guarantors where contract_id=$1", [id])).rows;
    assert.equal(g.length, 1, tipo);
    assert.equal(g[0].guarantor_id === null, fiadores === 0, tipo);
    if (tipo === "fiador_conjuge") assert.ok(g[0].conjuge);
    assert.equal((await db.query("select id from rental_contract_documents where contract_id=$1 and reviewed_at is not null", [id])).rows.length, 1);
    const after = Number((await db.query<{ c: string }>("select count(*) c from rental_guarantors")).rows[0].c);
    assert.equal(after - before, fiadores, tipo);
  }
  const { res } = await run([{ tipo: "fiador", person: null }], "fiador");
  await assert.rejects(res, /Informe o fiador\./);
});
