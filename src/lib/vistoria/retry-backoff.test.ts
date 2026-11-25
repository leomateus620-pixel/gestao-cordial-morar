import assert from "node:assert/strict";
import test from "node:test";
import { backoffDelay, isDue, MAX_ATTEMPTS, nextWakeIn } from "./retry-backoff";

test("espera crescente 2/4/8/16 s com teto de 60 s", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 10].map(backoffDelay), [2000, 4000, 8000, 16000, 32000, 60000, 60000]);
});

test("para em 5 tentativas e não trava os outros", () => {
  const now = 1000;
  assert.equal(MAX_ATTEMPTS, 5);
  assert.equal(isDue({ status: "erro", attempts: 5 }, now), false);
  assert.equal(isDue({ status: "erro", attempts: 2, nextAttemptAt: now + 1 }, now), false);
  assert.equal(isDue({ status: "local", attempts: 0 }, now), true);
  assert.equal(isDue({ status: "erro", attempts: 2, nextAttemptAt: now }, now), true);
  assert.equal(
    nextWakeIn(
      [
        { status: "erro", attempts: 1, nextAttemptAt: now + 4000 },
        { status: "erro", attempts: 1, nextAttemptAt: now + 2000 },
        { status: "erro", attempts: 5, nextAttemptAt: now + 100 },
      ],
      now,
    ),
    2000,
  );
  assert.equal(nextWakeIn([{ status: "local", attempts: 0 }], now), null);
});
