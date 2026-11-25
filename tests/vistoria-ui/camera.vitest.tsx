import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InAppCamera, pickPhotoWidth } from "@/components/vistoria/in-app-camera";

function fakeStream() {
  const track = {
    stopped: 0,
    stop() {
      this.stopped++;
    },
    getCapabilities: () => ({}),
    applyConstraints: async () => undefined,
  };
  return { track, stream: { getTracks: () => [track], getVideoTracks: () => [track] } };
}
let current: ReturnType<typeof fakeStream>;
const getUserMedia = vi.fn();

beforeEach(() => {
  current = fakeStream();
  getUserMedia.mockReset().mockImplementation(async () => current.stream);
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
  Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: () => Promise.resolve() });
  Object.defineProperty(HTMLMediaElement.prototype, "srcObject", { configurable: true, writable: true, value: null });
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL: () => undefined }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (globalThis as { ImageCapture?: unknown }).ImageCapture;
});

function setup(over: Partial<Parameters<typeof InAppCamera>[0]> = {}) {
  const props = {
    open: true,
    title: "Sala",
    count: 0,
    onClose: vi.fn(),
    onCapture: vi.fn(async () => undefined),
    onNative: vi.fn(),
    ...over,
  };
  const r = render(<InAppCamera {...props} />);
  return { props, ...r };
}
const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));

describe("Câmera do app", () => {
  it("pede câmera traseira 1920x1440 como preferência, sem exigir", async () => {
    setup();
    await flush();
    const c = getUserMedia.mock.calls[0]![0];
    expect(c.video.facingMode).toEqual({ ideal: "environment" });
    expect(c.video.width).toEqual({ ideal: 1920 });
    expect(c.video.height).toEqual({ ideal: 1440 });
  });

  it("encerra a câmera ao concluir", async () => {
    const { props } = setup();
    await flush();
    fireEvent.click(screen.getByText("Concluir"));
    expect(current.track.stopped).toBe(1);
    expect(props.onClose).toHaveBeenCalled();
  });

  it("encerra ao ocultar a página e ao sair da tela", async () => {
    const { unmount } = setup();
    await flush();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(current.track.stopped).toBe(1);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    const second = fakeStream();
    current = second;
    document.dispatchEvent(new Event("visibilitychange"));
    await flush();
    unmount();
    expect(second.track.stopped).toBe(1);
  });

  it("permissão negada: cai na câmera do celular", async () => {
    getUserMedia.mockRejectedValueOnce(new DOMException("negado", "NotAllowedError"));
    const { props } = setup();
    await flush();
    expect(props.onNative).toHaveBeenCalledWith("falha");
    expect(props.onClose).toHaveBeenCalled();
  });

  it("sem suporte: cai na câmera do celular", async () => {
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: undefined });
    const { props } = setup();
    await flush();
    expect(props.onNative).toHaveBeenCalledWith("falha");
  });

  it("uma captura por vez e takePhoto com tamanho limitado", async () => {
    const takes: Array<{ imageWidth?: number } | undefined> = [];
    let finish: () => void = () => undefined;
    (globalThis as { ImageCapture?: unknown }).ImageCapture = class {
      async getPhotoCapabilities() {
        return { imageWidth: { min: 640, max: 4000, step: 16 } };
      }
      async takePhoto(s?: { imageWidth?: number }) {
        takes.push(s);
        return new Blob(["p"], { type: "image/jpeg" });
      }
    };
    const onCapture = vi.fn(() => new Promise<void>((r) => (finish = r)));
    setup({ onCapture });
    await flush();
    const btn = screen.getByRole("button", { name: "Tirar foto" });
    fireEvent.click(btn);
    fireEvent.click(btn);
    await flush();
    expect(screen.getByRole("button", { name: "Salvando…" })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "Salvando…" }));
    await flush();
    expect(takes).toHaveLength(1);
    expect(takes[0]?.imageWidth).toBe(pickPhotoWidth({ min: 640, max: 4000, step: 16 }));
    expect(takes[0]!.imageWidth!).toBeLessThanOrEqual(2048);
    await act(async () => finish());
    expect(onCapture).toHaveBeenCalledTimes(1);
  });

  it("'Usar câmera do celular' é opção secundária", async () => {
    const { props } = setup();
    await flush();
    fireEvent.click(screen.getByText("Usar câmera do celular"));
    expect(props.onNative).toHaveBeenCalledWith("escolha");
    expect(current.track.stopped).toBe(1);
  });

  it("pickPhotoWidth respeita a faixa", () => {
    expect(pickPhotoWidth({ min: 640, max: 4000, step: 16 })).toBe(2048);
    expect(pickPhotoWidth({ min: 640, max: 4000, step: 100 })).toBe(2040);
    expect(pickPhotoWidth({ min: 640, max: 1280 })).toBe(1280);
    expect(pickPhotoWidth(undefined)).toBeNull();
  });
});
