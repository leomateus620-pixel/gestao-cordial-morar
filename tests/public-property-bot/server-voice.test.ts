import test from "node:test";
import assert from "node:assert/strict";
import {
  BufferTarget,
  EncodedAudioPacketSource,
  EncodedPacket,
  Output,
  WebMOutputFormat,
  Mp4OutputFormat,
} from "mediabunny";
import {
  inspectAudio,
  transcribeRequest,
  VOICE_MAX_BYTES,
} from "../../src/lib/public-property-bot/voice.server";
import { BotError } from "../../src/lib/public-property-bot/errors";
import type { PublicRepository } from "../../src/lib/public-property-bot/repository.server";
const signal = new AbortController().signal;
// Synthetic test-only Opus silence packets. No production audio is stored or used.
async function audioFixture(seconds: number, format: "webm" | "mp4" = "webm") {
  const target = new BufferTarget();
  const output = new Output({
    format: format === "webm" ? new WebMOutputFormat() : new Mp4OutputFormat(),
    target,
  });
  const source = new EncodedAudioPacketSource("opus");
  output.addAudioTrack(source);
  await output.start();
  const head = new Uint8Array([
    79, 112, 117, 115, 72, 101, 97, 100, 1, 1, 0, 0, 128, 187, 0, 0, 0, 0, 0,
  ]);
  for (let index = 0; index < Math.ceil(seconds / 0.02); index++)
    await source.add(
      new EncodedPacket(new Uint8Array([0xf8, 0xff, 0xfe]), "key", index * 0.02, 0.02),
      index === 0
        ? {
            decoderConfig: {
              codec: "opus",
              sampleRate: 48000,
              numberOfChannels: 1,
              description: head,
            },
          }
        : undefined,
    );
  await output.finalize();
  return new Uint8Array(target.buffer!);
}
test("actual WebM and MP4 packet durations are scanned without trusting MIME or declared length", async () => {
  for (const format of ["webm", "mp4"] as const) {
    const bytes = await audioFixture(0.4, format);
    const info = await inspectAudio(bytes, `audio/${format}`, signal);
    assert(info.seconds >= 0.39 && info.seconds < 0.5);
    assert.equal(info.type, `audio/${format}`);
  }
});
test("wrong MIME, arbitrary file, empty clip and excess actual duration are rejected", async () => {
  const bytes = await audioFixture(0.4);
  await assert.rejects(
    () => inspectAudio(bytes, "audio/mp4", signal),
    (e) => e instanceof BotError && e.code === "invalid_audio",
  );
  await assert.rejects(() =>
    inspectAudio(new TextEncoder().encode("<html>not an audio file</html>"), "audio/webm", signal),
  );
  await assert.rejects(
    () => inspectAudio(new Uint8Array(VOICE_MAX_BYTES + 1), "audio/webm", signal),
    (e) => e instanceof BotError && e.code === "audio_too_large",
  );
  await assert.rejects(() => inspectAudio(awaitedLong!, "audio/webm", signal));
});
let awaitedLong: Uint8Array;
test.before(async () => {
  awaitedLong = await audioFixture(60.3);
});
test("cancel stops container work", async () => {
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(() => inspectAudio(awaitedLong, "audio/webm", abort.signal));
});
test("reservation precedes paid transcription; text is returned for review only and audio is not stored", async () => {
  const previous = process.env.PUBLIC_BOT_VOICE_KEY;
  process.env.PUBLIC_BOT_VOICE_KEY = "synthetic-test-key";
  let reserved = 0,
    finished: boolean | undefined,
    providerCalls = 0;
  const repo = {
    readSession: async () => ({}),
    takeVoice: async () => {
      reserved++;
      return { state: "accepted" };
    },
    finishVoice: async (_b: unknown, _h: unknown, _id: unknown, ok: boolean) => {
      finished = ok;
      return true;
    },
    usage: async () => true,
  } as unknown as PublicRepository;
  try {
    const bytes = await audioFixture(0.4);
    const request = new Request("https://cordialimoveis.com/api/cordial-site/bot/transcribe", {
      method: "POST",
      headers: {
        "content-type": "audio/webm",
        "x-request-id": "00000000-0000-4000-8000-000000000001",
      },
      body: bytes,
    });
    const result = await transcribeRequest(
      request,
      "cordial",
      "hash",
      { key: "ip", day: "2026-11-16" },
      repo,
      async (_input, init) => {
        assert.equal(reserved, 1);
        providerCalls++;
        assert(init?.body instanceof FormData);
        return Response.json({ text: "Casa com três quartos" });
      },
    );
    assert.deepEqual(result, { text: "Casa com três quartos" });
    assert.equal(providerCalls, 1);
    assert.equal(finished, true);
  } finally {
    if (previous === undefined) delete process.env.PUBLIC_BOT_VOICE_KEY;
    else process.env.PUBLIC_BOT_VOICE_KEY = previous;
  }
});
test("voice retry and exhausted reservation never invoke paid provider", async () => {
  let paid = 0;
  const bytes = await audioFixture(0.4);
  const repo = {
    readSession: async () => ({}),
    takeVoice: async () => ({ state: "interrupted" }),
  } as unknown as PublicRepository;
  const request = new Request("https://cordialimoveis.com/api/cordial-site/bot/transcribe", {
    method: "POST",
    headers: {
      "content-type": "audio/webm",
      "x-request-id": "00000000-0000-4000-8000-000000000002",
    },
    body: bytes,
  });
  await assert.rejects(
    () =>
      transcribeRequest(
        request,
        "cordial",
        "hash",
        { key: "ip", day: "2026-11-16" },
        repo,
        async () => {
          paid++;
          return Response.json({ text: "never" });
        },
      ),
    (e) => e instanceof BotError && e.code === "interrupted",
  );
  assert.equal(paid, 0);
});

