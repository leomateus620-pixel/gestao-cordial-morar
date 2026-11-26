import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InAppCamera } from "@/components/vistoria/in-app-camera";

function fakeStream() {
  const track = Object.assign(new EventTarget(), {
    stop: vi.fn(),
    readyState: "live",
    muted: false,
    getCapabilities: () => ({}),
    applyConstraints: async () => undefined,
  });
  return { track, stream: { getTracks: () => [track], getVideoTracks: () => [track] } };
}
let current: ReturnType<typeof fakeStream>;
let frames: boolean;
const getUserMedia = vi.fn();
const play = vi.fn();
const createObjectURL = vi.fn(() => "blob:preview");
const revokeObjectURL = vi.fn();

beforeEach(() => {
  current = fakeStream();
  frames = true;
  getUserMedia.mockReset().mockImplementation(async () => current.stream);
  play.mockReset().mockResolvedValue(undefined);
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
  Object.defineProperty(HTMLVideoElement.prototype, "play", { configurable: true, value: play });
  Object.defineProperty(HTMLVideoElement.prototype, "srcObject", {
    configurable: true,
    writable: true,
    value: null,
  });
  Object.defineProperty(HTMLVideoElement.prototype, "readyState", {
    configurable: true,
    get: () => (frames ? 2 : 0),
  });
  Object.defineProperty(HTMLVideoElement.prototype, "paused", {
    configurable: true,
    get: () => !frames,
  });
  Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", {
    configurable: true,
    get: () => (frames ? 1920 : 0),
  });
  Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", {
    configurable: true,
    get: () => (frames ? 1440 : 0),
  });
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL }));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function setup(over: Partial<Parameters<typeof InAppCamera>[0]> = {}) {
  const props = {
    open: true,
    title: "Sala",
    count: 0,
    onClose: vi.fn(),
    onCapture: vi.fn(async () => null as Blob | null),
    onNative: vi.fn(),
    onGallery: vi.fn(),
    ...over,
  };
  const r = render(<InAppCamera {...props} />);
  return { props, ...r };
}
const flush = () => act(async () => {});

describe("Câmera do app", () => {
  it("prefere traseira em resolução flexível e mantém a sessão quando os callbacks e a contagem mudam", async () => {
    const { props, rerender } = setup();
    await flush();
    expect(getUserMedia.mock.calls[0]![0]).toEqual({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1440 },
      },
    });
    rerender(<InAppCamera {...props} count={1} onCapture={async () => null} onClose={() => {}} />);
    await flush();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(current.track.stop).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Tirar foto" })).toHaveProperty("disabled", false);
  });

  it("aguarda play e um quadro com dimensões antes de habilitar o disparo", async () => {
    frames = false;
    const { container } = setup();
    await flush();
    expect(screen.queryByRole("button", { name: "Tirar foto" })).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Abrindo a câmera");
    frames = true;
    fireEvent(container.querySelector("video")!, new Event("loadeddata"));
    await flush();
    expect(screen.getByRole("button", { name: "Tirar foto" })).toHaveProperty("disabled", false);
  });

  it("play rejeitado: fica no painel com recuperação, encerra os tracks", async () => {
    play.mockRejectedValueOnce(new DOMException("", "NotSupportedError"));
    const { props } = setup();
    await flush();
    expect(screen.getByRole("status").textContent).toContain("imagem ao vivo não iniciou");
    expect(screen.queryByRole("button", { name: "Tirar foto" })).toBeNull();
    expect(current.track.stop).toHaveBeenCalledOnce();
    expect(props.onClose).not.toHaveBeenCalled();
    expect(props.onNative).not.toHaveBeenCalled();
  });

  it.each([
    ["NotAllowedError", "Confira a permissão"],
    ["NotReadableError", "em uso por outro aplicativo"],
    ["NotFoundError", "Nenhuma câmera disponível"],
  ])("trata %s e só troca para nativa num toque", async (name, message) => {
    getUserMedia.mockRejectedValueOnce(new DOMException("", name));
    const { props } = setup();
    await flush();
    expect(screen.getByRole("status").textContent).toContain(message);
    expect(props.onNative).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Usar câmera do celular" }));
    expect(props.onNative).toHaveBeenCalledOnce();
  });

  it("aguarda uma abertura demorada com saídas imediatas e descarta stream tardio", async () => {
    vi.useFakeTimers();
    let deliver: (stream: typeof current.stream) => void = () => {};
    getUserMedia.mockImplementation(
      () =>
        new Promise((resolve) => {
          deliver = resolve;
        }),
    );
    const { props, unmount } = setup();
    expect(screen.getByRole("button", { name: "Voltar ao cômodo" })).toBeTruthy();
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(screen.getByRole("status").textContent).toContain("demorou");
    fireEvent.click(screen.getByRole("button", { name: "Escolher da galeria" }));
    expect(props.onGallery).toHaveBeenCalledOnce();
    unmount();
    await act(async () => deliver(current.stream));
    expect(current.track.stop).toHaveBeenCalledOnce();
  });

  it("encerra ao ocultar e só reinicia com nova tentativa", async () => {
    const original = current;
    const { unmount } = setup();
    await flush();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(original.track.stop).toHaveBeenCalledOnce();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    current = fakeStream();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await flush();
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    unmount();
    expect(current.track.stop).toHaveBeenCalledOnce();
  });

  it("permite um disparo de cada vez e mostra apenas a miniatura já salva", async () => {
    let finish: (thumb: Blob) => void = () => {};
    const onCapture = vi.fn(
      () =>
        new Promise<Blob>((resolve) => {
          finish = resolve;
        }),
    );
    const { unmount } = setup({ onCapture });
    await flush();
    const shutter = screen.getByRole("button", { name: "Tirar foto" });
    fireEvent.click(shutter);
    fireEvent.click(shutter);
    expect(onCapture).toHaveBeenCalledTimes(1);
    expect(createObjectURL).not.toHaveBeenCalled();
    const thumb = new Blob(["miniatura"]);
    await act(async () => finish(thumb));
    expect(createObjectURL).toHaveBeenCalledWith(thumb);
    expect(screen.getByRole("img", { name: "Última foto salva" })).toBeTruthy();
    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:preview");
  });
});
