import { act, cleanup, fireEvent, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useInspectionPhotos } from "@/components/vistoria/use-inspection-photos";
import { armCaptureMarker, clearCaptureMarker, markerKey } from "@/lib/vistoria/capture-resume";
import type { PendingEntry } from "@/lib/vistoria/local-store";
import type { MediaRow, RoomRow } from "@/lib/vistoria/types";

const mocks = vi.hoisted(() => ({ prepare: vi.fn(), hasPending: vi.fn() }));
vi.mock("@/lib/vistoria/local-store", async (original) => ({
  ...(await original<typeof import("@/lib/vistoria/local-store")>()),
  hasPendingMedia: mocks.hasPending,
}));
vi.mock("@/lib/vistoria/media-client", () => ({ prepareImage: mocks.prepare }));

const userId = "secretaria";
const inspectionId = "vistoria";
const sala = { id: "sala", name: "Sala", kind: "sala" } as RoomRow;
const cozinha = { id: "cozinha", name: "Cozinha", kind: "cozinha" } as RoomRow;
const rooms = [sala, cozinha];
const target = { userId, inspectionId, roomId: sala.id, itemId: "piso" };
const image = new File(["sintético"], "imagem.jpg", { type: "image/jpeg" });
const prepared = { blob: image, width: 30, height: 40, thumb: image };
const newPhoto = () => new File(["sintético"], "imagem-2.jpg", { type: "image/jpeg" });

beforeEach(() => {
  mocks.prepare.mockReset().mockResolvedValue(prepared);
  mocks.hasPending.mockReset().mockResolvedValue(false);
  localStorage.clear();
  vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function setup(media: MediaRow[] = []) {
  const stage = vi.fn(async (_entry: Omit<PendingEntry, "key">) => true);
  const queue = {
    stage,
    hasUnpersisted: () => false,
    pending: [],
    refresh: vi.fn(async () => {}),
    process: vi.fn(async () => {}),
  } as unknown as Parameters<typeof useInspectionPhotos>[0]["queue"];
  const setRoomId = vi.fn();
  const options = {
    userId,
    inspectionId,
    rooms,
    media,
    queue,
    setRoomId,
    markStarted: async () => {},
    onPreparingChange: vi.fn(),
  };
  const state = renderHook(() => useInspectionPhotos(options));
  return { ...state, stage, setRoomId, options };
}

function selectFiles(input: HTMLInputElement, files: File[]) {
  fireEvent.change(input, { target: { files } });
}
const currentInput = () => document.querySelector<HTMLInputElement>('input[type="file"]')!;

it("abre um único arquivo na câmera nativa e congela o cômodo e o item desde o toque", async () => {
  const { result, stage, options } = setup();
  act(() => result.current.openPicker(target, "camera"));
  const input = currentInput();
  expect(input.multiple).toBe(false);
  expect(input.getAttribute("capture")).toBe("environment");
  options.setRoomId(cozinha.id);
  await act(async () => selectFiles(input, [image, newPhoto()]));
  expect(stage).toHaveBeenCalledTimes(1);
  expect(stage.mock.calls[0]![0]).toMatchObject({
    ...target,
    kind: "photo",
    timeSource: "captura",
    thumb: image,
  });
  expect(localStorage.getItem(markerKey(userId, inspectionId))).toBeNull();
});

it("permite seleção múltipla e só prepara a segunda foto após o commit da primeira", async () => {
  const { stage, result, options } = setup();
  let commitFirst: (ok: boolean) => void = () => {};
  stage.mockImplementationOnce(
    () =>
      new Promise<boolean>((resolve) => {
        commitFirst = resolve;
      }),
  );
  act(() => result.current.openPicker(target, "galeria"));
  const picker = currentInput();
  expect(picker.multiple).toBe(true);
  expect(picker.getAttribute("capture")).toBeNull();
  await act(async () => selectFiles(picker, [image, newPhoto()]));
  expect(mocks.prepare).toHaveBeenCalledTimes(1);
  expect(result.current.isPreparing()).toBe(true);
  await act(async () => commitFirst(true));
  expect(mocks.prepare).toHaveBeenCalledTimes(2);
  expect(new Set(stage.mock.calls.map(([entry]) => entry.clientKey)).size).toBe(2);
  expect(stage.mock.calls.map(([entry]) => entry.roomId)).toEqual(["sala", "sala"]);
  expect(options.onPreparingChange.mock.calls).toEqual([[true], [false]]);
});

it("descarta resultado de um seletor substituído e trata cancelamento sem criar foto", async () => {
  const { result, stage } = setup();
  act(() => result.current.openPicker(target, "camera"));
  const previous = currentInput();
  act(() => result.current.openPicker({ ...target, roomId: cozinha.id, itemId: null }, "galeria"));
  const latest = currentInput();
  await act(async () => selectFiles(previous, [image]));
  expect(stage).not.toHaveBeenCalled();
  fireEvent(latest, new Event("cancel"));
  expect(localStorage.getItem(markerKey(userId, inspectionId))).toBeNull();
  expect(currentInput()).toBeNull();
  expect(stage).not.toHaveBeenCalled();
});

it("restaura a Sala após recarregar durante o seletor nativo", async () => {
  armCaptureMarker(
    localStorage,
    { ...target, origin: "camera", clientKey: "tentativa" },
    Date.now(),
    "previous-load",
  );
  const { result, setRoomId } = setup();
  await waitFor(() => expect(result.current.resume?.roomId).toBe(sala.id));
  expect(setRoomId).toHaveBeenCalledWith(sala.id);
  expect(result.current.resume?.itemId).toBe(target.itemId);
});

it("reabre o cômodo sem pedir para refazer uma foto que já foi gravada", async () => {
  mocks.hasPending.mockResolvedValue(true);
  armCaptureMarker(
    localStorage,
    { ...target, origin: "camera", clientKey: "tentativa" },
    Date.now(),
    "previous-load",
  );
  const { result, setRoomId } = setup();
  await waitFor(() => expect(localStorage.getItem(markerKey(userId, inspectionId))).toBeNull());
  expect(result.current.resume).toBeNull();
  expect(setRoomId).toHaveBeenCalledWith(sala.id);
});

it("mantém o marcador de retorno quando a foto falha ao gravar no aparelho", async () => {
  const { result, stage } = setup();
  stage.mockResolvedValueOnce(false);
  act(() => result.current.openPicker(target, "galeria"));
  const key = markerKey(userId, inspectionId);
  const marker = localStorage.getItem(key);
  await act(async () => selectFiles(currentInput(), [image, newPhoto()]));
  expect(stage).toHaveBeenCalledOnce();
  expect(mocks.prepare).toHaveBeenCalledOnce();
  expect(localStorage.getItem(key)).toBe(marker);
  clearCaptureMarker(localStorage, userId, inspectionId);
});
