import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  chatAssistant,
  listAssistantConversations,
  listAssistantMessages,
  getAssistantBriefing,
  getAssistantContext,
} from "./assistant.functions";
import { readAssistantStream, type AssistantResult, type AssistantStep } from "./stream";
import { getAssistantAction, listAssistantActions } from "./actions.functions";
import { useSession } from "@/lib/auth-mock";
import type { AssistantChoice } from "./choices";
import { getAssistantCatalog } from "./bot-config.functions";
import type { AgentBot } from "./bots";
export type AssistantRecordContext = {
  kind: "property" | "client" | "attendance" | "rental" | "agenciamento" | "agenda";
  id: string;
};
export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  results: AssistantResult[];
  steps?: AssistantStep[];
  created_at?: string;
  failed?: boolean;
  choices?: AssistantChoice[];
};
export function useAssistant(
  botId: string,
  initialConversation?: string,
  context?: AssistantRecordContext,
) {
  const session = useSession();
  const qc = useQueryClient();
  const [conversationId, setConversationId] = useState(initialConversation);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    controller.current?.abort();
    generation.current++;
    setConversationId(initialConversation);
    setMessages([]);
    setError(null);
    setBusy(false);
  }, [botId, initialConversation]);
  const conversations = useQuery({
    queryKey: ["assistant-conversations", session?.id, botId],
    queryFn: () => listAssistantConversations({ data: { botId, limit: 30 } }),
    enabled: !!session,
    staleTime: 15_000,
  });
  const history = useQuery({
    queryKey: ["assistant-messages", session?.id, initialConversation],
    queryFn: () => listAssistantMessages({ data: { conversationId: initialConversation! } }),
    enabled: !!session && !!initialConversation,
  });
  useEffect(() => {
    if (history.isError) setMessages([]);
    else if (history.data) setMessages(history.data as ChatMessage[]);
  }, [history.data, history.isError]);
  function cancel() {
    controller.current?.abort();
    generation.current++;
    setMessages((prev) =>
      prev.map((m) => ({
        ...m,
        steps: m.steps?.map((s) => (s.status === "running" ? { ...s, status: "error" } : s)),
      })),
    );
    setBusy(false);
    setError("Consulta interrompida por você. Os dados do Gestão não foram alterados.");
  }
  function reset() {
    controller.current?.abort();
    generation.current++;
    setConversationId(undefined);
    setMessages([]);
    setError(null);
    setBusy(false);
  }
  async function send(text: string) {
    if (!text.trim() || busy) return;
    controller.current = new AbortController();
    const activeController = controller.current;
    const version = generation.current;
    setBusy(true);
    setError(null);
    const id = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        results: [],
        created_at: new Date().toISOString(),
      },
      { id, role: "assistant", content: "", results: [], steps: [] },
    ]);
    const update = (fn: (m: ChatMessage) => ChatMessage) => {
      if (alive.current && version === generation.current)
        setMessages((prev) => prev.map((m) => (m.id === id ? fn(m) : m)));
    };
    try {
      const response = await chatAssistant({
        data: { botId, message: text, conversationId, context },
        signal: activeController.signal,
      });
      await readAssistantStream(response, (event) => {
        if (!alive.current || version !== generation.current || activeController.signal.aborted)
          return;
        if (event.type === "conversation") setConversationId(event.id);
        if (event.type === "text") update((m) => ({ ...m, content: m.content + event.delta }));
        if (event.type === "choice")
          update((m) => ({ ...m, choices: [...(m.choices ?? []), event.choice] }));
        if (event.type === "step")
          update((m) => ({
            ...m,
            steps: [...(m.steps ?? []).filter((s) => s.id !== event.id), event],
          }));
        if (event.type === "result")
          update((m) => ({
            ...m,
            results: [...m.results, { tool: event.tool, data: event.data }],
          }));
        if (event.type === "error") throw new Error(event.message);
      });
      void qc.invalidateQueries({ queryKey: ["assistant-conversations", session?.id] });
      void qc.invalidateQueries({ queryKey: ["assistant-actions"] });
      void qc.invalidateQueries({ queryKey: ["assistant-routines"] });
    } catch (err) {
      if (alive.current && version === generation.current && !activeController.signal.aborted) {
        setError(err instanceof Error ? err.message : "Não foi possível conversar agora.");
        update((m) => ({ ...m, failed: true }));
        void qc.invalidateQueries({ queryKey: ["assistant-catalog"] });
      }
    } finally {
      if (alive.current && version === generation.current) setBusy(false);
    }
  }
  return {
    messages,
    busy,
    error,
    send,
    cancel,
    reset,
    conversationId,
    conversations: conversations.data ?? [],
    historyLoading: history.isLoading,
    historyError: history.isError,
    refetchHistory: history.refetch,
  };
}
export function useAssistantBriefing() {
  const session = useSession();
  return useQuery({
    queryKey: ["assistant-briefing", session?.id],
    queryFn: () => getAssistantBriefing(),
    enabled: !!session,
    staleTime: 60_000,
    retry: 1,
  });
}
export function useAssistantContext(context?: AssistantRecordContext) {
  const session = useSession();
  const query = useQuery({
    queryKey: ["assistant-context", session?.id, context],
    queryFn: () => getAssistantContext({ data: context! }),
    enabled: !!session && !!context,
    staleTime: 30_000,
    retry: 1,
  });
  return { ...query, data: query.isError ? undefined : query.data };
}

export function useAssistantActions(conversationId?: string) {
  const session = useSession();
  const query = useQuery({
    queryKey: ["assistant-actions", session?.id, conversationId],
    queryFn: () => listAssistantActions({ data: { conversationId } }),
    enabled: !!session,
    refetchInterval: 15000,
  });
  return { ...query, data: query.isError ? undefined : query.data };
}

/** The server owns availability and editable prompts. No static fallback on failure. */
export function useAssistantCatalog() {
  const session = useSession();
  const query = useQuery({
    queryKey: ["assistant-catalog", session?.id, session?.perfil],
    queryFn: () => getAssistantCatalog(),
    enabled: !!session,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  });
  return {
    ...query,
    bots: (query.isError ? [] : (query.data ?? [])).map((bot) => ({
      ...bot,
      instructions: "",
    })) as AgentBot[],
  };
}

export function useAssistantAction(actionId?: string) {
  const session = useSession();
  const query = useQuery({
    queryKey: ["assistant-action", session?.id, actionId],
    queryFn: () => getAssistantAction({ data: { actionId: actionId! } }),
    enabled: !!session && !!actionId,
    staleTime: 0,
    retry: 1,
  });
  return { ...query, data: query.isError ? undefined : query.data };
}
