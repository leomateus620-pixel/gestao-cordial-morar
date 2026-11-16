import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import VoiceCapture, { recorderMime } from "../../src/components/public-property-bot/VoiceCapture";
const mocks = vi.hoisted(() => ({ transcribe: vi.fn() }));
vi.mock("../../src/components/public-property-bot/transport", async (original) => ({
  ...(await original<object>()),
  transcribe: mocks.transcribe,
}));
const stopTrack = vi.fn();
let lastRecorder: FakeRecorder;
class FakeRecorder {
  static isTypeSupported(type: string) {
    return type === "audio/mp4";
  }
  state = "inactive";
  mimeType = "audio/mp4";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    lastRecorder = this;
  }
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob([new Uint8Array(200)], { type: this.mimeType }) });
    this.onstop?.();
  }
}
const media = { getUserMedia: vi.fn() };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  Object.defineProperty(navigator, "mediaDevices", { value: media, configurable: true });
  media.getUserMedia.mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] });
  mocks.transcribe.mockResolvedValue("Quero comprar uma casa");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("negocia formato realmente suportado e só pede permissão após clique", async () => {
  expect(recorderMime(FakeRecorder)).toBe("audio/mp4");
  const onText = vi.fn();
  render(
    <VoiceCapture
      brand="morar"
      enabled
      active
      blocked={false}
      onText={onText}
      onStatus={() => {}}
    />,
  );
  expect(media.getUserMedia).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Gravar mensagem de voz" }));
  await screen.findByRole("button", { name: "Parar gravação e transcrever" });
  expect(media.getUserMedia).toHaveBeenCalledExactlyOnceWith({ audio: true });
  fireEvent.click(screen.getByRole("button", { name: "Parar gravação e transcrever" }));
  await waitFor(() => expect(onText).toHaveBeenCalledExactlyOnceWith("Quero comprar uma casa"));
  expect(stopTrack).toHaveBeenCalled();
  expect(mocks.transcribe).toHaveBeenCalledTimes(1);
  expect(mocks.transcribe.mock.calls[0][1].type).toBe("audio/mp4");
});
it("cancelar para tracks e não envia áudio nem transcrição", async () => {
  render(
    <VoiceCapture
      brand="cordial"
      enabled
      active
      blocked={false}
      onText={() => {}}
      onStatus={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Gravar mensagem de voz" }));
  await screen.findByRole("button", { name: "Cancelar áudio" });
  fireEvent.click(screen.getByRole("button", { name: "Cancelar áudio" }));
  expect(stopTrack).toHaveBeenCalled();
  expect(mocks.transcribe).not.toHaveBeenCalled();
});
it("fechar com permissão pendente encerra o stream que chegar depois", async () => {
  let accept: (value: unknown) => void = () => {};
  media.getUserMedia.mockReturnValue(
    new Promise((resolve) => {
      accept = resolve;
    }),
  );
  const view = render(
    <VoiceCapture
      brand="cordial"
      enabled
      active
      blocked={false}
      onText={() => {}}
      onStatus={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Gravar mensagem de voz" }));
  view.rerender(
    <VoiceCapture
      brand="cordial"
      enabled
      active={false}
      blocked={false}
      onText={() => {}}
      onStatus={() => {}}
    />,
  );
  await act(async () => accept({ getTracks: () => [{ stop: stopTrack }] }));
  expect(stopTrack).toHaveBeenCalledTimes(1);
  expect(mocks.transcribe).not.toHaveBeenCalled();
});
it("permissão negada mantém ditado não enviado e oferece erro acionável", async () => {
  media.getUserMedia.mockRejectedValue(new DOMException("No", "NotAllowedError"));
  const onText = vi.fn();
  render(
    <VoiceCapture
      brand="cordial"
      enabled
      active
      blocked={false}
      onText={onText}
      onStatus={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Gravar mensagem de voz" }));
  await screen.findByText(/O microfone não foi autorizado/);
  expect(onText).not.toHaveBeenCalled();
  expect(mocks.transcribe).not.toHaveBeenCalled();
});
it("cancelar durante transcrição ignora conclusão atrasada", async () => {
  let finish: (value: string) => void = () => {};
  mocks.transcribe.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const onText = vi.fn();
  render(
    <VoiceCapture
      brand="cordial"
      enabled
      active
      blocked={false}
      onText={onText}
      onStatus={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Gravar mensagem de voz" }));
  await screen.findByRole("button", { name: "Parar gravação e transcrever" });
  fireEvent.click(screen.getByRole("button", { name: "Parar gravação e transcrever" }));
  await screen.findByText("Transcrevendo…");
  fireEvent.click(screen.getByRole("button", { name: "Cancelar áudio" }));
  await act(async () => finish("Texto atrasado"));
  expect(onText).not.toHaveBeenCalled();
  expect(mocks.transcribe.mock.calls[0][3].aborted).toBe(true);
});
it("onstop atrasado de uma gravação cancelada não encerra o novo stream", async () => {
  const stopFirst = vi.fn(),
    stopNext = vi.fn();
  media.getUserMedia
    .mockResolvedValueOnce({ getTracks: () => [{ stop: stopFirst }] })
    .mockResolvedValueOnce({ getTracks: () => [{ stop: stopNext }] });
  render(
    <VoiceCapture
      brand="cordial"
      enabled
      active
      blocked={false}
      onText={() => {}}
      onStatus={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Gravar mensagem de voz" }));
  await screen.findByRole("button", { name: "Parar gravação e transcrever" });
  const first = lastRecorder;
  // Native stop dispatches onstop asynchronously; hold that callback until the next recording.
  first.stop = () => {
    first.state = "inactive";
  };
  fireEvent.click(screen.getByRole("button", { name: "Cancelar áudio" }));
  expect(stopFirst).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Gravar mensagem de voz" }));
  await screen.findByRole("button", { name: "Parar gravação e transcrever" });
  await act(async () => {
    first.onstop?.();
  });
  expect(stopNext).not.toHaveBeenCalled();
  expect(lastRecorder.state).toBe("recording");
  expect(mocks.transcribe).not.toHaveBeenCalled();
});
it("recusa atrasada de permissão cancelada não encerra a gravação seguinte", async () => {
  let rejectFirst!: (error: Error) => void;
  const stopNext = vi.fn();
  media.getUserMedia
    .mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectFirst = reject;
      }),
    )
    .mockResolvedValueOnce({ getTracks: () => [{ stop: stopNext }] });
  render(
    <VoiceCapture
      brand="morar"
      enabled
      active
      blocked={false}
      onText={() => {}}
      onStatus={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Gravar mensagem de voz" }));
  await screen.findByText("Aguardando microfone…");
  fireEvent.click(screen.getByRole("button", { name: "Cancelar áudio" }));
  fireEvent.click(screen.getByRole("button", { name: "Gravar mensagem de voz" }));
  await screen.findByRole("button", { name: "Parar gravação e transcrever" });
  await act(async () => {
    rejectFirst(new DOMException("Permission refused", "NotAllowedError"));
  });
  expect(stopNext).not.toHaveBeenCalled();
  expect(lastRecorder.state).toBe("recording");
  expect(screen.queryByText(/O microfone não foi autorizado/)).toBeNull();
});
