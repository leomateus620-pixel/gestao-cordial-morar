import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  cleanupDuplicateOriginalUploads,
  recoverPersistedOriginalUploads,
} from "./image-upload-recovery.server";

function providerHarness(options: {
  arrived?: boolean;
  ageHours?: number;
  attempts?: number;
  status?: "reserved" | "missing";
  storageError?: boolean;
}) {
  const updates: Array<Record<string, unknown>> = [];
  const finalized: string[] = [];
  const marked: string[] = [];
  const reservation = {
    id: "upload-1",
    property_id: "property-1",
    storage_path: "property-1/originais/photo.jpg",
    created_at: new Date(Date.now() - (options.ageHours ?? 1) * 3_600_000).toISOString(),
    attempts: options.attempts ?? 0,
    status: options.status ?? "reserved",
  };
  const admin = {
    from(table: string) {
      assert.equal(table, "property_image_upload_reservations");
      return {
        select() {
          return {
            eq() { return this; },
            in() { return this; },
            lte() { return this; },
            order() { return this; },
            limit: async () => ({ data: [reservation], error: null }),
          };
        },
        update(patch: Record<string, unknown>) {
          updates.push(patch);
          return {
            eq() { return this; },
            in() { return this; },
            then(resolve: (value: unknown) => void) {
              resolve({ error: null });
            },
          };
        },
      };
    },
    storage: {
      from(bucket: string) {
        assert.equal(bucket, "property-images");
        return {
          async list(directory: string) {
            assert.equal(directory, "property-1/originais");
            return options.storageError
              ? { data: null, error: new Error("storage unavailable") }
              : { data: options.arrived
                ? [{ name: "photo.jpg", metadata: { size: 100 } }]
                : [], error: null };
          },
        };
      },
    },
    async rpc(name: string, params: { _reservation_id: string }) {
      if (name === "property_image_upload_mark_missing") {
        marked.push(params._reservation_id);
        return { data: true, error: null };
      }
      assert.equal(name, "property_image_upload_finalize");
      finalized.push(params._reservation_id);
      return { data: { status: "registered", imageId: "image-1" }, error: null };
    },
  };
  return { admin: admin as unknown as SupabaseClient, updates, finalized, marked };
}

test("watchdog registra original que chegou ao Storage depois de fechar a aba", async () => {
  const harness = providerHarness({ arrived: true });
  assert.deepEqual(await recoverPersistedOriginalUploads(harness.admin), {
    registered: 1, missing: 0, deferred: 0,
  });
  assert.deepEqual(harness.finalized, ["upload-1"]);
  assert.equal(harness.updates.length, 0);
});

test("original ainda ausente fica pendente e só vira falta específica após 24 horas", async () => {
  const recent = providerHarness({ ageHours: 1 });
  assert.equal((await recoverPersistedOriginalUploads(recent.admin)).deferred, 1);
  assert.equal(recent.updates[0]?.status, undefined);
  const afterOutage = providerHarness({ ageHours: 25, attempts: 0 });
  assert.equal((await recoverPersistedOriginalUploads(afterOutage.admin)).deferred, 1);
  assert.equal(afterOutage.marked.length, 0);
  const old = providerHarness({ ageHours: 25, attempts: 2 });
  assert.equal((await recoverPersistedOriginalUploads(old.admin)).missing, 1);
  assert.deepEqual(old.marked, ["upload-1"]);
  assert.equal(old.updates.length, 0);
});

test("falha do Storage não é interpretada como ausência do arquivo", async () => {
  const harness = providerHarness({ ageHours: 25, storageError: true });
  const originalError = console.error;
  console.error = () => undefined;
  try {
    assert.equal((await recoverPersistedOriginalUploads(harness.admin)).deferred, 1);
  } finally {
    console.error = originalError;
  }
  assert.equal(harness.updates[0]?.status, undefined);
  assert.equal(harness.finalized.length, 0);
});

test("objeto que aparece após falta confirmada ainda é recuperado", async () => {
  const harness = providerHarness({ ageHours: 26, status: "missing", arrived: true });
  assert.equal((await recoverPersistedOriginalUploads(harness.admin)).registered, 1);
  assert.deepEqual(harness.finalized, ["upload-1"]);
});

test("limpeza remove somente original duplicado sem referência local", async () => {
  const removed: string[] = [];
  const updates: Array<Record<string, unknown>> = [];
  const admin = {
    from(table: string) {
      if (table === "property_images") {
        return {
          select() {
            return { eq: async () => ({ count: 0, error: null }) };
          },
        };
      }
      assert.equal(table, "property_image_upload_reservations");
      return {
        select() {
          return {
            eq() { return this; }, is() { return this; },
            lte() { return this; }, order() { return this; },
            limit: async () => ({
              data: [{ id: "duplicate-1", storage_path: "p/originais/extra.jpg" }],
              error: null,
            }),
          };
        },
        update(patch: Record<string, unknown>) {
          updates.push(patch);
          return {
            eq() { return this; },
            then(resolve: (value: unknown) => void) { resolve({ error: null }); },
          };
        },
      };
    },
    storage: {
      from() {
        return { async remove(paths: string[]) {
          removed.push(...paths);
          return { error: null };
        } };
      },
    },
  };
  assert.equal(await cleanupDuplicateOriginalUploads(admin as unknown as SupabaseClient), 1);
  assert.deepEqual(removed, ["p/originais/extra.jpg"]);
  assert.equal(typeof updates[0]?.storage_cleaned_at, "string");
});
