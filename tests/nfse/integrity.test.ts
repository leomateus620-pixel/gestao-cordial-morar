import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import {
  fiscalDatabase,
  prepareReference,
  prepareEmission,
  currentSnapshot,
  contractId,
  tenantId,
  userId,
} from "./database";

let db: PGlite;
before(async () => {
  db = await fiscalDatabase();
});
after(async () => {
  await db.close();
});

test("baixa captura valores e tomador antigos, preserva origem e não infere competência fiscal", async () => {
  await db.query(
    `UPDATE rental_contracts SET payment_status = 'pago', proximo_vencimento = '2026-10-30'
    WHERE id = $1 AND proximo_vencimento = '2026-09-30'`,
    [contractId],
  );
  const duplicate = await db.query(
    `UPDATE rental_contracts SET payment_status = 'pago', proximo_vencimento = '2026-10-30'
    WHERE id = $1 AND proximo_vencimento = '2026-09-30' RETURNING id`,
    [contractId],
  );
  assert.equal(duplicate.rows.length, 0);
  await db.query(`UPDATE rental_contracts SET comissao_mensal = 300 WHERE id = $1`, [contractId]);
  await db.query(`UPDATE rental_tenants SET nome = 'Nome alterado depois da baixa' WHERE id = $1`, [
    tenantId,
  ]);
  const { rows } = await db.query<{
    competencia: null;
    valor_servico: string;
    contract_snapshot: { tenant: { nome: string } };
    source_key: string;
  }>(
    `SELECT competencia, valor_servico, contract_snapshot, source_key FROM rental_nfse_service_references WHERE source = 'payment'`,
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].competencia, null);
  assert.equal(Number(rows[0].valor_servico), 200);
  assert.equal(rows[0].contract_snapshot.tenant.nome, "Pessoa de teste");
  assert.equal(rows[0].source_key, "payment:2026-09-30");
  await assert.rejects(
    db.exec(`UPDATE rental_nfse_service_references SET valor_servico = 300`),
    /imutáveis/,
  );
});

test("sem vencimento conhecido, baixa e mudança de estado são revertidas", async () => {
  await db.exec(
    `INSERT INTO rental_contracts (id, payment_status) VALUES ('10000000-0000-0000-0000-000000000099', 'pendente')`,
  );
  await assert.rejects(
    db.exec(`UPDATE rental_contracts SET payment_status = 'pago'
    WHERE id = '10000000-0000-0000-0000-000000000099'`),
    /Revise o vencimento/,
  );
  const { rows } = await db.query<{
    payment_status: string;
  }>(`SELECT payment_status FROM rental_contracts
    WHERE id = '10000000-0000-0000-0000-000000000099'`);
  assert.equal(rows[0].payment_status, "pendente");
});

test("estado e evento são atômicos, inclusive quando a persistência da auditoria falha", async () => {
  const emission = await prepareEmission(db, await prepareReference(db));
  await db.exec(`CREATE FUNCTION fiscal_private.test_event_failure() RETURNS trigger LANGUAGE plpgsql AS
    $$ BEGIN IF NEW.to_status = 'emitida' THEN RAISE EXCEPTION 'simulated audit failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER test_event_failure BEFORE INSERT ON rental_nfse_emission_events
    FOR EACH ROW EXECUTE FUNCTION fiscal_private.test_event_failure();`);
  await assert.rejects(
    db.query(
      `UPDATE rental_nfse_emissions SET status = 'emitida', response_raw = '<numero>42</numero>'
    WHERE id = $1`,
      [emission.id],
    ),
    /simulated audit failure/,
  );
  const state = await db.query<{ status: string; response_raw: string | null }>(
    `SELECT status, response_raw FROM rental_nfse_emissions WHERE id = $1`,
    [emission.id],
  );
  assert.equal(state.rows[0].status, "processando");
  assert.equal(state.rows[0].response_raw, null);
  assert.equal(
    (
      await db.query(`SELECT id FROM rental_nfse_emission_events WHERE emission_id = $1`, [
        emission.id,
      ])
    ).rows.length,
    1,
  );
  await db.exec("DROP TRIGGER test_event_failure ON rental_nfse_emission_events");
});

