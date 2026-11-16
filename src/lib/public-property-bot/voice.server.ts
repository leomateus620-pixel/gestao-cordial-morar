import { z } from "zod";
import type { BotBrand } from "./contracts";
import type { PublicRepository } from "./repository.server";
import { BotError } from "./errors";
import { readBoundedBody } from "./transport";
import { redactIncidentalData } from "./privacy";
import { secondsToRenewal } from "./quota.server";
export const VOICE_MAX_BYTES = 10 * 1024 * 1024;
export const VOICE_MAX_SECONDS = 60;
export function voiceAvailable(env = process.env) {
  return !!(env.PUBLIC_BOT_VOICE_KEY || env.LOVABLE_API_KEY);
}

/** Inspect the actual container and every packet, not the MIME label or metadata duration. */
export async function inspectAudio(bytes: Uint8Array, declaredType: string, signal: AbortSignal) {
  const type = declaredType.split(";", 1)[0].trim().toLowerCase();
  if (!["audio/webm", "audio/mp4", "audio/ogg"].includes(type) || !bytes.length)
    throw new BotError("invalid_audio", 415);
  if (bytes.length > VOICE_MAX_BYTES) throw new BotError("audio_too_large", 413);
  const { Input, BufferSource, MP4, WEBM, OGG, EncodedPacketSink } = await import("mediabunny");
  const input = new Input({ formats: [MP4, WEBM, OGG], source: new BufferSource(bytes) });
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(5000)]);
  const dispose = () => input.dispose();
  deadline.addEventListener("abort", dispose, { once: true });
  try {
    deadline.throwIfAborted();
    const format = await input.getFormat();
    const actualType =
      format === MP4
        ? "audio/mp4"
        : format === WEBM
          ? "audio/webm"
          : format === OGG
            ? "audio/ogg"
            : null;
    if (actualType !== type) throw new BotError("invalid_audio", 415);
    const tracks = await input.getTracks();
    if (tracks.length !== 1 || !tracks[0].isAudioTrack()) throw new BotError("invalid_audio", 415);
    const track = tracks[0];
    const codec = await track.getCodec();
    if (codec !== "aac" && codec !== "opus" && codec !== "vorbis")
      throw new BotError("invalid_audio", 415);
    const channels = await track.getNumberOfChannels();
    const sampleRate = await track.getSampleRate();
    if (channels < 1 || channels > 2 || sampleRate < 8000 || sampleRate > 96000)
      throw new BotError("invalid_audio", 415);
    let first = Infinity,
      last = -Infinity,
      sum = 0,
      packets = 0,
      packetBytes = 0;
    for await (const packet of new EncodedPacketSink(track).packets(undefined, undefined, {
      skipLiveWait: true,
    })) {
      deadline.throwIfAborted();
      if (
        !Number.isFinite(packet.duration) ||
        !Number.isFinite(packet.timestamp) ||
        packet.duration < 0 ||
        packet.duration > 1 ||
        !packet.data.length
      )
        throw new BotError("invalid_audio", 415);
      first = Math.min(first, packet.timestamp);
      last = Math.max(last, packet.timestamp + packet.duration);
      sum += packet.duration;
      packetBytes += packet.data.length;
      packets++;
      if (
        packets > 30000 ||
        packetBytes > VOICE_MAX_BYTES ||
        last - first > VOICE_MAX_SECONDS + 0.1 ||
        sum > VOICE_MAX_SECONDS + 0.1
      )
        throw new BotError("audio_too_long", 413);
    }
    const seconds = Math.max(last - first, sum);
    if (!packets || !Number.isFinite(seconds) || seconds < 0.15)
      throw new BotError("empty_audio", 422);
    return {
      seconds,
      type: actualType,
      filename:
        actualType === "audio/mp4"
          ? "recording.m4a"
          : actualType === "audio/ogg"
            ? "recording.ogg"
            : "recording.webm",
    };
  } catch (error) {
    if (error instanceof BotError) throw error;
    if (signal.aborted) throw signal.reason;
    throw new BotError("invalid_audio", 415);
  } finally {
    deadline.removeEventListener("abort", dispose);
    input.dispose();
  }
}
async function providerTranscript(
  bytes: Uint8Array,
  audio: Awaited<ReturnType<typeof inspectAudio>>,
  signal: AbortSignal,
  fetcher: typeof fetch,
) {
  const key = process.env.PUBLIC_BOT_VOICE_KEY || process.env.LOVABLE_API_KEY;
  if (!key) throw new BotError("voice_unavailable");
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)], { type: audio.type }), audio.filename);
  form.append("model", process.env.PUBLIC_BOT_VOICE_MODEL || "openai/gpt-transcribe");
  form.append("language", "pt");
  form.append("response_format", "json");
  form.append("stream", "true");
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(15000)]);
  const response = await fetcher("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
    method: "POST",
    signal: deadline,
    headers: {
      Authorization: `Bearer ${key}`,
      "Lovable-API-Key": key,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: form,
  });
  if (!response.ok || !response.body) throw new BotError("voice_unavailable");
  const body = await readBoundedBody({ body: response.body, signal: deadline }, 64000).catch(() => {
    throw new BotError("voice_unavailable");
  });
  const raw = new TextDecoder().decode(body);
  let text = "";
  if (response.headers.get("content-type")?.includes("text/event-stream")) {
    let completed = false;
    for (const line of raw.split(/\r?\n/)) {
      if (!line.startsWith("data:") || line.slice(5).trim() === "[DONE]") continue;
      let event;
      try {
        event = JSON.parse(line.slice(5));
      } catch {
        throw new BotError("voice_unavailable");
      }
      if (event.type === "error") throw new BotError("voice_unavailable");
      if (event.type === "transcript.text.done" && typeof event.text === "string") {
        text = event.text;
        completed = true;
      }
    }
    if (!completed) throw new BotError("voice_unavailable");
  } else {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new BotError("voice_unavailable");
    }
    const parsed = z.object({ text: z.string().max(10000) }).safeParse(data);
    if (!parsed.success) throw new BotError("voice_unavailable");
    text = parsed.data.text;
  }
  const minimized = redactIncidentalData(text).trim().slice(0, 1800);
  if (!minimized || /^\[.*\]$/.test(minimized)) throw new BotError("empty_audio", 422);
  return minimized;
}
export async function transcribeRequest(
  request: Request,
  brand: BotBrand,
  tokenHash: string,
  identity: { key: string; day: string },
  repo: PublicRepository,
  fetcher: typeof fetch = fetch,
) {
  const requestId = z.string().uuid().parse(request.headers.get("x-request-id"));
  await repo.readSession(brand, tokenHash, request.signal);
  const bytes = await readBoundedBody(request, VOICE_MAX_BYTES, 30000);
  let accepted = false;
  let success = false;
  const started = Date.now();
  try {
    // Reserve a conservative minute before parsing or sending to a paid service. Replays never re-execute.
    const reservation = await repo.takeVoice(
      brand,
      tokenHash,
      identity,
      requestId,
      bytes.length,
      VOICE_MAX_SECONDS,
      request.signal,
    );
    if (reservation?.state !== "accepted") {
      if (reservation?.state === "unavailable") throw new BotError("voice_unavailable");
      const code =
        reservation?.state === "exhausted"
          ? "quota_exhausted"
          : reservation?.state === "burst"
            ? "burst"
            : "interrupted";
      throw new BotError(
        code,
        code === "interrupted" ? 409 : 429,
        code === "quota_exhausted" ? secondsToRenewal() : 60,
      );
    }
    accepted = true;
    const audio = await inspectAudio(
      bytes,
      request.headers.get("content-type") ?? "",
      request.signal,
    );
    const text = await providerTranscript(bytes, audio, request.signal, fetcher);
    success = true;
    return { text };
  } finally {
    bytes.fill(0);
    if (accepted) {
      if ((await repo.finishVoice(brand, tokenHash, requestId, success)) !== true)
        throw new BotError("interrupted", 409);
      await repo
        .usage(
          brand,
          requestId,
          process.env.PUBLIC_BOT_VOICE_MODEL || "openai/gpt-transcribe",
          Date.now() - started,
          0,
          0,
          success ? "voice_ok" : "voice_failed",
        )
        .catch(() => {});
    }
  }
}
