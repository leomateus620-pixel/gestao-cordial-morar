import assert from "node:assert/strict";
import test from "node:test";
type ListResult = { total: number; byStatus: Record<string, number> };
import {
  inspectionDatabase,
  snapshot,
  finalize,
  id,
  userId,
  otherId,
  roomId,
  itemId,
  sha,
} from "./database";
test("qualquer filho muda a revisão agregada e rejeita PDF obsoleto", async () => {
  const db = await inspectionDatabase();
  try {
    for (const sql of [
      `UPDATE inspection_items SET color='Bege' WHERE id='${itemId}'`,
      `UPDATE inspection_rooms SET name='Sala atualizada' WHERE id='${roomId}'`,
      `INSERT INTO inspection_notes(inspection_id,room_id,client_key,source,status,transcript_original) VALUES('${id}','${roomId}','note-test-001','texto','revisado','Observado')`,
      `INSERT INTO inspection_media(inspection_id,room_id,client_key,storage_path,mime,size_bytes,status) VALUES('${id}','${roomId}','photo-test-001','${id}/${roomId}/photo-test-001.jpg','image/jpeg',100,'confirmada')`,
    ]) {
      const old = await snapshot(db);
      await db.exec(sql);
      const current = await snapshot(db);
      assert.ok(current.inspection.revision > old.inspection.revision);
      await assert.rejects(finalize(db, old), /mudou/);
    }
  } finally {
    await db.close();
  }
});
test("snapshot declarado pelo cliente não pode divergir do canônico", async () => {
  const db = await inspectionDatabase();
  try {
    const snap = await snapshot(db);
    snap.items[0].color = "falsificado";
    await assert.rejects(finalize(db, snap), /dados do laudo mudaram/);
  } finally {
    await db.close();
  }
});
test("reabertura não altera bytes/hash/caminho/snapshot do documento anterior", async () => {
  const db = await inspectionDatabase();
  try {
    const snap = await snapshot(db);
    await finalize(db, snap);
    const before = (await db.query(`SELECT * FROM inspection_documents`)).rows;
    await assert.rejects(
      db.exec(`UPDATE inspection_items SET color='x' WHERE id='${itemId}'`),
      /indisponível/,
    );
    const rev = (await snapshot(db)).inspection.revision;
    await db.query("SELECT inspection_reopen($1,$2,$3)", [id, rev, "Correção observada"]);
    await db.exec(`UPDATE inspection_items SET color='nova versão' WHERE id='${itemId}'`);
    await finalize(db, await snapshot(db), 2);
    assert.deepEqual(
      (await db.query(`SELECT * FROM inspection_documents WHERE version=1`)).rows,
      before,
    );
  } finally {
    await db.close();
  }
});
test("RLS isola corretor, filhos e contagens", async () => {
  const db = await inspectionDatabase();
  try {
    await db.exec(
      `SET ROLE authenticated;SELECT set_config('request.jwt.claim.sub','${otherId}',false)`,
    );
    assert.equal((await db.query(`SELECT * FROM inspections`)).rows.length, 0);
    assert.equal((await db.query(`SELECT * FROM inspection_items`)).rows.length, 0);
    const result = (
      await db.query<{ result: ListResult }>(
        `SELECT inspection_list(NULL,NULL,NULL,NULL,NULL,NULL,'inspected_at',NULL,0) result`,
      )
    ).rows[0].result;
    assert.equal(result.total, 0);
    await assert.rejects(snapshot(db), /Sem acesso/);
  } finally {
    await db.close();
  }
});
test("agência, busca, período e contagens compartilham o mesmo escopo", async () => {
  const db = await inspectionDatabase();
  try {
    const list = async (agency: string | null, from: string | null, dateField = "inspected_at") =>
      (
        await db.query<{ result: ListResult }>(
          `SELECT inspection_list('1409',NULL,NULL,$1,$2,NULL,$3,NULL,0) result`,
          [agency, from, dateField],
        )
      ).rows[0].result;
    assert.equal((await list("morar", null)).total, 0);
    assert.deepEqual((await list("morar", null)).byStatus, {});
    assert.equal((await list("cordial", "2026-10-20T00:00:00Z")).total, 1);
    assert.equal((await list("cordial", "2026-10-21T00:00:00Z")).total, 0);
    await db.exec(`UPDATE inspections SET created_at='2026-10-01' WHERE id='${id}'`);
    assert.equal((await list("cordial", "2026-10-19", "created_at")).total, 0);
    assert.equal((await list("cordial", "2026-10-19")).total, 1);
  } finally {
    await db.close();
  }
});
test("navegador não registra PDF oficial por RPC direta", async () => {
  const db = await inspectionDatabase();
  try {
    const snap = await snapshot(db);
    await db.exec("SET ROLE authenticated");
    await assert.rejects(finalize(db, snap), /permission denied/);
    await assert.rejects(
      db.query(`SELECT inspection_finalize_server($1,$2,1,'x',1,'x','{}')`, [userId, id]),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
test("emissão pelo servidor respeita o ator e registra o snapshot canônico", async () => {
  const db = await inspectionDatabase();
  try {
    const snap = await snapshot(db),
      path = `${id}/docs/v1-${sha.slice(0, 16)}.pdf`;
    await db.query("INSERT INTO storage.objects VALUES('inspection-media',$1)", [path]);
    await db.exec("SET ROLE service_role");
    const emit = (actor: string | null) =>
      db.query("SELECT inspection_finalize_server($1,$2,$3,$4,100,$5,$6)", [
        actor,
        id,
        snap.inspection.revision,
        path,
        sha,
        snap,
      ]);
    await assert.rejects(emit(null), /Autor obrigatório/);
    await assert.rejects(emit(otherId), /Sem acesso/);
    await emit(userId);
    await db.exec("RESET ROLE");
    const stored = (
      await db.query<{ snapshot: unknown }>("SELECT snapshot FROM inspection_documents")
    ).rows[0].snapshot;
    assert.deepEqual(stored, snap);
  } finally {
    await db.close();
  }
});
test("inserir/remover filhos avança a revisão e alterar ambientes exige reconfirmação", async () => {
  const db = await inspectionDatabase();
  try {
    const before = await snapshot(db);
    await db.exec(
      `INSERT INTO inspection_items(inspection_id,room_id,name,state) VALUES('${id}','${roomId}','Porta','nao_se_aplica')`,
    );
    assert.ok((await snapshot(db)).inspection.revision > before.inspection.revision);
    await assert.rejects(finalize(db, before), /mudou/);
    const added = await snapshot(db);
    await db.exec("DELETE FROM inspection_items WHERE name='Porta'");
    assert.ok((await snapshot(db)).inspection.revision > added.inspection.revision);
    await db.exec(`INSERT INTO inspection_rooms(inspection_id,name) VALUES('${id}','Cozinha')`);
    assert.equal((await snapshot(db)).inspection.plan_confirmed, false);
  } finally {
    await db.close();
  }
});
test("ordenação de fotos é atômica e rejeita lista duplicada ou revisão antiga", async () => {
  const db = await inspectionDatabase();
  try {
    const ids = ["60000000-0000-4000-8000-000000000001", "60000000-0000-4000-8000-000000000002"];
    for (const [i, photoId] of ids.entries())
      await db.query(
        `INSERT INTO inspection_media(id,inspection_id,room_id,client_key,storage_path,mime,size_bytes,status,position) VALUES($1,$2,$3,$4,$5,'image/jpeg',100,'confirmada',$6)`,
        [photoId, id, roomId, `photo-test-${i}`, `${id}/${roomId}/p-${i}.jpg`, i],
      );
    const before = await snapshot(db);
    await assert.rejects(
      db.query("SELECT inspection_reorder_media($1,$2,$3,$4)", [
        id,
        roomId,
        before.inspection.revision,
        [ids[0], ids[0]],
      ]),
      /inválida/,
    );
    assert.deepEqual(
      (await snapshot(db)).media.map((m) => m.id),
      ids,
    );
    await db.query("SELECT inspection_reorder_media($1,$2,$3,$4)", [
      id,
      roomId,
      before.inspection.revision,
      [...ids].reverse(),
    ]);
    assert.deepEqual(
      (await snapshot(db)).media.map((m) => m.id),
      [...ids].reverse(),
    );
    await assert.rejects(
      db.query("SELECT inspection_reorder_media($1,$2,$3,$4)", [
        id,
        roomId,
        before.inspection.revision,
        ids,
      ]),
      /ordem mudou/,
    );
  } finally {
    await db.close();
  }
});
test("criação com checklist inválido reverte toda a transação", async () => {
  const db = await inspectionDatabase();
  try {
    const newId = "10000000-0000-4000-8000-000000000009";
    const input = { ...(await snapshot(db)).inspection, id: newId };
    const rooms = [{ name: "Sala", kind: "sala", items: [{ name: "", category: "base" }] }];
    await assert.rejects(db.query("SELECT inspection_create($1,$2)", [input, rooms]));
    assert.equal(
      (await db.query("SELECT id FROM inspections WHERE id=$1", [newId])).rows.length,
      0,
    );
    rooms[0].items[0].name = "Piso";
    await db.query("SELECT inspection_create($1,$2)", [input, rooms]);
    await db.query("SELECT inspection_create($1,$2)", [input, rooms]);
    assert.equal(
      (await db.query("SELECT id FROM inspection_rooms WHERE inspection_id=$1", [newId])).rows
        .length,
      1,
    );
  } finally {
    await db.close();
  }
});