test("mesmo prestador em marcas distintas não ultrapassa bloqueio; timeout conserva reserva", async () => {
  const { rows: emissions } = await db.query<{ id: string }>(
    `SELECT id FROM rental_nfse_emissions LIMIT 1`,
  );
  await db.query(
    `UPDATE rental_nfse_emissions SET status = 'incerto', http_status = 503,
    response_raw = 'unavailable', response_complete = true, transport = 'http', parser_version = 'fixture-v1' WHERE id = $1`,
    [emissions[0].id],
  );
  const { rows: refs } = await db.query<{ id: string }>(
    `SELECT id FROM rental_nfse_service_references WHERE source = 'manual_review' LIMIT 1`,
  );
  await assert.rejects(
    prepareEmission(db, refs[0].id, { brand: "morar", identificador: "OTHER-ID" }),
    /rental_nfse_issuer_active_uniq/,
  );
});

test("tentativa CAS rejeita resposta antiga e conserva evidência tardia sem sobrescrever estado", async () => {
  const { rows: old } = await db.query<{ id: string; attempt_id: string }>(
    `SELECT id, attempt_id FROM rental_nfse_emissions LIMIT 1`,
  );
  await db.query(
    `UPDATE rental_nfse_emissions SET status = 'processando', attempt_id = gen_random_uuid(), attempts = attempts + 1
    WHERE id = $1 AND status = 'incerto' AND attempt_id = $2`,
    [old[0].id, old[0].attempt_id],
  );
  const stale = await db.query(
    `UPDATE rental_nfse_emissions SET status = 'emitida'
    WHERE id = $1 AND attempt_id = $2 AND status = 'processando' RETURNING id`,
    [old[0].id, old[0].attempt_id],
  );
  assert.equal(stale.rows.length, 0);
  await db.query(
    `INSERT INTO rental_nfse_emission_events
    (emission_id, to_status, actor_kind, attempt_id, evidence_kind, details)
    VALUES ($1, NULL, 'sistema', $2, 'late_response', '{"http_status":200,"response_raw":"late fixture"}')`,
    [old[0].id, old[0].attempt_id],
  );
  const { rows } = await db.query<{ status: string }>(
    `SELECT status FROM rental_nfse_emissions WHERE id = $1`,
    [old[0].id],
  );
  assert.equal(rows[0].status, "processando");
  const events = await db.query<{ details: { http_status: number }; evidence_kind: string }>(
    `SELECT details, evidence_kind
    FROM rental_nfse_emission_events WHERE emission_id = $1 ORDER BY created_at`,
    [old[0].id],
  );
  assert.ok(events.rows.some((event) => event.details.http_status === 503));
  assert.ok(events.rows.some((event) => event.evidence_kind === "late_response"));
  await assert.rejects(
    db.query(
      `INSERT INTO rental_nfse_emission_events
    (emission_id, to_status, actor_kind, evidence_kind) VALUES ($1, 'emitida', 'sistema', 'late_response')`,
      [old[0].id],
    ),
    /rental_nfse_event_transition_semantics/,
  );
  await assert.rejects(
    db.query(`UPDATE rental_nfse_emissions SET snapshot_hash = 'changed' WHERE id = $1`, [
      old[0].id,
    ]),
    /imutáveis/,
  );
  await db.query(
    `UPDATE rental_nfse_emissions SET status = 'erro', transport = 'nao_enviado'
    WHERE id = $1`,
    [old[0].id],
  );
  const reserved = await db.query<{ status: string }>(
    `SELECT status FROM rental_nfse_emissions WHERE id = $1`,
    [old[0].id],
  );
  assert.equal(
    reserved.rows[0].status,
    "incerto",
    "Falha do reenvio não esclarece a tentativa original",
  );
});

test("contrato, emissão e eventos permanecem vinculados e não aceitam exclusão física", async () => {
  await assert.rejects(
    db.query(`DELETE FROM rental_contracts WHERE id = $1`, [contractId]),
    /foreign key constraint/,
  );
  await assert.rejects(db.exec(`DELETE FROM rental_nfse_emissions`), /preservado/);
  await assert.rejects(db.exec(`DELETE FROM rental_nfse_emission_events`), /imutáveis/);
});

