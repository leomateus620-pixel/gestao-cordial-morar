import { createFileRoute, type SearchSchemaInput } from "@tanstack/react-router";
import { AgentWorkspace } from "@/components/assistant/AgentWorkspace";
import type { AssistantRecordContext } from "@/lib/agent/use-assistant";
const kinds = ["property", "client", "attendance", "rental", "agenciamento", "agenda"];
export const Route = createFileRoute("/_app/assistente/$botId")({
  head: () => ({ meta: [{ title: "Sua equipe — Assistente Cordial" }] }),
  validateSearch: (
    search: {
      prompt?: unknown;
      conversation?: unknown;
      kind?: unknown;
      record?: unknown;
    } & SearchSchemaInput,
  ) => ({
    prompt: typeof search.prompt === "string" ? search.prompt.slice(0, 4000) : undefined,
    conversation:
      typeof search.conversation === "string" && /^[0-9a-f-]{36}$/i.test(search.conversation)
        ? search.conversation
        : undefined,
    kind:
      typeof search.kind === "string" && kinds.includes(search.kind)
        ? (search.kind as AssistantRecordContext["kind"])
        : undefined,
    record:
      typeof search.record === "string" && /^[0-9a-f-]{36}$/i.test(search.record)
        ? search.record
        : undefined,
  }),
  component: Page,
});
function Page() {
  const { botId } = Route.useParams();
  const { prompt, conversation, kind, record } = Route.useSearch();
  return (
    <AgentWorkspace
      key={`${botId}:${conversation ?? "new"}`}
      botId={botId}
      prompt={prompt}
      conversationId={conversation}
      context={kind && record ? { kind, id: record } : undefined}
    />
  );
}
