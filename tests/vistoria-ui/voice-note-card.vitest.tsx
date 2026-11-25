import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NoteRow } from "@/lib/vistoria/types";

const srv = vi.hoisted(() => ({ deleted: [] as string[] }));
vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: { kind?: string }) => async (a: { data: { noteId?: string } }) => {
    if (fn?.kind === "del") {
      srv.deleted.push(a.data.noteId!);
      return { ok: true, clientKey: "chave_relato_1", orphan: false };
    }
    return null;
  },
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ setQueryData: () => undefined, invalidateQueries: async () => undefined }),
  useQuery: () => ({}),
}));
vi.mock("@/lib/auth-mock", () => ({ useSession: () => ({ id: "u" }) }));
vi.mock("@/lib/vistoria/drafts", () => ({
  useDraftRow: (_k: string, note: NoteRow) => ({ value: { approved_text: note.approved_text, text: "" }, set: () => undefined, view: null }),
  useDrafts: () => ({ controller: {}, pending: [] }),
}));
vi.mock("@/lib/vistoria/vistoria.functions", () => ({ createNote: {}, signInspectionFiles: {}, updateItem: {}, updateNote: {}, registerMedia: {}, getInspection: {} }));
vi.mock("@/lib/vistoria/voice.functions", () => ({ transcribeNote: {}, deleteVoiceNote: { kind: "del" } }));
vi.mock("@/lib/vistoria/local-store", async (orig) => ({
  ...(await orig<typeof import("@/lib/vistoria/local-store")>()),
  removePending: async () => undefined,
}));
vi.mock("sonner", () => ({ toast: { success: () => undefined, error: () => undefined } }));

import { NoteCard } from "@/components/vistoria/notes-editor";

const base: NoteRow = {
  id: "n1", inspection_id: "i", room_id: "r", item_id: null, client_key: "chave_relato_1",
  source: "voz", audio_path: "i/r/chave_relato_1.wav", audio_seconds: 5, transcript_original: null,
  approved_text: null, suggestion: null, status: "pendente_transcricao", revision: 1,
  created_at: "2026-11-25T18:44:00Z", transcription_state: "pendente",
} as unknown as NoteRow;

function show(o: Partial<NoteRow> = {}, p: { voiceReady?: boolean; voiceAdmin?: boolean; readOnly?: boolean; onRerecord?: () => void } = {}) {
  return render(
    <NoteCard
      note={{ ...base, ...o } as NoteRow}
      items={[]}
      readOnly={p.readOnly ?? false}
      saver={{ run: async () => undefined } as never}
      voiceReady={p.voiceReady ?? true}
      voiceAdmin={p.voiceAdmin ?? false}
      onRerecord={p.onRerecord ?? (() => undefined)}
      currentCtx={{ current: null }}
      inspectionId="i"
    />,
  );
}
const future = () => new Date(Date.now() + 60_000).toISOString();
const past = () => new Date(Date.now() - 1000).toISOString();
afterEach(() => { cleanup(); srv.deleted = []; });

describe("card do relato de voz", () => {
  it("pendente, inclusive nota antiga com estado NULL", () => {
    show();
    expect(screen.getByText("Aguardando transcrição")).toBeTruthy();
    cleanup();
    show({ transcription_state: null });
    expect(screen.getByText("Aguardando transcrição")).toBeTruthy();
  });
  it("transcrevendo sem botão de repetir", () => {
    show({ transcription_state: "transcrevendo", transcription_lease_until: future() });
    expect(screen.getByText("Transcrevendo…")).toBeTruthy();
    expect(screen.queryByText("Tentar de novo")).toBeNull();
  });
  it("reserva vencida mostra interrompida com Tentar de novo", () => {
    show({ transcription_state: "transcrevendo", transcription_lease_until: past() });
    expect(screen.getByText("A transcrição foi interrompida.")).toBeTruthy();
    expect(screen.getByText("Tentar de novo")).toBeTruthy();
  });
  it("falhou mostra o motivo", () => {
    show({ transcription_state: "falhou", transcription_error: "serviço ocupado no momento." });
    expect(screen.getByText("Não foi possível transcrever: serviço ocupado no momento.")).toBeTruthy();
  });
  it("desligada: corretor sem detalhe, administrador com detalhe", () => {
    show({}, { voiceReady: false });
    expect(screen.getByText("Transcrição indisponível no momento. O áudio está salvo.")).toBeTruthy();
    cleanup();
    show({}, { voiceReady: false, voiceAdmin: true });
    expect(screen.getByText(/A transcrição está desligada no servidor\./)).toBeTruthy();
  });
  it("Excluir áudio pede confirmação, sem e com texto aprovado", async () => {
    show();
    fireEvent.click(screen.getByLabelText("Excluir este áudio"));
    expect(screen.getByText("Excluir este áudio? Esta ação não pode ser desfeita.")).toBeTruthy();
    expect(srv.deleted).toEqual([]);
    fireEvent.click(screen.getByText("Excluir"));
    await vi.waitFor(() => expect(srv.deleted).toEqual(["n1"]));
    cleanup();
    show({ approved_text: "Piso ok", status: "revisado" });
    fireEvent.click(screen.getByLabelText("Excluir este áudio"));
    expect(screen.getByText(/O texto aprovado deste relato também será removido/)).toBeTruthy();
  });
  it("Regravar avisa antes quando há texto aprovado; sem texto abre direto", () => {
    const re = vi.fn();
    show({ approved_text: "Piso ok", status: "revisado" }, { onRerecord: re });
    fireEvent.click(screen.getByLabelText("Regravar este áudio"));
    expect(re).not.toHaveBeenCalled();
    expect(screen.getByText(/Regravar substitui este áudio/)).toBeTruthy();
    fireEvent.click(screen.getAllByText("Regravar").at(-1)!);
    expect(re).toHaveBeenCalledTimes(1);
    cleanup();
    const re2 = vi.fn();
    show({}, { onRerecord: re2 });
    fireEvent.click(screen.getByLabelText("Regravar este áudio"));
    expect(re2).toHaveBeenCalledTimes(1);
  });
  it("somente leitura: sem Excluir, Regravar nem Tentar de novo", () => {
    show({ transcription_state: "falhou", transcription_error: "x." }, { readOnly: true });
    expect(screen.queryByLabelText("Excluir este áudio")).toBeNull();
    expect(screen.queryByLabelText("Regravar este áudio")).toBeNull();
    expect(screen.queryByText("Tentar de novo")).toBeNull();
  });
});