test("permissões SQL negam diagnósticos ao navegador e mantêm escopo do contrato", async () => {
  await db.exec(
    `SELECT set_config('request.jwt.claim.sub', '${userId}', false); SET ROLE authenticated;`,
  );
  try {
    assert.equal(
      (await db.query(`SELECT id, status, valor FROM rental_nfse_emissions`)).rows.length,
      1,
    );
    await assert.rejects(
      db.query(`SELECT request_xml FROM rental_nfse_emissions`),
      /permission denied/,
    );
    await assert.rejects(
      db.query(`SELECT response_raw FROM rental_nfse_emissions`),
      /permission denied/,
    );
    await assert.rejects(
      db.query(`SELECT snapshot FROM rental_nfse_emissions`),
      /permission denied/,
    );
    await assert.rejects(
      db.query(`SELECT details FROM rental_nfse_emission_events`),
      /permission denied/,
    );
    await assert.rejects(db.query(`DELETE FROM rental_nfse_emissions`), /permission denied/);
    await db.exec(
      `SELECT set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000099', false)`,
    );
    assert.equal((await db.query(`SELECT id FROM rental_nfse_emissions`)).rows.length, 0);
  } finally {
    await db.exec("RESET ROLE");
  }
});

test("versão fiscal é controlada no banco e não pode ser forjada pelo cliente", async () => {
  await db.exec(`UPDATE nfse_provider_settings SET config_version = 999 WHERE brand = 'cordial'`);
  const first = await db.query<{ config_version: number }>(
    `SELECT config_version FROM nfse_provider_settings WHERE brand = 'cordial'`,
  );
  assert.equal(Number(first.rows[0].config_version), 2);
  await assert.rejects(
    db.exec(
      `UPDATE nfse_provider_settings SET fiscal_profile = '{"status":"draft"}' WHERE brand = 'cordial'`,
    ),
    /operações pendentes/,
  );
  const next = await db.query<{ config_version: number }>(
    `SELECT config_version FROM nfse_provider_settings WHERE brand = 'cordial'`,
  );
  assert.equal(Number(next.rows[0].config_version), 2);
});

test("a identidade fiscal não é reutilizada com nova linha após liberação manual", async () => {
  await db.query(
    `UPDATE rental_nfse_emissions SET status = 'nao_emitida', resolved_by = $1,
    resolved_at = now(), resolution_reason = 'Fixture de conferência: ausência comprovada da nota'`,
    [userId],
  );
  await assert.rejects(
    db.exec(`INSERT INTO rental_nfse_emissions
    (contract_id, brand, competencia, valor, status, modo_teste, identificador, issuer_identity,
     service_reference_id, snapshot, snapshot_hash, config_version, attempt_id, transition_actor, created_by)
    SELECT contract_id, brand, competencia, valor, 'processando', modo_teste, identificador, issuer_identity,
     service_reference_id, snapshot, snapshot_hash, config_version, gen_random_uuid(), transition_actor, created_by FROM rental_nfse_emissions LIMIT 1`),
    /rental_nfse_issuer_identifier_uniq/,
  );
});

test("referência de outra competência não autoriza emissão e não cria evento", async () => {
  const beforeCount = (await db.query(`SELECT id FROM rental_nfse_emission_events`)).rows.length;
  await assert.rejects(
    db.exec(`INSERT INTO rental_nfse_emissions
    (contract_id, brand, competencia, valor, status, modo_teste, identificador, issuer_identity,
     service_reference_id, snapshot, snapshot_hash, config_version, attempt_id)
    SELECT contract_id, brand, '2026-08-01', valor, 'processando', true, 'MISMATCH', issuer_identity,
     service_reference_id, snapshot, snapshot_hash, config_version, gen_random_uuid() FROM rental_nfse_emissions LIMIT 1`),
    /referência revisada deve corresponder/,
  );
  assert.equal(
    (await db.query(`SELECT id FROM rental_nfse_emission_events`)).rows.length,
    beforeCount,
  );
});

