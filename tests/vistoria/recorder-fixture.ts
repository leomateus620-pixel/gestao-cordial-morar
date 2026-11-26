export * from "../../src/lib/vistoria/media-client";
import { wavFromInt16 } from "../../src/lib/vistoria/media-client";
export let stopped = 0;
export async function startRecorder() {
  let done = false;
  return {
    level: () => 0.3,
    cancel() {
      done = true;
    },
    async stop() {
      if (done) throw new Error("Gravação já encerrada");
      done = true;
      stopped++;
      window.dispatchEvent(new Event("fixture-recorder"));
      const pcm = Int16Array.from({ length: 32_000 }, (_, i) =>
        Math.round(1_200 * Math.sin((i * 2 * Math.PI * 440) / 16_000)),
      );
      return { blob: wavFromInt16([pcm]), seconds: 2 };
    },
  };
}