test("incomplete, malformed and empty transcription responses never become a successful dictation", async () => {
  const previous = process.env.PUBLIC_BOT_VOICE_KEY;
  process.env.PUBLIC_BOT_VOICE_KEY = "synthetic-test-key";
  const cases = [
    {
      response: new Response(
        'data: {"type":"transcript.text.delta","delta":"Casa"}\n\ndata: [DONE]\n',
        { headers: { "content-type": "text/event-stream" } },
      ),
      code: "voice_unavailable",
    },
    {
      response: Response.json({ transcript: "Unexpected provider shape" }),
      code: "voice_unavailable",
    },
    { response: Response.json({ text: "   " }), code: "empty_audio" },
    {
      response: new Response(
        'data: {"type":"transcript.text.done","text":"Casa"}\n\ndata: {"type":"error"}\n',
        { headers: { "content-type": "text/event-stream" } },
      ),
      code: "voice_unavailable",
    },
  ];
  try {
    for (const entry of cases) {
      let completed: boolean | undefined;
      const repo = {
        readSession: async () => ({}),
        takeVoice: async () => ({ state: "accepted" }),
        finishVoice: async (_b: unknown, _h: unknown, _id: unknown, ok: boolean) => {
          completed = ok;
          return true;
        },
        usage: async () => true,
      } as unknown as PublicRepository;
      const request = new Request("https://cordialimoveis.com/api/cordial-site/bot/transcribe", {
        method: "POST",
        headers: {
          "content-type": "audio/webm",
          "x-request-id": "00000000-0000-4000-8000-000000000005",
        },
        body: await audioFixture(0.4),
      });
      await assert.rejects(
        () =>
          transcribeRequest(
            request,
            "cordial",
            "hash",
            { key: "ip", day: "2026-11-16" },
            repo,
            async () => entry.response,
          ),
        (error) => error instanceof BotError && error.code === entry.code,
      );
      assert.equal(completed, false);
    }
  } finally {
    if (previous === undefined) delete process.env.PUBLIC_BOT_VOICE_KEY;
    else process.env.PUBLIC_BOT_VOICE_KEY = previous;
  }
});

test("completed transcription is redacted, remains usable on telemetry failure and requires durable quota completion", async () => {
  const previous = process.env.PUBLIC_BOT_VOICE_KEY;
  process.env.PUBLIC_BOT_VOICE_KEY = "synthetic-test-key";
  try {
    for (const durable of [true, false]) {
      const repo = {
        readSession: async () => ({}),
        takeVoice: async () => ({ state: "accepted" }),
        finishVoice: async () => durable,
        usage: async () => {
          throw new Error("telemetry-down");
        },
      } as unknown as PublicRepository;
      const request = new Request("https://cordialimoveis.com/api/cordial-site/bot/transcribe", {
        method: "POST",
        headers: {
          "content-type": "audio/webm",
          "x-request-id": "00000000-0000-4000-8000-000000000006",
        },
        body: await audioFixture(0.4),
      });
      const run = () =>
        transcribeRequest(
          request,
          "cordial",
          "hash",
          { key: "ip", day: "2026-11-16" },
          repo,
          async () =>
            new Response(
              'data: {"type":"transcript.text.done","text":"Casa até 650 mil, meu CPF 123.456.789-10"}\n',
              { headers: { "content-type": "text/event-stream" } },
            ),
        );
      if (durable) {
        const result = await run();
        assert.match(result.text, /Casa até 650 mil/);
        assert(!result.text.includes("123.456.789-10"));
      } else
        await assert.rejects(
          run,
          (error) => error instanceof BotError && error.code === "interrupted",
        );
    }
  } finally {
    if (previous === undefined) delete process.env.PUBLIC_BOT_VOICE_KEY;
    else process.env.PUBLIC_BOT_VOICE_KEY = previous;
  }
});