test("aprovação registra ator e versão; alternar ambiente preserva homologação da versão", async () => {
  await db.exec(`SELECT set_config('request.jwt.claim.sub', '${userId}', false);
    UPDATE nfse_provider_settings SET fiscal_profile = '{"approvalReference":"Documento fiscal aprovado para teste","productionAuthorization":"Autorização expressa da empresa para produção"}'
    WHERE brand = 'cordial';`);
  const approved = (
    await db.query<{
      config_version: number;
      fiscal_approved_by: string;
      fiscal_approved_config_version: number;
      production_authorized_by: string;
    }>(
      `SELECT config_version, fiscal_approved_by, fiscal_approved_config_version, production_authorized_by FROM nfse_provider_settings WHERE brand = 'cordial'`,
    )
  ).rows[0];
  assert.equal(approved.fiscal_approved_by, userId);
  assert.equal(Number(approved.fiscal_approved_config_version), Number(approved.config_version));
  assert.equal(approved.production_authorized_by, userId);
  await assert.rejects(
    db.exec(`UPDATE nfse_provider_settings SET modo_teste = false WHERE brand = 'cordial'`),
    /validação em teste desta versão/,
  );
  const { rows: refs } = await db.query<{ id: string }>(
    `SELECT id FROM rental_nfse_service_references WHERE source = 'manual_review' LIMIT 1`,
  );
  await prepareEmission(db, refs[0].id, { identificador: "TEST-CURRENT-CONFIG" });
  await db.exec(`UPDATE rental_nfse_emissions SET status = 'teste_ok' WHERE identificador = 'TEST-CURRENT-CONFIG';
    UPDATE nfse_provider_settings SET modo_teste = false WHERE brand = 'cordial';`);
  const production = (
    await db.query<{ config_version: number; modo_teste: boolean }>(
      `SELECT config_version, modo_teste FROM nfse_provider_settings WHERE brand = 'cordial'`,
    )
  ).rows[0];
  assert.equal(production.modo_teste, false);
  assert.equal(Number(production.config_version), Number(approved.config_version));
  await db.exec(
    `UPDATE nfse_provider_settings SET fiscal_profile = fiscal_profile || '{"productionAuthorization":"Nova autorização expressa de produção revisada"}' WHERE brand = 'cordial'`,
  );
  const changed = (
    await db.query<{ config_version: number; modo_teste: boolean }>(
      `SELECT config_version, modo_teste FROM nfse_provider_settings WHERE brand = 'cordial'`,
    )
  ).rows[0];
  assert.equal(Number(changed.config_version), Number(production.config_version) + 1);
  assert.equal(changed.modo_teste, true);
  await assert.rejects(
    db.exec(`UPDATE nfse_provider_settings SET modo_teste = false WHERE brand = 'cordial'`),
    /validação em teste desta versão/,
  );
});

