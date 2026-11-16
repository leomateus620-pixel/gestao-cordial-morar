import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  newDraft,
  type BotEvent,
  type ChatInput,
  type TurnResult,
} from "../../src/lib/public-property-bot/contracts";
import { sendTurn, TransportError } from "../../src/components/public-property-bot/transport";
const request: ChatInput = {
  requestId: "10000000-0000-4000-8000-000000000001",
  revision: 0,
  action: { kind: "text", text: "Uma casa" },
};
const result: TurnResult = {
  requestId: request.requestId,
  draft: { ...newDraft(), revision: 1 },
  answer: "Sua busca foi atualizada.",
  cards: [],
  question: null,
  exhausted: false,
  unavailable: false,
};
const encoder = new TextEncoder(),
  fetcher = vi.fn();
const event = (type: BotEvent["type"], sequence: number, extra = {}) => ({
  type,
  sequence,
  revision: 1,
  requestId: request.requestId,
  ...extra,
});
function sse(frames: unknown[], fragmented = false) {
  const body = frames.map((frame) => `data: ${JSON.stringify(frame)}\r\n\r\n`).join("");
  return new Response(
    new ReadableStream({
      start(controller) {
        if (fragmented)
          for (let n = 0; n < body.length; n += 7)
            controller.enqueue(encoder.encode(body.slice(n, n + 7)));
        else controller.enqueue(encoder.encode(body));
        controller.close();
      },
    }),
    { headers: { "Content-Type": "text/event-stream" } },
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => vi.unstubAllGlobals());
it("reconstrói SSE fragmentado e ignora sequências antigas e outro request", async () => {
  fetcher.mockResolvedValue(
    sse(
      [
        event("accepted", 0),
        event("status", 1, { message: "Buscando opções" }),
        event("status", 0, { message: "IGNORAR" }),
        event("status", 2, { requestId: "20000000-0000-4000-8000-000000000001", message: "OUTRO" }),
        event("done", 2, { result }),
      ],
      true,
    ),
  );
  const receive = vi.fn();
  await sendTurn("morar", request, new AbortController().signal, receive);
  expect(receive.mock.calls.map((call) => call[0].type)).toEqual(["accepted", "status", "done"]);
  expect(fetcher.mock.calls[0][0]).toBe("/api/morar-site/bot/chat");
  expect(fetcher.mock.calls[0][1].body).toBe(JSON.stringify(request));
  expect(fetcher.mock.calls[0][1].credentials).toBe("same-origin");
});
it("fim de stream sem done não simula resposta concluída", async () => {
  fetcher.mockResolvedValue(sse([event("accepted", 0)]));
  await expect(
    sendTurn("cordial", request, new AbortController().signal, () => {}),
  ).rejects.toMatchObject({ code: "interrupted" });
});
it("erros mantêm código estável e descartam conteúdo de infraestrutura", async () => {
  fetcher.mockResolvedValue(
    Response.json(
      { code: "quota_exhausted", message: "SEGREDO INTERNO" },
      { status: 429, headers: { "Retry-After": "123" } },
    ),
  );
  await expect(
    sendTurn("cordial", request, new AbortController().signal, () => {}),
  ).rejects.toMatchObject({ code: "quota_exhausted", message: "quota_exhausted", retryAfter: 123 });
});
it("resposta JSON de retry precisa corresponder ao request original", async () => {
  fetcher.mockResolvedValue(
    Response.json({ ...result, requestId: "20000000-0000-4000-8000-000000000001" }),
  );
  await expect(
    sendTurn("cordial", request, new AbortController().signal, () => {}),
  ).rejects.toMatchObject({ code: "invalid_response" });
});
