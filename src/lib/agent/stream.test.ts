import { test } from "node:test";
import assert from "node:assert/strict";
import { readAssistantStream, type AssistantEvent } from "./stream";
test("NDJSON survives byte-by-byte chunks including accented characters", async () => {
  const bytes = new TextEncoder().encode(
    '{"type":"text","delta":"Olá, imóvel!"}\n{"type":"done"}\n',
  );
  const response = new Response(
    new ReadableStream({
      start(c) {
        for (const byte of bytes) c.enqueue(new Uint8Array([byte]));
        c.close();
      },
    }),
  );
  const events: AssistantEvent[] = [];
  await readAssistantStream(response, (e) => events.push(e));
  assert.deepEqual(events, [{ type: "text", delta: "Olá, imóvel!" }, { type: "done" }]);
});
test("a stream ending without a terminal event reports incomplete response", async () => {
  await assert.rejects(
    () => readAssistantStream(new Response('{"type":"text","delta":"parcial"}\n'), () => {}),
    /interrompida/,
  );
});