test("financeiro mantém configuração comum e não frauda aprovação nem ambiente pelo banco", async () => {
  // The changed production authorization above needs approval of the saved version.
  await db.exec(
    `UPDATE nfse_provider_settings SET fiscal_profile = fiscal_profile WHERE brand = 'cordial'`,
  );
  await db.exec(`SELECT set_config('test.app_role', 'financeiro', false); SET ROLE authenticated;`);
  try {
    await assert.rejects(
      db.exec(
        `UPDATE nfse_provider_settings SET fiscal_profile = '{"approvalReference":"Aprovação forjada diretamente"}' WHERE brand = 'cordial'`,
      ),
      /Somente a administração/,
    );
    await assert.rejects(
      db.exec(`UPDATE nfse_provider_settings SET modo_teste = false WHERE brand = 'cordial'`),
      /Somente a administração/,
    );
    await db.exec(
      `UPDATE nfse_provider_settings SET fiscal_approved_by = '30000000-0000-0000-0000-000000000099', fiscal_approved_config_version = 999 WHERE brand = 'cordial'`,
    );
    const unspoofed = (
      await db.query<{ fiscal_approved_by: string; fiscal_approved_config_version: number }>(
        `SELECT fiscal_approved_by, fiscal_approved_config_version FROM nfse_provider_settings WHERE brand = 'cordial'`,
      )
    ).rows[0];
    assert.equal(unspoofed.fiscal_approved_by, userId);
    assert.notEqual(Number(unspoofed.fiscal_approved_config_version), 999);
    await db.exec(`UPDATE nfse_provider_settings SET aliquota_iss = 2.5 WHERE brand = 'cordial'`);
    const changed = (
      await db.query<{
        fiscal_approved_by: null;
        production_authorized_by: null;
        modo_teste: boolean;
      }>(
        `SELECT fiscal_approved_by, production_authorized_by, modo_teste FROM nfse_provider_settings WHERE brand = 'cordial'`,
      )
    ).rows[0];
    assert.equal(changed.fiscal_approved_by, null);
    assert.equal(changed.production_authorized_by, null);
    assert.equal(changed.modo_teste, true);
  } finally {
    await db.exec(`RESET ROLE; SELECT set_config('test.app_role', 'admin', false);`);
  }
  await assert.rejects(
    db.exec(`DELETE FROM nfse_provider_settings WHERE brand = 'cordial'`),
    /histórico fiscal deve ser preservada/,
  );
  // Sending the same profile explicitly re-approves the new material version.
  await db.exec(
    `UPDATE nfse_provider_settings SET fiscal_profile = fiscal_profile WHERE brand = 'cordial'`,
  );
  const reapproved = (
    await db.query<{ fiscal_approved_config_version: number; config_version: number }>(
      `SELECT fiscal_approved_config_version, config_version FROM nfse_provider_settings WHERE brand = 'cordial'`,
    )
  ).rows[0];
  assert.equal(
    Number(reapproved.fiscal_approved_config_version),
    Number(reapproved.config_version),
  );
});

test("legado incerto sem identidade bloqueia novos envios sem inventar seu prestador", async () => {
  const legacyDb = await fiscalDatabase({ legacy: true });
  try {
    const historical = (
      await legacyDb.query<{ issuer_identity: null; response_raw: string }>(
        `SELECT issuer_identity, response_raw FROM rental_nfse_emissions WHERE identificador = 'LEGACY-FIXTURE'`,
      )
    ).rows[0];
    assert.equal(historical.issuer_identity, null);
    assert.equal(historical.response_raw, "preserved legacy response");
    const referenceId = await prepareReference(legacyDb);
    await assert.rejects(
      prepareEmission(legacyDb, referenceId),
      /processamento legado sem identidade comprovada/,
    );
    await legacyDb.query(
      `UPDATE rental_nfse_emissions SET status = 'nao_emitida', resolved_by = $1,
      resolved_at = now(), resolution_reason = 'Fixture: ausência comprovada no portal municipal'
      WHERE identificador = 'LEGACY-FIXTURE'`,
      [userId],
    );
    const emission = await prepareEmission(legacyDb, referenceId);
    assert.ok(emission.id);
  } finally {
    await legacyDb.close();
  }
});

test("alteração do contrato ou da configuração entre prévia e INSERT invalida confirmação", async () => {
  const { rows: refs } = await db.query<{ id: string }>(
    `SELECT id FROM rental_nfse_service_references WHERE source = 'manual_review' LIMIT 1`,
  );
  const staleContract = await currentSnapshot(db);
  const eventCount = (await db.query(`SELECT id FROM rental_nfse_emission_events`)).rows.length;
  await db.query(
    `UPDATE rental_contracts SET updated_at = '2026-10-05T18:01:00Z', comissao_mensal = 350 WHERE id = $1`,
    [contractId],
  );
  await assert.rejects(
    prepareEmission(db, refs[0].id, { identificador: "STALE-CONTRACT", snapshot: staleContract }),
    /contrato mudou após a revisão/,
  );
  const staleSettings = await currentSnapshot(db);
  await db.exec(`UPDATE nfse_provider_settings SET aliquota_iss = 2.7 WHERE brand = 'cordial';
    UPDATE nfse_provider_settings SET fiscal_profile = fiscal_profile WHERE brand = 'cordial';`);
  await assert.rejects(
    prepareEmission(db, refs[0].id, { identificador: "STALE-SETTINGS", snapshot: staleSettings }),
    /configuração ou aprovação fiscal mudou/,
  );
  const tampered = await currentSnapshot(db);
  tampered.profile = { approvalReference: "Perfil diferente que não foi aprovado" };
  await assert.rejects(
    prepareEmission(db, refs[0].id, { identificador: "WRONG-PROFILE", snapshot: tampered }),
    /snapshot não corresponde ao perfil/,
  );
  assert.equal(
    (await db.query(`SELECT id FROM rental_nfse_emission_events`)).rows.length,
    eventCount,
  );
});

