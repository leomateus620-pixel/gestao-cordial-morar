import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { id, inspectionDatabase, roomId } from "./database";

async function db0115() {
  const db = await inspectionDatabase();
  await db.exec(
    await readFile(new URL("../../drizzle/migrations/0115_inspection_notes_transcription.sql", import.meta.url), "utf8"),
  );
  return db;
}
let n = 0;
async function note(db: Awaited<ReturnType<typeof db0115>>, source: "voz" | "texto" = "voz") {
  const key = `chave_relato_${++n}`;
  const r = await db.query<{ id: string }>(
    `INSERT INTO inspection_notes(inspection_id,room_id,client_key,source,audio_path,status)
     VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
    [id, roomId, key, source, source === "voz" ? `${id}/${roomId}/${key}.wav` : null, source === "voz" ? "pendente_transcricao" : "transcrito"],
  );
  return r.rows[0]!.id;
}
type Row = { revision: number; transcription_state: string | null; transcription_attempts: number; transcription_next_at: string | null; transcript_original: string | null };
const noteRow = async (db: any, nid: string) =>
  (await db.query(`SELECT * FROM inspection_notes WHERE id=$1`, [nid])).rows[0] as Row;
const insp = async (db: any) =>
  (await db.query(`SELECT revision, updated_at::text u FROM inspections WHERE id=$1`, [id])).rows[0] as { revision: number; u: string };
const claim = async (db: any, nid: string) =>
  (await db.query(`SELECT * FROM inspection_note_transcription_claim($1,1)`, [nid])).rows[0] as { claimed: boolean; lease_token: string | null };
const finish = (db: any, nid: string, tok: string | null, t: string | null, err: string | null, retry = false) =>
  db.query(`SELECT inspection_note_transcription_finish($1,$2,$3,'{}'::jsonb,$4,$5) r`, [nid, tok, t, err, retry]);
const tick = (db: any) => db.exec(`SELECT pg_sleep(0.01)`);

test("voz nasce pendente; texto fica NULL", async () => {
  const db = await db0115();
  assert.equal((await noteRow(db, await note(db))).transcription_state, "pendente");
  assert.equal((await noteRow(db, await note(db, "texto"))).transcription_state, null);
});

test("reserva e falha não mudam revisão da nota nem revisão/updated_at da vistoria", async () => {
  const db = await db0115();
  const nid = await note(db);
  const r0 = await noteRow(db, nid), i0 = await insp(db);
  await tick(db);
  const c = await claim(db, nid);
  assert.equal(c.claimed, true);
  await finish(db, nid, c.lease_token, null, "falhou.");
  assert.equal((await noteRow(db, nid)).revision, r0.revision);
  assert.deepEqual(await insp(db), i0);
});

test("conclusão não muda revisão da nota, mas atualiza a vistoria", async () => {
  const db = await db0115();
  const nid = await note(db);
  const r0 = await noteRow(db, nid), i0 = await insp(db);
  const c = await claim(db, nid);
  await tick(db);
  await finish(db, nid, c.lease_token, "sala ok", null);
  const r1 = await noteRow(db, nid), i1 = await insp(db);
  assert.equal(r1.transcript_original, "sala ok");
  assert.equal(r1.transcription_state, "concluida");
  assert.equal(r1.revision, r0.revision);
  assert.ok(i1.revision > i0.revision);
  assert.notEqual(i1.u, i0.u);
});

test("texto aprovado ainda soma revisão; inspection_id/room_id seguem bloqueados", async () => {
  const db = await db0115();
  const nid = await note(db);
  const r0 = await noteRow(db, nid);
  await db.query(`UPDATE inspection_notes SET approved_text='ok' WHERE id=$1`, [nid]);
  assert.equal((await noteRow(db, nid)).revision, r0.revision + 1);
  await assert.rejects(db.query(`UPDATE inspection_notes SET room_id=gen_random_uuid() WHERE id=$1`, [nid]));
  await assert.rejects(db.query(`UPDATE inspection_notes SET inspection_id=gen_random_uuid() WHERE id=$1`, [nid]));
});

test("segunda reserva seguida devolve claimed=false; token antigo não grava; renew errado = false", async () => {
  const db = await db0115();
  const nid = await note(db);
  const c1 = await claim(db, nid);
  assert.equal(c1.claimed, true);
  assert.equal((await claim(db, nid)).claimed, false);
  const renew = await db.query<{ ok: boolean }>(`SELECT inspection_note_transcription_renew($1,gen_random_uuid()) ok`, [nid]);
  assert.equal(renew.rows[0]!.ok, false);
  const stale = await finish(db, nid, "00000000-0000-4000-8000-000000000000", "x", null);
  assert.equal(stale.rows[0].r, null);
  assert.equal((await noteRow(db, nid)).transcript_original, null);
});

test("402/429 (retentável) não soma tentativa e define próxima tentativa; terminal soma", async () => {
  const db = await db0115();
  const nid = await note(db);
  const c = await claim(db, nid);
  await finish(db, nid, c.lease_token, null, "ocupado.", true);
  const r = await noteRow(db, nid);
  assert.equal(r.transcription_attempts, 0);
  assert.ok(r.transcription_next_at);
  assert.equal((await claim(db, nid)).claimed, false); // espera ainda não venceu
  await db.query(`UPDATE inspection_notes SET transcription_next_at=NULL WHERE id=$1`, [nid]);
  const c2 = await claim(db, nid);
  await finish(db, nid, c2.lease_token, null, "negado.", false);
  assert.equal((await noteRow(db, nid)).transcription_attempts, 1);
});

test("vistoria finalizada recusa reserva e conclusão", async () => {
  const db = await db0115();
  const nid = await note(db);
  const c = await claim(db, nid);
  await db.exec(`ALTER TABLE inspections DISABLE TRIGGER USER; UPDATE inspections SET status='concluida' WHERE id='${id}'; ALTER TABLE inspections ENABLE TRIGGER USER;`);
  await assert.rejects(claim(db, await note(db).catch(() => nid)));
  await assert.rejects(finish(db, nid, c.lease_token, "x", null));
});
