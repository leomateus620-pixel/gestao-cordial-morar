import { AssistantDialogContent as DialogContent } from "./AssistantDialog";
import { ArrowRight, Command, Expand, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { allowedBotsForRole, getAgentBot } from "@/lib/agent/bots";
import { useSession } from "@/lib/auth-mock";
import {
  useAssistant,
  useAssistantContext,
  useAssistantCatalog,
  type AssistantRecordContext,
} from "@/lib/agent/use-assistant";
import { WorkerAvatar } from "./WorkerAvatar";
import { CordialBotBrand, CordialBotWordmark } from "@/components/brand/CordialBotBrand";
import { AssistantMark } from "@/components/brand/AssistantMark";
import { ChoiceQuestion } from "./ChoiceQuestion";
import { useWorkspaceViewport } from "./use-workspace-viewport";
import { saveAssistantDraft } from "./draft-handoff";
import { contextualSuggestions } from "@/lib/agent/context-suggestions";
import { ChoiceChips, Composer } from "./AgentWorkspace";
import { RichToolResult, StepTimeline } from "./RichResults";
import "./assistant.css";

export { contextFromLocation, contextSuggestions } from "@/lib/agent/context-routing";
import {
  contextFromLocation,
  contextSuggestions,
  preferredBotForContext,
  contextForActiveBot,
} from "@/lib/agent/context-routing";

export function GlobalAssistant() {
  const session = useSession();
  const location = useRouterState({ select: (s) => s.location });
  const navigate = useNavigate();
  const [copilot, setCopilot] = useState(false);
  const drawerViewport = useWorkspaceViewport(copilot, true);
  const [command, setCommand] = useState(false);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [focusRequest, setFocusRequest] = useState(0);
  const [contextCleared, setContextCleared] = useState(false);
  const routeContext = contextFromLocation(location.pathname, location.searchStr);
  const [pickedContext, setPickedContext] = useState<AssistantRecordContext | undefined>();
  const context = contextCleared ? undefined : (pickedContext ?? routeContext);
  const catalog = useAssistantCatalog();
  const bots = catalog.bots;
  const active = bots.filter((b) => b.active);
  const preferred = bots.find((entry) => entry.id === preferredBotForContext(context));
  const bot = preferred ?? bots[0];
  const chatBot = bot?.active ? bot : active[0];
  const chatContext = contextForActiveBot(chatBot?.id ?? "agenda", context);
  const chat = useAssistant(chatBot?.id ?? "agenda", undefined, chatContext);
  const focus = useAssistantContext(copilot ? context : undefined);
  useEffect(() => {
    if (!active.length) return;
    function shortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k" && !event.shiftKey) {
        if (session?.modules.includes("busca") && location.pathname !== "/imoveis") return;
        event.preventDefault();
        event.stopImmediatePropagation();
        setCommand((open) => !open);
      }
    }
    window.addEventListener("keydown", shortcut, true);
    return () => window.removeEventListener("keydown", shortcut, true);
  }, [active.length, session?.modules, location.pathname]);
  useEffect(() => {
    setCopilot(false);
    setDraft("");
    setPickedContext(undefined);
    setContextCleared(false);
    chat.reset();
  }, [location.pathname, location.searchStr]);
  if (!session || !active.length || !bot || !chatBot || catalog.isError) return null;
  function openWorkspace(botId: string, prompt?: string, conversation?: string) {
    setCommand(false);
    setCopilot(false);
    void navigate({
      to: "/assistente/$botId",
      params: { botId },
      search: {
        prompt,
        conversation,
        kind: contextForActiveBot(botId, context)?.kind,
        record: contextForActiveBot(botId, context)?.id,
      },
    });
  }
  return (
    <>
      {!location.pathname.startsWith("/assistente") && !/^\/vistorias\/[0-9a-f-]{36}/i.test(location.pathname) && (
        <button
          type="button"
          className="assistant-copilot"
          aria-label="Abrir copiloto contextual"
          title="Cordial Bot · ⌘/Ctrl K"
          onClick={() => setCopilot(true)}
        >
          <AssistantMark size={30} />
          <CordialBotWordmark className="!text-sm" />
        </button>
      )}
      <Sheet open={copilot} onOpenChange={setCopilot}>
        <SheetContent
          ref={drawerViewport}
          closeLabel="Fechar copiloto"
          className="assistant-panel assistant-copilot-panel flex !w-full !max-w-[480px] flex-col !gap-0 !p-0"
        >
          <SheetHeader className="shrink-0 border-b border-border px-5 py-4 text-left">
            <CordialBotBrand compact className="mb-3" />
            <div className="flex items-center gap-2">
              <WorkerAvatar bot={bot} size={42} working={chat.busy} />
              <div>
                <SheetTitle className="text-base">
                  {bot.active ? bot.name : `${bot.name} · indisponível`}
                </SheetTitle>
                <SheetDescription className="sr-only">
                  Converse com o agente e consulte o registro em foco.
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-5">
            {context && (
              <div className="mb-5 rounded-2xl bg-muted/40 p-3">
                <p className="mb-2 text-[10px] font-semibold text-primary">Registro em foco</p>
                {focus.isLoading ? (
                  <div className="assistant-skeleton h-14" />
                ) : focus.isError ? (
                  <p role="alert" className="text-xs text-muted-foreground">
                    Não foi possível consultar o contexto.
                  </p>
                ) : focus.data ? (
                  <RichToolResult
                    result={{ tool: "get_record_context", data: focus.data }}
                    allowSelection={false}
                  />
                ) : null}
              </div>
            )}
            {!bot.active ? (
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Este agente está pausado. Continue no módulo ou escolha outro colega.
                </p>
                <a href="/alugueis" className="assistant-chip mt-4 text-primary">
                  Abrir Aluguéis <ArrowRight size={12} />
                </a>
                <p className="mb-3 mt-6 text-[11px] font-semibold">Outros agentes</p>
                <div className="flex flex-wrap gap-2">
                  {active.map((colleague) => (
                    <button
                      key={colleague.id}
                      type="button"
                      onClick={() => openWorkspace(colleague.id)}
                      className="assistant-chip !py-1 !pl-1"
                    >
                      <WorkerAvatar bot={colleague} size={28} />
                      {colleague.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : chat.messages.length === 0 ? (
              <>
                <ChoiceChips choices={contextualSuggestions(bot, context)} onChoose={setDraft} />
              </>
            ) : (
              chat.messages.map((m, index) => (
                <article key={m.id} className="mb-5">
                  {m.role === "user" ? (
                    <p className="assistant-user">{m.content}</p>
                  ) : (
                    <>
                      <p className="mb-2 text-xs font-semibold">{bot.name}</p>
                      {m.steps && (
                        <StepTimeline
                          steps={m.steps}
                          awaitingChoice={
                            !!m.choices?.length && index === chat.messages.length - 1 && !chat.busy
                          }
                        />
                      )}
                      <p className="assistant-message-content">{m.content}</p>
                      {m.results.map((r, i) => (
                        <RichToolResult key={i} result={r} />
                      ))}
                      {m.choices?.map((choice) => (
                        <ChoiceQuestion
                          key={choice.id}
                          choice={choice}
                          disabled={chat.busy || index !== chat.messages.length - 1}
                          onChoose={(option) =>
                            void chat.send(`Sobre “${choice.question}”: ${option.value}`)
                          }
                          onOther={() => {
                            setFocusRequest((n) => n + 1);
                          }}
                        />
                      ))}
                      {!chat.busy && index === chat.messages.length - 1 && !m.choices?.length && (
                        <ChoiceChips
                          choices={contextualSuggestions(bot, context, m.results).slice(0, 2)}
                          onChoose={(text) => {
                            setDraft(text);
                            setFocusRequest((n) => n + 1);
                          }}
                        />
                      )}
                    </>
                  )}
                </article>
              ))
            )}
            {chat.error && (
              <p role="alert" className="text-xs text-destructive">
                {chat.error}
              </p>
            )}
          </div>
          {bot.active && (
            <>
              <button
                type="button"
                className="mx-5 mb-2 inline-flex min-h-11 items-center justify-center gap-2 text-xs text-primary disabled:opacity-40"
                disabled={chat.busy}
                onClick={() => {
                  saveAssistantDraft(session.id, bot.id, draft);
                  openWorkspace(bot.id, undefined, chat.conversationId);
                }}
              >
                <Expand size={12} />
                Abrir conversa
              </button>
              <Composer
                bot={bot}
                value={draft}
                onChange={setDraft}
                onSend={() => {
                  void chat.send(draft);
                  setDraft("");
                }}
                busy={chat.busy}
                context={context}
                focusRequest={focusRequest}
                onRecordPick={(record) => {
                  setPickedContext(record);
                  setContextCleared(!record);
                }}
                onCancel={chat.cancel}
              />
            </>
          )}
        </SheetContent>
      </Sheet>
      <Dialog open={command} onOpenChange={setCommand}>
        <DialogContent className="!gap-0 !rounded-3xl !p-0 sm:!max-w-xl">
          <DialogHeader className="px-6 pt-6 text-left">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Command size={17} className="text-primary" />O que precisa acontecer?
            </DialogTitle>
            <DialogDescription className="sr-only">
              Converse com sua equipe a partir de qualquer tela do Gestão.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (query.trim()) openWorkspace(chatBot.id, query);
            }}
            className="m-5 flex items-center gap-2 rounded-2xl border border-border p-3"
          >
            <Search size={16} className="shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              maxLength={4000}
              aria-label="Pergunte ao Cordial Bot"
              placeholder="Pergunte ou escolha um colega…"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
            <button
              type="submit"
              disabled={!query.trim()}
              aria-label="Abrir conversa com este pedido"
              className="assistant-icon-button !size-8 bg-primary !text-primary-foreground disabled:opacity-40"
            >
              <ArrowRight size={15} />
            </button>
          </form>
          <div className="border-t border-border px-5 py-4">
            <p className="mb-3 text-[10px] font-semibold text-muted-foreground">Sua equipe</p>
            <div className="grid grid-cols-2 gap-2">
              {active.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => openWorkspace(b.id, query || undefined)}
                  className="flex items-center gap-2 rounded-2xl bg-muted/35 p-2 text-left hover:bg-primary/5"
                >
                  <WorkerAvatar bot={b} size={37} />
                  <div>
                    <p className="text-xs font-semibold">{b.name}</p>
                    <p className="mt-0.5 text-[9px] text-muted-foreground">
                      {b.modules.slice(0, 2).join(" · ")}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 border-t border-border px-5 py-3 text-[9px] text-muted-foreground">
            <span className="ml-auto">Esc para fechar</span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