test("modo revogado após prévia bloqueia emissão real e intent ativo bloqueia mudanças no prestador", async () => {
  const { rows: refs } = await db.query<{ id: string }>(
    `SELECT id FROM rental_nfse_service_references WHERE source = 'manual_review' LIMIT 1`,
  );
  await prepareEmission(db, refs[0].id, { identificador: "TEST-MODE-RACE" });
  await db.exec(`UPDATE rental_nfse_emissions SET status = 'teste_ok' WHERE identificador = 'TEST-MODE-RACE';
    UPDATE nfse_provider_settings SET modo_teste = false WHERE brand = 'cordial';`);
  const confirmedSnapshot = await currentSnapshot(db);
  await db.exec(`UPDATE nfse_provider_settings SET modo_teste = true WHERE brand = 'cordial'`);
  await assert.rejects(
    prepareEmission(db, refs[0].id, {
      identificador: "PRODUCTION-AFTER-REVOCATION",
      snapshot: confirmedSnapshot,
      modoTeste: false,
    }),
    /emissão real exige ambiente/,
  );
  const active = await prepareEmission(db, refs[0].id, { identificador: "ACTIVE-SETTINGS-LOCK" });
  await assert.rejects(
    db.exec(`UPDATE nfse_provider_settings SET aliquota_iss = 3.1 WHERE brand = 'cordial'`),
    /operações pendentes/,
  );
  await assert.rejects(
    db.exec(
      `UPDATE nfse_provider_settings SET fiscal_profile = fiscal_profile WHERE brand = 'cordial'`,
    ),
    /operações pendentes/,
  );
  await assert.rejects(
    db.exec(`UPDATE nfse_provider_settings SET modo_teste = false WHERE brand = 'cordial'`),
    /operações pendentes/,
  );
  await assert.rejects(
    db.exec(`UPDATE nfse_provider_settings SET cnpj = '12345678000199' WHERE brand = 'morar'`),
    /operações pendentes/,
  );
  await db.query(`UPDATE rental_nfse_emissions SET status = 'erro' WHERE id = $1`, [active.id]);
});

