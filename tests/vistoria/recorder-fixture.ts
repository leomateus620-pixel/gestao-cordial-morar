export * from "../../src/lib/vistoria/media-client";
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
      return { blob: new Blob(["RIFF----WAVEfixture"], { type: "audio/wav" }), seconds: 12 };
    },
  };
}
