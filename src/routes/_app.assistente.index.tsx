import { createFileRoute, useNavigate, type SearchSchemaInput } from "@tanstack/react-router";
import { useEffect } from "react";
import { AgentWorkspace } from "@/components/assistant/AgentWorkspace";
import { useSession } from "@/lib/auth-mock";
import { MobileAssistantHome } from "@/components/assistant/MobileAssistantHome";
export const Route = createFileRoute("/_app/assistente/")({
  head: () => ({ meta: [{ title: "Cordial Bot — Gestão Cordial" }] }),
  validateSearch: (
    search: {
      routine?: unknown;
      run?: unknown;
      conversation?: unknown;
      action?: unknown;
    } & SearchSchemaInput,
  ) => {
    const id = (value: unknown) =>
      typeof value === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
        ? value
        : undefined;
    return {
      routine: id(search.routine),
      run: id(search.run),
      conversation: id(search.conversation),
      action: id(search.action),
    };
  },
  component: Page,
});
function Page() {
  const session = useSession();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const deepLink = !!(search.routine || search.run || search.conversation || search.action);
  useEffect(() => {
    if (!session) return;
    try {
      if (!deepLink && !localStorage.getItem(`cordial:assistant:intro:${session.id}`))
        void navigate({ to: "/assistente/equipe", replace: true });
    } catch {}
  }, [session?.id, navigate, deepLink]);
  if (deepLink)
    return (
      <AgentWorkspace
        initialTab={search.routine || search.run ? "Rotinas" : "Conversa"}
        routineId={search.routine}
        runId={search.run}
        conversationId={search.conversation}
        actionId={search.action}
      />
    );
  return (
    <>
      <div className="md:hidden">
        <MobileAssistantHome />
      </div>
      <div className="hidden md:block">
        <AgentWorkspace />
      </div>
    </>
  );
}
