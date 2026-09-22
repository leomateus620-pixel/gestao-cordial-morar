import assert from "node:assert/strict";
import { test } from "node:test";
import { canStartRebuildEffect, rebuildRemoteOrderDurable } from "./media-rebuild.server";

test("reconstruction reserves time for the remote effect and its checkpoint", () => {
  assert.equal(canStartRebuildEffect(99_999, "insert"), false);
  assert.equal(canStartRebuildEffect(100_000, "insert"), true);
  assert.equal(canStartRebuildEffect(79_999, "delete"), false);
  assert.equal(canStartRebuildEffect(80_000, "delete"), true);
});

test("a budget drop after preparing the upload defers before the remote POST", async () => {
  const checkpoint = {
    revision: 7,
    phase: "reinserting" as const,
    deleteRemoteIds: [],
    reinsertImageIds: ["image-a"],
    deleteIndex: 0,
    insertIndex: 0,
    keptPrefix: 0,
  };
  const writes: Array<Record<string, unknown>> = [];
  const admin = {
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              if (table === "property_provider_publications") {
                return { single: async () => ({ data: { media_rebuild_state: checkpoint }, error: null }) };
              }
              return Promise.resolve({ data: [], error: null });
            },
          };
        },
      };
    },
    async rpc(_name: string, args: Record<string, unknown>) {
      writes.push(args);
      return { data: true, error: null };
    },
    storage: {
      from() {
        return { download: async () => ({ data: new Blob([new Uint8Array([1, 2, 3])]), error: null }) };
      },
    },
  };
  let remaining = 110_000;
  let progressCalls = 0;
  const result = await rebuildRemoteOrderDurable(admin as never, {
    propertyId: "property-a",
    provider: "cordial",
    publicationId: "publication-a",
    externalId: "4355160",
    correlationId: "test-correlation",
    jobId: "job-a",
    leaseToken: "lease-a",
    galleryRevision: 7,
    desiredImageIds: ["image-a"],
    contentDrift: [],
    gallery: { reliable: true, reason: null, items: [] },
    byId: new Map([["image-a", {
      id: "image-a", storage_path: "original-a", processed_storage_path: null,
      processed_checksum: null, content_hash: "hash-a", file_name: "a.jpg",
      mime_type: "image/jpeg", position: 0,
    }]]),
    remainingMs: () => remaining,
    progress: async () => {
      progressCalls += 1;
      if (progressCalls === 2) remaining = 99_999;
    },
  });

  assert.equal(result.reason, "continuacao_agendada");
  assert.equal(result.pending, true);
  assert.equal(result.checkpoint?.operation, undefined);
  assert.equal(progressCalls, 2);
  assert.ok(writes.some((write) => (write["_fields"] as Record<string, unknown>)?.["last_op_state"] === "deferred_no_post"));
});
