import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { visitorSelection } from "../../src/lib/selecoes/visitor-store";

test("visitor selection persists IDs only, synchronizes another tab, bounds additions and remains usable without storage", () => {
  const originals = ["window", "localStorage"].map(
    (name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const,
  );
  const target = new EventTarget(),
    storage = new Map<string, string>();
  const key = "cordial:visitor-selection:v1";
  const first = randomUUID(),
    second = randomUUID();
  storage.set(key, JSON.stringify([first, "PRIVATE-DATA", first]));
  const local = {
    getItem: (name: string) => storage.get(name) ?? null,
    setItem: (name: string, value: string) => {
      storage.set(name, value);
    },
  };
  try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: target });
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: local });
    assert.deepEqual(visitorSelection.get(), [first]);
    assert.equal(visitorSelection.toggle(second), true);
    assert.deepEqual(JSON.parse(storage.get(key)!), [first, second]);
    assert.equal(visitorSelection.toggle("PRIVATE-NOTE"), false);
    storage.set(key, JSON.stringify([second]));
    const event = new Event("storage");
    Object.defineProperty(event, "key", { value: key });
    target.dispatchEvent(event);
    assert.deepEqual(visitorSelection.get(), [second]);
    for (let index = 0; index < 19; index++)
      assert.equal(visitorSelection.toggle(randomUUID()), true);
    const full = [...visitorSelection.get()];
    assert.equal(visitorSelection.toggle(randomUUID()), false);
    assert.deepEqual(visitorSelection.get(), full);
    visitorSelection.move(second, 1);
    assert.equal(visitorSelection.get()[1], second);
    visitorSelection.clear();
    assert.deepEqual(visitorSelection.get(), []);
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
    });
    assert.equal(visitorSelection.toggle(first), true);
    assert.deepEqual(visitorSelection.get(), [first]);
  } finally {
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});
