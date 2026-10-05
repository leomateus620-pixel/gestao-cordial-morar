import test from "node:test";
import assert from "node:assert/strict";
import { enqueueImageJobs, withOwnedMorarTarget } from "./image-pipeline.server";

type Row = {
  id: string;
  destination_hash: string | null;
  desired_destination_hash: string | null;
  processing_status: string;
};

/** Admin falso: registra escritas e aplica filtros `in("id")`. */
function fakeAdmin(rows: Row[]) {
  const writes: Array<{ table: string; op: string; ids: string[]; values: unknown }> = [];
  const admin = {
    from(table: string) {
      let op = "select";
      let values: unknown = null;
      let ids: string[] | null = null;
      const chain: Record<string, unknown> = {
        select() {
          return chain;
        },
        maybeSingle() {
          return Promise.resolve({ data: null, error: null });
        },
        update(v: unknown) {
          op = "update";
          values = v;
          return chain;
        },
        upsert(v: unknown) {
          op = "upsert";
          values = v;
          writes.push({
            table,
            op,
            ids: (v as Row[]).map((r) => (r as unknown as { image_id: string }).image_id),
            values,
          });
          return Promise.resolve({ error: null });
        },
        eq() {
          return chain;
        },
        neq() {
          return chain;
        },
        is() {
          return chain;
        },
        or() {
          return chain;
        },
        in(col: string, list: string[]) {
          if (col === "id" || col === "image_id") ids = list;
          return chain;
        },
        then(resolve: (r: unknown) => void) {
          if (op === "select") {
            const data = ids ? rows.filter((r) => ids!.includes(r.id)) : rows;
            return resolve({ data, error: null });
          }
          writes.push({ table, op, ids: ids ?? [], values });
          return resolve({ data: (ids ?? []).map((id) => ({ id })), error: null });
        },
      };
      return chain;
    },
  };
  return { admin, writes };
}

const HASH = "morar-cordial@v2";
const legacy = (id: string): Row => ({
  id,
  destination_hash: null,
  desired_destination_hash: null,
  processing_status: "legacy",
});
const current = (id: string): Row => ({
  id,
  destination_hash: HASH,
  desired_destination_hash: HASH,
  processing_status: "ready",
});

test("lote automático ignora fotos legadas e não enfileira nada", async () => {
  const { admin, writes } = fakeAdmin([legacy("a"), legacy("b"), current("c")]);
  const result = await enqueueImageJobs(admin, "p", { targets: ["cordial", "morar"] });
  assert.equal(result.enqueued, 0);
  assert.equal(writes.length, 0);
});

test("pedido que nomeia uma foto legada adota só aquela foto", async () => {
  const { admin, writes } = fakeAdmin([legacy("a"), legacy("b"), current("c")]);
  const result = await enqueueImageJobs(admin, "p", {
    targets: ["cordial", "morar"],
    imageIds: ["a"],
  });
  assert.equal(result.enqueued, 1);
  const adopt = writes.find(
    (w) => w.op === "update" && (w.values as Row).desired_destination_hash === HASH,
  );
  assert.deepEqual(adopt?.ids, ["a"]);
  const jobs = writes.find((w) => w.op === "upsert");
  assert.deepEqual(jobs?.ids, ["a"]);
  assert.ok(!writes.some((w) => w.ids.includes("b")));
});

test("recuperação forçada sem legado não toca fotos antigas", async () => {
  const { admin, writes } = fakeAdmin([legacy("a"), current("c")]);
  await enqueueImageJobs(admin, "p", {
    targets: ["cordial", "morar"],
    imageIds: ["c"],
    force: true,
  });
  assert.ok(!writes.some((w) => w.ids.includes("a")));
});

function ownChannel(row: unknown, error: unknown = null) {
  return {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error }) }) }),
    }),
  };
}

test("intenção própria Morar autoriza logo sem depender de publicação externa", async () => {
  const own = ownChannel({ state: "draft", morar_authorized: true, manual_withdrawn: false });
  assert.deepEqual(await withOwnedMorarTarget(own, "p", []), ["morar"]);
  assert.deepEqual(await withOwnedMorarTarget(own, "p", ["cordial"]), ["cordial", "morar"]);
});

test("retirada, autorização nula e vínculo desconhecido não autorizam marca Morar", async () => {
  for (const row of [
    null,
    { state: "withdrawn", morar_authorized: true, manual_withdrawn: false },
    { state: "draft", morar_authorized: true, manual_withdrawn: true },
    { state: "draft", morar_authorized: null, manual_withdrawn: false },
    { state: "draft", morar_authorized: true, manual_withdrawn: null },
  ])
    assert.deepEqual(await withOwnedMorarTarget(ownChannel(row), "p", ["cordial"]), ["cordial"]);
});

test("schema ainda não ativado preserva pipeline; falha transitória não escolhe marca silenciosamente", async () => {
  assert.deepEqual(
    await withOwnedMorarTarget(ownChannel(null, { code: "PGRST205" }), "p", ["cordial"]),
    ["cordial"],
  );
  await assert.rejects(
    () =>
      withOwnedMorarTarget(ownChannel(null, { code: "503", message: "Indisponível" }), "p", [
        "cordial",
      ]),
    /Indisponível/,
  );
});
