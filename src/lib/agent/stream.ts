export type AssistantResult = { tool: string; data: Record<string, any> };
export type AssistantStep = { id: string; label: string; status: "running" | "done" | "error" };
export type AssistantStreamEvent =
  | { type: "conversation"; id: string }
  | ({ type: "step" } & AssistantStep)
  | { type: "text"; delta: string }
  | ({ type: "result" } & AssistantResult)
  | { type: "done" }
  | { type: "error"; message: string };
export type AssistantEvent = AssistantStreamEvent;
export type AssistantConversation = {
  id: string;
  bot_id: string;
  title: string;
  updated_at: string;
};
export type AssistantMessage = {
  id: string;
  role: "user" | "assistant";
  bot_id?: string;
  content: string;
  results: AssistantResult[];
  created_at: string;
};
/** Incremental decoder preserves split UTF-8 characters and split NDJSON records. */
export async function readAssistantStream(
  response: Response,
  onEvent: (event: AssistantStreamEvent) => void,
) {
  if (!response.ok) throw new Error("Não foi possível iniciar a conversa. Tente novamente.");
  if (!response.body) throw new Error("A resposta do assistente veio vazia.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let doneEvent = false;
  const consume = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as AssistantStreamEvent;
    if (event.type === "done" || event.type === "error") doneEvent = true;
    onEvent(event);
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      if (pending.length > 256000) throw new Error("Resposta muito longa.");
      let end: number;
      while ((end = pending.indexOf("\n")) >= 0) {
        consume(pending.slice(0, end));
        pending = pending.slice(end + 1);
      }
      if (done) break;
    }
    if (pending.trim()) consume(pending);
    if (!doneEvent)
      throw new Error("A conexão foi interrompida. A resposta pode estar incompleta.");
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
