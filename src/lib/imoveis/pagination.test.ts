import assert from "node:assert/strict";
import test from "node:test";
import { paginationWindow } from "./pagination.ts";

test("lista todas as páginas quando são poucas", () => {
  assert.deepEqual(paginationWindow(0, 1), [0]);
  assert.deepEqual(paginationWindow(3, 7), [0, 1, 2, 3, 4, 5, 6]);
});

test("mantém início, fim e vizinhança da página atual com reticências", () => {
  assert.deepEqual(paginationWindow(0, 35), [0, 1, 2, 3, null, 34]);
  assert.deepEqual(paginationWindow(17, 35), [0, null, 16, 17, 18, null, 34]);
  assert.deepEqual(paginationWindow(34, 35), [0, null, 31, 32, 33, 34]);
});

test("nunca repete páginas nem coloca reticências entre vizinhas", () => {
  const window = paginationWindow(4, 35);
  const numbers = window.filter((p): p is number => p !== null);
  assert.deepEqual(numbers, Array.from(new Set(numbers)));
  window.forEach((item, index) => {
    if (item === null) {
      const before = window[index - 1] as number;
      const after = window[index + 1] as number;
      assert.ok(after - before > 1);
    }
  });
});
