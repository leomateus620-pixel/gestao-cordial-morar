import { BotError } from "./errors";
/** Bound bytes while reading and end slow/stalled uploads; Content-Length is never authority. */
export async function readBoundedBody(
  request: Pick<Request, "body"> & { signal?: AbortSignal },
  maxBytes: number,
  timeoutMs = 15000,
): Promise<Uint8Array> {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const signal = AbortSignal.any([
    AbortSignal.timeout(timeoutMs),
    ...(request.signal ? [request.signal] : []),
  ]);
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", cancel, { once: true });
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      if (signal.aborted) throw new BotError("request_timeout", 408);
      const { done, value } = await reader.read();
      if (signal.aborted) throw new BotError("request_timeout", 408);
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new BotError(maxBytes > 10000 ? "audio_too_large" : "invalid_request", 413);
      }
      chunks.push(value);
    }
  } finally {
    signal.removeEventListener("abort", cancel);
    if (signal.aborted) cancel();
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  return bytes;
}
