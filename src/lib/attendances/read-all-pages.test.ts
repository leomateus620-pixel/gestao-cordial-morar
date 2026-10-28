import test from "node:test";
import assert from "node:assert/strict";
import { readAllAttendancePages } from "./read-all-pages";

for (const total of [0, 1, 15, 40, 500, 1203]) {
  test(`loads all ${total} authorized rows even if the server caps ranges below requested size`, async () => {
    const rows = Array.from({ length: total }, (_, index) => ({ id: `${index}` }));
    const starts: number[] = [];
    const result = await readAllAttendancePages(async (from, to) => {
      starts.push(from);
      return { data: rows.slice(from, Math.min(to + 1, from + 73)), count: total, error: null };
    });
    assert.deepEqual(result, rows);
    assert.equal(new Set(result.map((row) => row.id)).size, total);
    assert.equal(starts.length, Math.max(1, Math.ceil(total / 73)));
  });
}

test("a page failure never returns the already accumulated partial list", async () => {
  await assert.rejects(
    readAllAttendancePages(async (from) =>
      from === 0
        ? { data: [{ id: "a" }], count: 2, error: null }
        : { data: null, count: null, error: { message: "server unavailable" } },
    ),
    /server unavailable/,
  );
});

test("empty page before exact count and unconfirmed counts are explicit failures", async () => {
  await assert.rejects(
    readAllAttendancePages(async () => ({ data: [], count: 1, error: null })),
    /incompleta/,
  );
  await assert.rejects(
    readAllAttendancePages(async () => ({ data: [], count: null, error: null })),
    /confirmar/,
  );
});

test("a concurrent insert/delete or shifted duplicate cannot masquerade as a complete list", async () => {
  await assert.rejects(
    readAllAttendancePages(async (from) => ({
      data: [{ id: `${from}` }],
      count: from === 0 ? 2 : 3,
      error: null,
    })),
    /alterada/,
  );
  await assert.rejects(
    readAllAttendancePages(async () => ({
      data: [{ id: "same" }],
      count: 2,
      error: null,
    })),
    /alterada/,
  );
});
