import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AgentWorkspace } from "@/components/assistant/AgentWorkspace";
import { useSession } from "@/lib/auth-mock";
import { MobileAssistantHome } from "@/components/assistant/MobileAssistantHome";
export const Route = createFileRoute("/_app/assistente/")({
  head: () => ({ meta: [{ title: "Assistente Cordial — Gestão Cordial" }] }),
  component: Page,
});
function Page() {
  const session = useSession();
  const navigate = useNavigate();
  useEffect(() => {
    if (!session) return;
    try {
      if (!localStorage.getItem(`cordial:assistant:intro:${session.id}`))
        void navigate({ to: "/assistente/equipe", replace: true });
    } catch {}
  }, [session?.id, navigate]);
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
