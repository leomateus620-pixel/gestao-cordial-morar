/** Local visual harness only. Not a TanStack route and never part of production build.
 * Uses the real components with synthetic props; no session/authentication bypass. */
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import {
  AssistantWorkspaceView,
  DailyBriefingView,
} from "../../src/components/assistant/AgentWorkspace";
import { MobileAssistantHomeView } from "../../src/components/assistant/MobileAssistantHome";
import { TeamHomeView, BotPresentationView } from "../../src/components/assistant/TeamPages";
import { ActionCardView, ActionEditor } from "../../src/components/assistant/ActionCard";
import {
  RoutinesPanelView,
  ConnectionPanelView,
  MemoryPanelView,
  type RoutineView,
  type RoutineProposalView,
  type ReadinessView,
  type PreferencesView,
} from "../../src/components/assistant/AssistantControls";
import { fixtureAction, subscribeFixtureActions, resetFixtureAction } from "./transport-fixture";
import type { ActionProposal } from "../../src/lib/agent/actions";
import { agentBots, getAgentBot } from "../../src/lib/agent/bots";
import type { ChatMessage } from "../../src/lib/agent/use-assistant";
import "../../src/styles.css";
import "./preview.css";

const id = "00000000-0000-4000-8000-000000000101";
const agenda = {
  tool: "agenda_today",
  data: {
    date: "2026-10-16",
    total: 2,
    events: [
      {
        id,
        titulo: "Visita de demonstração · Centro",
        tipo: "visita",
        status: "agendado",
        inicio: "2026-10-16T14:00:00-03:00",
        href: `/agenda?id=${id}`,
      },
      {
        id: id.replace("101", "102"),
        titulo: "Retorno de demonstração",
        tipo: "ligacao",
        status: "agendado",
        inicio: "2026-10-16T16:30:00-03:00",
        href: `/agenda?id=${id.replace("101", "102")}`,
      },
    ],
  },
};
const user: ChatMessage = {
  id: "u",
  role: "user",
  content: "Como está minha agenda hoje?",
  results: [],
};
const completed: ChatMessage = {
  id: "a",
  role: "assistant",
  content:
    "Encontrei 2 compromissos para hoje. Sua primeira visita está marcada para as 14h. Abra os registros abaixo para conferir os detalhes.",
  results: [agenda],
  steps: [{ id: "1", label: "Consultando agenda do dia", status: "done" }],
  created_at: "2026-10-16T12:00:00-03:00",
};
function Preview() {
  const queryClient = useQueryClient();
  const capture = new URLSearchParams(window.location.search).get("capture") === "1";
  const [previewAction, setPreviewAction] = useState<ActionProposal>(fixtureAction);
  useEffect(() => subscribeFixtureActions(setPreviewAction), []);
  const [routineEditingId, setRoutineEditingId] = useState<string>();
  const [state, setState] = useState(
    new URLSearchParams(window.location.search).get("state") ?? "empty",
  );
  const [selectedBot, setSelectedBot] = useState("agenda");
  const [role, setRole] = useState("admin");
  const [sent, setSent] = useState<ChatMessage[] | null>(null);
  const [motion, setMotion] = useState(true);
  const bots = agentBots.filter((bot) => bot.roles.includes(role as "admin"));
  const [routineProposal, setRoutineProposal] = useState<RoutineProposalView>();
  const [routines, setRoutines] = useState<RoutineView[]>([
    {
      id: "00000000-0000-4000-8000-000000000301",
      name: "Agenda do dia",
      template: "agenda_today",
      status: "active",
      hour: 8,
      minute: 0,
      timeZone: "America/Sao_Paulo",
      days: "every_day",
      nextRunAt: "2026-10-17T08:00:00-03:00",
      runs: [
        {
          id: "00000000-0000-4000-8000-000000000401",
          status: "completed",
          scheduledAt: "2026-10-16T08:00:00-03:00",
          finishedAt: "2026-10-16T08:00:10-03:00",
          attempts: 1,
        },
      ],
    },
  ]);
  const [preferences, setPreferences] = useState<PreferencesView>({
    tone: "curto",
    focusNeighborhoods: ["Centro"],
    preferredStart: "08:00",
    preferredEnd: "18:00",
  });
  const ready: ReadinessView = {
    status: "ready",
    delegation: "connected",
    schedulerEnabled: true,
    missing: [],
  };
  const action: ActionProposal =
    state === "action-executed"
      ? {
          ...fixtureAction,
          status: "executed",
          result: { text: "Visita de demonstração criada.", href: `/agenda?id=${id}` },
        }
      : state === "action-error"
        ? {
            ...fixtureAction,
            status: "failed",
            result: {
              text: "O registro foi alterado. Revise os dados antes de preparar uma nova proposta.",
            },
          }
        : previewAction;
  const busy = state === "streaming";
  let messages: ChatMessage[] =
    state === "conversation"
      ? [user, completed]
      : busy
        ? [
            user,
            {
              ...completed,
              content: "",
              results: [],
              steps: [{ id: "1", label: "Consultando agenda do dia", status: "running" }],
            },
          ]
        : state === "error"
          ? [user, { ...completed, content: "", results: [], failed: true }]
          : [];
  if (state.startsWith("action-"))
    messages = [
      { ...user, content: "Prepare uma visita para sexta às 14h." },
      {
        ...completed,
        content: "Confira os dados da visita.",
        results: [{ tool: "prepare_agenda_event", data: { action } }],
      },
    ];
  if (sent) messages = sent;
  return (
    <div
      data-preview-motion={motion ? "on" : "off"}
      className="min-h-dvh bg-background p-3 text-foreground sm:p-6"
    >
      {!capture && (
        <div className="mx-auto mb-4 flex max-w-[1380px] flex-wrap items-center justify-between gap-3 border-b border-border pb-3 text-[11px]">
          <p className="font-medium">Revisão local · dados fictícios</p>
          <div className="flex flex-wrap gap-1.5">
            {[
              ["mobilehome", "Home mobile"],
              ["team", "Equipe"],
              ["empty", "Vazio"],
              ["conversation", "Conversa"],
              ["loading", "Carregando"],
              ["streaming", "Consultando"],
              ["error", "Erro"],
              ["about", "Apresentação"],
              ["action-pending", "Ação pendente"],
              ["action-executed", "Ação concluída"],
              ["action-error", "Ação falhou"],
              ["action-edit", "Editar ação"],
              ["routines", "Rotinas"],
              ["preferences", "Preferências"],
              ["reconnect", "Reconectar"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`rounded-full border border-border px-3 py-1 ${state === key ? "bg-primary text-primary-foreground" : "bg-card"}`}
                onClick={() => {
                  resetFixtureAction();
                  queryClient.removeQueries({ queryKey: ["assistant-action"] });
                  setSent(null);
                  setState(key);
                }}
              >
                {label}
              </button>
            ))}
            <select
              aria-label="Perfil de teste"
              value={role}
              className="rounded-full border border-border bg-card px-2"
              onChange={(event) => setRole(event.target.value)}
            >
              <option value="admin">Admin</option>
              <option value="secretaria">Secretária</option>
              <option value="corretor">Corretor</option>
            </select>
            <button
              className="rounded-full border border-border px-3 py-1"
              onClick={() => document.documentElement.classList.toggle("dark")}
            >
              Tema
            </button>
            <button
              type="button"
              aria-pressed={motion}
              className="rounded-full border border-border px-3 py-1"
              onClick={() => setMotion((value) => !value)}
            >
              Animações
            </button>
          </div>
        </div>
      )}
      <div className="mx-auto max-w-[1380px]">
        {state === "action-edit" ? (
          <div className="assistant-surface mx-auto max-w-lg p-6">
            <h1 className="text-lg font-semibold">Editar proposta</h1>
            <ActionEditor action={action} onSave={() => setState("action-pending")} />
          </div>
        ) : state === "routines" ? (
          <div className="assistant-surface mx-auto max-w-2xl">
            <RoutinesPanelView
              routines={routines}
              readiness={ready}
              proposal={routineProposal}
              onPrepare={() => {
                setRoutineEditingId(undefined);
                setRoutineProposal({
                  name: "Resumo da agenda",
                  template: "agenda_today",
                  hour: 8,
                  minute: 0,
                  timeZone: "America/Sao_Paulo",
                  days: "every_day",
                });
              }}
              onSave={(proposal) => {
                setRoutines((old) => [
                  ...old.filter((item) => item.id !== routineEditingId),
                  {
                    ...proposal,
                    id: routineEditingId ?? crypto.randomUUID(),
                    status: "active",
                    nextRunAt: "2026-10-17T08:00:00-03:00",
                  },
                ]);
                setRoutineProposal(undefined);
              }}
              onClearProposal={() => setRoutineProposal(undefined)}
              onState={(routine) =>
                setRoutines((old) =>
                  old.map((item) =>
                    item.id === routine.id
                      ? { ...item, status: item.status === "active" ? "paused" : "active" }
                      : item,
                  ),
                )
              }
              onDelete={(id) => setRoutines((old) => old.filter((item) => item.id !== id))}
              onEdit={(routine) => {
                setRoutineEditingId(routine.id);
                setRoutineProposal(routine);
              }}
              connection={<ConnectionPanelView readiness={ready} />}
            />
          </div>
        ) : state === "preferences" ? (
          <div className="assistant-surface mx-auto max-w-md p-6">
            <MemoryPanelView
              key={JSON.stringify(preferences)}
              preferences={preferences}
              onSave={setPreferences}
              onDelete={() =>
                setPreferences({
                  tone: "curto",
                  focusNeighborhoods: [],
                  preferredStart: "08:00",
                  preferredEnd: "18:00",
                })
              }
            />
          </div>
        ) : state === "reconnect" ? (
          <div className="assistant-surface mx-auto max-w-lg p-6">
            <ConnectionPanelView
              readiness={{ ...ready, status: "needs_reauthorization", delegation: "revoked" }}
              onConnect={() => setState("routines")}
            />
          </div>
        ) : state === "mobilehome" ? (
          <MobileAssistantHomeView name="Demo" bots={bots} />
        ) : state === "team" ? (
          <TeamHomeView name="Demo" bots={bots} onboarding />
        ) : state === "about" ? (
          <BotPresentationView bot={getAgentBot(selectedBot)!} />
        ) : (
          <AssistantWorkspaceView
            key={state}
            name="Demo"
            bots={bots}
            bot={state === "empty" ? undefined : getAgentBot(selectedBot)}
            messages={messages}
            actions={state.startsWith("action-") ? [action] : []}
            busy={busy}
            historyLoading={state === "loading"}
            error={
              state === "error"
                ? "A conexão foi interrompida. Revise o pedido e tente novamente."
                : null
            }
            onSend={(text) => {
              setSent([{ ...user, content: text }, completed]);
              setState("conversation");
            }}
            onBotChange={(bot) => {
              setSelectedBot(bot);
              setSent(null);
              setState("bot-empty");
            }}
            onNew={() => {
              setSent(null);
              setState("empty");
            }}
            onCancel={() => setState("error")}
            context={state === "conversation" ? { kind: "agenda", id } : undefined}
            contextResult={state === "conversation" ? { record: agenda.data.events[0] } : undefined}
            briefing={
              state === "empty" ? (
                <DailyBriefingView
                  compact
                  items={[agenda, { tool: "stale_attendances", data: { total: 1 } }]}
                />
              ) : undefined
            }
          />
        )}
      </div>
    </div>
  );
}
const root = createRootRoute();
const route = createRoute({ getParentRoute: () => root, path: "/", component: Preview });
const router = createRouter({
  routeTree: root.addChildren([route]),
  history: createMemoryHistory({ initialEntries: ["/"] }),
});
const query = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const reactRoot = import.meta.hot?.data.reactRoot ?? createRoot(document.getElementById("root")!);
if (import.meta.hot) import.meta.hot.data.reactRoot = reactRoot;
reactRoot.render(
  <QueryClientProvider client={query}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);