test("correção real exige ausência comprovada e vínculo único; ancestral não volta a ser enviada", async () => {
  const { rows: refs } = await db.query<{ id: string }>(
    `SELECT id FROM rental_nfse_service_references WHERE source = 'manual_review' LIMIT 1`,
  );
  await db.exec(`UPDATE nfse_provider_settings SET modo_teste = false WHERE brand = 'cordial'`);
  const original = await prepareEmission(db, refs[0].id, {
    identificador: "REAL-ORIGINAL",
    modoTeste: false,
  });
  await db.query(
    `UPDATE rental_nfse_emissions SET status = 'erro', transport = 'ok', http_status = 503,
    response_complete = true, transition_details = '{"mode":"emissao"}' WHERE id = $1`,
    [original.id],
  );
  await assert.rejects(
    prepareEmission(db, refs[0].id, { identificador: "REAL-UNLINKED", modoTeste: false }),
    /correção exige vínculo explícito/,
  );
  const revisionSnapshot = await currentSnapshot(db);
  revisionSnapshot.review = { replacesEmissionId: original.id };
  await assert.rejects(
    prepareEmission(db, refs[0].id, {
      identificador: "REAL-AFTER-503",
      modoTeste: false,
      snapshot: revisionSnapshot,
    }),
    /não comprova ausência de emissão/,
  );
  await db.query(
    `UPDATE rental_nfse_emissions SET http_status = 400, transition_details = '{"mode":"consulta"}' WHERE id = $1`,
    [original.id],
  );
  await assert.rejects(
    prepareEmission(db, refs[0].id, {
      identificador: "REAL-AFTER-CONSULT",
      modoTeste: false,
      snapshot: revisionSnapshot,
    }),
    /não comprova ausência de emissão/,
  );
  await db.query(
    `UPDATE rental_nfse_emissions SET transition_details = '{"mode":"emissao"}' WHERE id = $1`,
    [original.id],
  );
  const revised = await prepareEmission(db, refs[0].id, {
    identificador: "REAL-REVIEWED",
    modoTeste: false,
    snapshot: revisionSnapshot,
  });
  await db.query(
    `UPDATE rental_nfse_emissions SET status = 'erro', transport = 'nao_enviado' WHERE id = $1`,
    [revised.id],
  );
  await assert.rejects(
    prepareEmission(db, refs[0].id, {
      identificador: "REAL-FORK",
      modoTeste: false,
      snapshot: revisionSnapshot,
    }),
    /rental_nfse_real_revision_parent_uniq/,
  );
  await assert.rejects(
    db.query(
      `UPDATE rental_nfse_emissions SET status = 'processando', attempts = attempts + 1,
    attempt_id = gen_random_uuid(), transition_reason = 'reenvio' WHERE id = $1`,
      [original.id],
    ),
    /já possui revisão vinculada/,
  );
  await db.query(`UPDATE rental_nfse_emissions SET status = 'incerto' WHERE id = $1`, [revised.id]);
  const resolvedSnapshot = await currentSnapshot(db);
  resolvedSnapshot.review = { replacesEmissionId: revised.id };
  await assert.rejects(
    prepareEmission(db, refs[0].id, {
      identificador: "REAL-UNCERTAIN",
      modoTeste: false,
      snapshot: resolvedSnapshot,
    }),
    /operação pendente/,
  );
  await db.query(
    `UPDATE rental_nfse_emissions SET status = 'nao_emitida', resolved_by = $2, resolved_at = now(),
    resolution_reason = 'Fixture de conferência municipal: comprovada ausência da emissão' WHERE id = $1`,
    [revised.id, userId],
  );
  const final = await prepareEmission(db, refs[0].id, {
    identificador: "REAL-AFTER-RESOLUTION",
    modoTeste: false,
    snapshot: resolvedSnapshot,
  });
  await db.query(
    `UPDATE rental_nfse_emissions SET status = 'emitida', numero_nfse = '42' WHERE id = $1`,
    [final.id],
  );
  await assert.rejects(
    prepareEmission(db, refs[0].id, {
      identificador: "REAL-AFTER-ISSUED",
      modoTeste: false,
      snapshot: resolvedSnapshot,
    }),
    /emitida ou cancelada não admite nova emissão/,
  );
});

test("salvar CNPJ com referência antiga não renova aprovação sem revisar a versão persistida", async () => {
  await db.exec(`UPDATE nfse_provider_settings SET cnpj = '12345678000199', fiscal_profile = fiscal_profile
    WHERE brand = 'cordial'`);
  const saved = (
    await db.query<{
      config_version: number;
      fiscal_approved_by: null;
      production_authorized_by: null;
      modo_teste: boolean;
    }>(
      `SELECT config_version, fiscal_approved_by, production_authorized_by, modo_teste FROM nfse_provider_settings WHERE brand = 'cordial'`,
    )
  ).rows[0];
  assert.equal(saved.fiscal_approved_by, null);
  assert.equal(saved.production_authorized_by, null);
  assert.equal(saved.modo_teste, true);
  await db.exec(
    `UPDATE nfse_provider_settings SET fiscal_profile = fiscal_profile WHERE brand = 'cordial'`,
  );
  const approved = (
    await db.query<{
      config_version: number;
      fiscal_approved_by: string;
      fiscal_approved_config_version: number;
    }>(
      `SELECT config_version, fiscal_approved_by, fiscal_approved_config_version FROM nfse_provider_settings WHERE brand = 'cordial'`,
    )
  ).rows[0];
  assert.equal(Number(approved.config_version), Number(saved.config_version));
  assert.equal(approved.fiscal_approved_by, userId);
  assert.equal(Number(approved.fiscal_approved_config_version), Number(saved.config_version));
});
