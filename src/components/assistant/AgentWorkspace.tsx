import {
  ArrowLeft,
  ArrowRight,
  AtSign,
  Check,
  ChevronDown,
  Copy,
  FileText,
  Info,
  ListFilter,
  Menu,
  MoreHorizontal,
  MessageCircle,
  Mic,
  Paperclip,
  Plus,
  RotateCcw,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  ThumbsUp,
  X,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { allowedBotsForRole, getAgentBot, type AgentBot } from "@/lib/agent/bots";
import {
  useAssistant,
  useAssistantBriefing,
  useAssistantContext,
  useAssistantActions,
  useAssistantAction,
  useAssistantCatalog,
  type AssistantRecordContext,
  type ChatMessage,
} from "@/lib/agent/use-assistant";
import { contextualSuggestions } from "@/lib/agent/context-suggestions";
import { ChoiceQuestion } from "./ChoiceQuestion";
import { takeAssistantDraft } from "./draft-handoff";
import { useWorkspaceViewport } from "./use-workspace-viewport";
import type { AssistantChoice } from "@/lib/agent/stream";
import type { AssistantResult } from "@/lib/agent/stream";
import { useSession } from "@/lib/auth-mock";
import { WorkerAvatar } from "./WorkerAvatar";
import { RichToolResult, StepTimeline } from "./RichResults";
import "./assistant.css";
import { Composer } from "./Composer";
import { contextForActiveBot } from "@/lib/agent/context-routing";
import type { ActionProposal } from "@/lib/agent/actions";
import { ActionCardView, AssistantActionCard, actionViewState } from "./ActionCard";
import {
  useAssistantControls,
  RoutinesPanelView,
  MemoryPanelView,
  RoutineRunResult,
  type ReadinessView,
} from "./AssistantControls";
import { CordialBotBrand, CordialBotWordmark } from "@/components/brand/CordialBotBrand";
import { AssistantMark } from "@/components/brand/AssistantMark";
import { FactsPanel } from "./FactsPanel";
export { Composer } from "./Composer";

export type ConversationItem = { id: string; bot_id: string; title: string; updated_at: string };
export function ChoiceChips({
  choices,
  onChoose,
  disabled = false,
}: {
  choices: string[];
  onChoose: (s: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {choices.map((c) => (
        <button
          key={c}
          type="button"
          className="assistant-chip text-left"
          disabled={disabled}
          onClick={() => onChoose(c)}
        >
          {c}
          <ArrowRight size={12} className="shrink-0 opacity-45" />
        </button>
      ))}
    </div>
  );
}
export function NeedsYouSection({
  actions = [],
  error = false,
  onOpen,
}: {
  actions?: ActionProposal[];
  error?: boolean;
  onOpen?: () => void;
}) {
  const pending = actions.filter((action) => actionViewState(action) === "pending");
  return (
    <section className="my-6 border-y border-border py-4">
      <button
        type="button"
        onClick={onOpen}
        disabled={!pending.length || !onOpen}
        className="flex w-full items-center gap-2 text-left text-[10px] font-semibold text-muted-foreground"
      >
        <span className="size-1.5 rounded-full bg-primary/50" />
        Precisa de você
        {pending.length > 0 && (
          <span className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[9px] text-primary-foreground">
            {pending.length}
          </span>
        )}
      </button>
      {error ? (
        <p role="alert" className="mt-2 text-[10px] text-muted-foreground">
          Pendências indisponíveis.
        </p>
      ) : pending.length ? (
        <button
          type="button"
          className="mt-2 w-full truncate text-left text-[10px] text-primary"
          onClick={onOpen}
        >
          {pending[0].title}
        </button>
      ) : (
        <p className="mt-2 text-[10px] text-muted-foreground">Nenhuma pendência.</p>
      )}
    </section>
  );
}
export function WorkerList({
  bots,
  selected,
  onSelect,
}: {
  bots: AgentBot[];
  selected?: string;
  onSelect: (botId: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      {bots.map((b) => (
        <button
          key={b.id}
          type="button"
          onClick={() => onSelect(b.id)}
          disabled={!b.active}
          className={`flex w-full items-center gap-2 rounded-2xl px-2 py-2 text-left transition-colors ${selected === b.id ? "bg-primary/7" : "hover:bg-muted/70"} disabled:opacity-50`}
          aria-current={selected === b.id ? "page" : undefined}
        >
          <WorkerAvatar bot={b} size={35} />
          <div className="min-w-0">
            <p className="text-xs font-semibold">{b.name}</p>
            <p className="mt-0.5 truncate text-[9px] text-muted-foreground">
              {b.active ? b.modules.slice(0, 2).join(" · ") : "Pausado"}
            </p>
          </div>
          {selected === b.id && <span className="ml-auto size-1.5 rounded-full bg-primary" />}
        </button>
      ))}
    </div>
  );
}
export function AgentSidebar({
  bots,
  bot,
  conversations,
  onBotChange,
  onConversation,
  onNew,
  actions,
  actionsError,
  onPending,
}: {
  actions?: ActionProposal[];
  actionsError?: boolean;
  onPending?: () => void;
  bots: AgentBot[];
  bot?: AgentBot;
  conversations: ConversationItem[];
  onBotChange: (id: string) => void;
  onConversation: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <>
      <a
        href="/assistente/equipe"
        className="mb-6 flex items-center gap-2 text-[10px] font-semibold tracking-wide text-primary"
      >
        <CordialBotBrand compact />
      </a>
      <button
        type="button"
        onClick={onNew}
        className="assistant-small-button mb-6 w-full !rounded-full !py-2.5 !text-[11px]"
      >
        <Plus size={14} />
        Nova conversa
      </button>
      <a
        href="/assistente/estudio"
        className="assistant-small-button mb-6 w-full !rounded-full !py-2.5 !text-[11px]"
      >
        Estúdio de conteúdo
      </a>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[10px] font-semibold text-muted-foreground">Sua equipe</h2>
        <a href="/assistente/equipe" className="text-[9px] text-primary">
          Conhecer
        </a>
      </div>
      <WorkerList bots={bots} selected={bot?.id} onSelect={onBotChange} />
      <NeedsYouSection actions={actions} error={actionsError} onOpen={onPending} />
      <h2 className="mb-3 text-[10px] font-semibold text-muted-foreground">Conversas recentes</h2>
      <div className="space-y-1">
        {conversations.length ? (
          conversations.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onConversation(c.id)}
              className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left hover:bg-muted/60"
            >
              <MessageCircle size={12} className="shrink-0 text-muted-foreground" />
              <span className="truncate text-[10px]">{c.title}</span>
            </button>
          ))
        ) : (
          <p className="px-2 text-[10px] leading-relaxed text-muted-foreground">
            Nenhuma conversa ainda.
          </p>
        )}
      </div>
      <a
        href="/assistente/equipe"
        className="mt-6 inline-flex items-center gap-1 text-[10px] text-muted-foreground"
      >
        <Info size={11} />
        Sobre a equipe
      </a>
    </>
  );
}

export function EmptyStateHero({
  name,
  bots,
  bot,
  onChoose,
  context,
  compact = false,
}: {
  compact?: boolean;
  context?: AssistantRecordContext;
  name: string;
  bots: AgentBot[];
  bot?: AgentBot;
  onChoose: (prompt: string) => void;
}) {
  return (
    <div className={`assistant-hero ${compact ? "assistant-hero-compact" : ""}`}>
      <div className="assistant-mascot-group">
        {(bot
          ? [
              bots.find((b) => b.id !== bot.id) ?? bot,
              bot,
              bots.find((b) => b.id !== bot.id && b.id !== bots[0]?.id) ?? bot,
            ]
          : bots.slice(0, 3)
        ).map((b, i) => (
          <WorkerAvatar
            key={`${b.id}${i}`}
            bot={b}
            size={compact ? (i === 1 ? 76 : 56) : i === 1 ? 110 : 79}
          />
        ))}
      </div>
      <h1
        className={`${compact ? "mt-0" : "mt-3"} text-2xl font-semibold tracking-tight sm:text-[28px]`}
      >
        {bot
          ? ({
              agenda: "Vamos organizar seu dia?",
              match: "Vamos encontrar o imóvel certo?",
              capta: "O que acompanhamos hoje?",
              lead: "Quem precisa de atenção?",
            }[bot.id] ?? bot.tagline)
          : `Olá, ${name}.`}
      </h1>
      <div className={compact ? "h-3" : "h-6"} aria-hidden="true" />
      {bot ? (
        <div className="max-w-lg">
          <ChoiceChips choices={contextualSuggestions(bot, context)} onChoose={onChoose} />
        </div>
      ) : (
        <div className="flex flex-wrap justify-center gap-2">
          {bots
            .filter((b) => b.active)
            .map((b) => (
              <a key={b.id} href={`/assistente/${b.id}`} className="assistant-chip !pl-1.5 !py-1">
                <WorkerAvatar bot={b} size={30} />
                {b.name}
              </a>
            ))}
        </div>
      )}
    </div>
  );
}

function MessageFeedback({ message, onRetry }: { message: ChatMessage; onRetry?: () => void }) {
  const [copied, setCopied] = useState(false);
  const [useful, setUseful] = useState(false);
  return (
    <div className="mt-2 flex items-center gap-0.5 text-muted-foreground">
      <button
        type="button"
        className="assistant-icon-button !size-7"
        aria-label={copied ? "Resposta copiada" : "Copiar resposta"}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(message.content);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
      </button>
      {onRetry && (
        <button
          type="button"
          className="assistant-icon-button !size-7"
          aria-label="Refazer consulta"
          onClick={onRetry}
        >
          <RotateCcw size={12} />
        </button>
      )}
      <button
        type="button"
        className={`assistant-icon-button !size-7 ${useful ? "text-primary bg-primary/7" : ""}`}
        aria-label="Marcar resposta como útil nesta conversa"
        aria-pressed={useful}
        onClick={() => setUseful(!useful)}
      >
        <ThumbsUp size={12} />
      </button>
      {message.created_at && (
        <time className="ml-1 text-[9px]">
          {new Date(message.created_at).toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "America/Sao_Paulo",
          })}
        </time>
      )}
    </div>
  );
}
export function ContextPanel({
  context,
  result,
  loading = false,
  error = false,
}: {
  context?: AssistantRecordContext;
  result?: unknown;
  loading?: boolean;
  error?: boolean;
}) {
  return (
    <>
      <h2 className="text-xs font-semibold text-muted-foreground">Em foco</h2>
      {loading ? (
        <div className="mt-5 space-y-2" role="status" aria-label="Carregando contexto">
          <div className="assistant-skeleton h-20" />
          <div className="assistant-skeleton h-6 w-3/4" />
        </div>
      ) : error ? (
        <p role="alert" className="mt-5 text-xs text-destructive">
          Não foi possível carregar este registro.
        </p>
      ) : context && result ? (
        <div className="mt-5">
          <RichToolResult
            result={{ tool: "get_record_context", data: result }}
            allowSelection={false}
          />
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-dashed border-border px-4 py-6 text-center">
          <AtSign className="mx-auto mb-3 size-5 text-primary/60" />
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Escolha um registro com @.
          </p>
        </div>
      )}
    </>
  );
}
export function RoutinesTab({ bot }: { bot?: AgentBot }) {
  return (
    <div className="m-auto max-w-sm px-6 py-12 text-center">
      <RotateCcw className="mx-auto mb-4 size-7 text-primary/50" />
      <h2 className="text-xl font-semibold tracking-tight">Rotinas</h2>

      {bot?.routines.map((r) => (
        <p
          key={r}
          className="mt-4 rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground"
        >
          Ideia: {r}
        </p>
      ))}
      <span className="mt-5 inline-flex rounded-full bg-muted px-3 py-1.5 text-[10px] text-muted-foreground">
        Em breve
      </span>
    </div>
  );
}

export type AssistantWorkspaceViewProps = {
  name: string;
  bots: AgentBot[];
  bot?: AgentBot;
  messages: ChatMessage[];
  conversations?: ConversationItem[];
  busy?: boolean;
  readOnly?: boolean;
  error?: string | null;
  historyLoading?: boolean;
  historyNotice?: boolean;
  context?: AssistantRecordContext;
  contextResult?: unknown;
  contextLoading?: boolean;
  contextError?: boolean;
  initialPrompt?: string;
  onSend: (text: string) => void;
  onBotChange: (id: string) => void;
  onConversation?: (id: string) => void;
  onNew: () => void;
  briefing?: React.ReactNode;
  onRecordPick?: (record?: AssistantRecordContext) => void;
  onChoice?: (choice: AssistantChoice, option: AssistantChoice["options"][number]) => void;
  onCancel?: () => void;
  actions?: ActionProposal[];
  actionsError?: boolean;
  initialTab?: string;
  initialActionId?: string;
  actionLoading?: boolean;
  actionError?: boolean;
  onActionRetry?: () => void;
  routineContent?: React.ReactNode;
  memoryContent?: React.ReactNode;
};
export function AssistantWorkspaceView({
  name,
  bots,
  bot,
  messages,
  conversations = [],
  busy = false,
  readOnly = false,
  error,
  historyLoading = false,
  historyNotice = false,
  context,
  contextResult,
  contextLoading,
  contextError,
  initialPrompt = "",
  onSend,
  onBotChange,
  onConversation = () => {},
  onNew,
  briefing,
  onRecordPick,
  onChoice,
  onCancel,
  actions = [],
  actionsError,
  initialTab = "Conversa",
  initialActionId,
  actionLoading = false,
  actionError = false,
  onActionRetry,
  routineContent,
  memoryContent,
}: AssistantWorkspaceViewProps) {
  const viewportRef = useWorkspaceViewport();
  const [focusRequest, setFocusRequest] = useState(0);
  const [draft, setDraft] = useState(initialPrompt);
  const [tab, setTab] = useState(initialTab);
  const [pendingOpen, setPendingOpen] = useState(!!initialActionId);
  const [memoryOpen, setMemoryOpen] = useState(false);
  useEffect(() => setTab(initialTab), [initialTab]);
  const tabsId = useId();
  const tabNames = ["Conversa", "Rotinas", "Resultados", "Sobre"];
  const [sidebar, setSidebar] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const tail = useRef<HTMLDivElement>(null);
  const previousMessageCount = useRef(0);
  useEffect(() => setDraft(initialPrompt), [initialPrompt, bot?.id]);
  useEffect(() => {
    if (messages.length || busy) {
      tail.current?.scrollIntoView({
        block: "nearest",
        behavior: previousMessageCount.current ? "smooth" : "auto",
      });
    } else if (previousMessageCount.current > 0) {
      tail.current?.closest(".assistant-conversation")?.scrollTo({ top: 0 });
    }
    previousMessageCount.current = messages.length;
  }, [messages, busy]);
  function send(text: string) {
    if (!busy && !readOnly) {
      onSend(text);
      setDraft("");
    }
  }
  const sidebarContent = (
    <AgentSidebar
      actions={actions}
      actionsError={actionsError}
      onPending={() => setPendingOpen(true)}
      bots={bots}
      bot={bot}
      conversations={conversations}
      onBotChange={(id) => {
        onBotChange(id);
        setSidebar(false);
      }}
      onConversation={(id) => {
        onConversation(id);
        setSidebar(false);
      }}
      onNew={() => {
        onNew();
        setSidebar(false);
      }}
    />
  );
  const results = messages.flatMap((m) => m.results);
  return (
    <div ref={viewportRef} className="assistant-surface assistant-workspace">
      <aside className="assistant-workspace-sidebar" aria-label="Equipe e conversas">
        {sidebarContent}
      </aside>
      <section className="assistant-workspace-main">
        <header className="assistant-workspace-header flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
          <button
            type="button"
            className="assistant-agent-switcher flex min-w-0 items-center gap-2 rounded-full border border-border bg-muted/20 py-1 pl-1.5 pr-3"
            aria-label="Abrir equipe e conversas"
            onClick={() => setSidebar(true)}
          >
            {bot ? (
              <WorkerAvatar bot={bot} size={30} working={busy} />
            ) : (
              <AssistantMark size={26} className="m-1" />
            )}
            <span className="truncate text-xs font-semibold">
              {bot?.name ?? <CordialBotWordmark />}
            </span>
            <span className="hidden text-[10px] text-muted-foreground sm:inline">
              · {bot?.category ?? "Nova conversa"}
            </span>
            <ChevronDown size={12} className="ml-2 text-muted-foreground" />
          </button>
          <span className="ml-auto hidden items-center gap-1.5 text-[9px] text-muted-foreground sm:flex">
            <span
              className={`size-1.5 rounded-full ${busy ? "bg-primary assistant-pulse" : "bg-emerald-500/70"}`}
            />
            {busy ? "Trabalhando" : "Você no comando"}
          </span>
          {actions.some((action) => actionViewState(action) === "pending") && (
            <button
              type="button"
              className="assistant-icon-button relative md:hidden"
              aria-label={`Precisa de você: ${actions.filter((action) => actionViewState(action) === "pending").length} pendências`}
              onClick={() => setPendingOpen(true)}
            >
              <Check size={17} />
              <span className="absolute right-0 top-0 rounded-full bg-primary px-1 text-[10px] text-primary-foreground">
                {actions.filter((action) => actionViewState(action) === "pending").length}
              </span>
            </button>
          )}
          <button
            type="button"
            className="assistant-icon-button xl:hidden"
            aria-label="Abrir painel de contexto"
            onClick={() => setShowContext(true)}
          >
            <ListFilter size={16} />
          </button>
          <button
            type="button"
            className="assistant-icon-button !hidden md:!inline-flex"
            aria-label="Preferências do assistente"
            onClick={() => setMemoryOpen(true)}
          >
            <SlidersHorizontal size={16} />
          </button>
          {bot && (
            <a
              href={`/assistente/equipe/${bot.id}`}
              className="assistant-icon-button !hidden md:!inline-flex"
              aria-label={`Sobre ${bot.name}`}
            >
              <Info size={16} />
            </a>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="assistant-icon-button md:hidden"
                aria-label="Mais opções"
              >
                <MoreHorizontal size={18} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 rounded-2xl p-1.5">
              <DropdownMenuItem
                className="min-h-11 rounded-xl"
                onSelect={() => setMemoryOpen(true)}
              >
                <SlidersHorizontal size={16} />
                Preferências
              </DropdownMenuItem>
              {bot && (
                <DropdownMenuItem asChild className="min-h-11 rounded-xl">
                  <a href={`/assistente/equipe/${bot.id}`}>
                    <Info size={16} />
                    Sobre {bot.name}
                  </a>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <div className="assistant-tabs" role="tablist" aria-label="Áreas do agente">
          {tabNames.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              id={`${tabsId}-${t}`}
              tabIndex={tab === t ? 0 : -1}
              aria-selected={tab === t}
              onKeyDown={(event) => {
                const index = tabNames.indexOf(t);
                const next =
                  event.key === "ArrowRight"
                    ? (index + 1) % tabNames.length
                    : event.key === "ArrowLeft"
                      ? (index + tabNames.length - 1) % tabNames.length
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? tabNames.length - 1
                          : -1;
                if (next >= 0) {
                  event.preventDefault();
                  setTab(tabNames[next]);
                  event.currentTarget.parentElement
                    ?.querySelectorAll<HTMLButtonElement>("[role=tab]")
                    [next]?.focus();
                }
              }}
              onClick={() => setTab(t)}
            >
              {t}
              {t === "Resultados" && results.length > 0 && (
                <span className="ml-1 rounded-full bg-primary/8 px-1 text-[8px]">
                  {results.length}
                </span>
              )}
            </button>
          ))}
        </div>
        {tab === "Conversa" ? (
          <>
            <div
              className="assistant-conversation"
              role="log"
              aria-label="Conversa com o assistente"
              aria-live="polite"
            >
              {historyNotice && !historyLoading && (
                <p
                  role="status"
                  className="mb-5 rounded-xl bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground"
                >
                  Resultados atualizados. Refine a busca se precisar.
                </p>
              )}
              {historyLoading ? (
                <div role="status" aria-label="Carregando conversa" className="space-y-4">
                  <div className="assistant-skeleton ml-auto h-16 w-3/4" />
                  <div className="assistant-skeleton h-28 w-5/6" />
                </div>
              ) : messages.length === 0 ? (
                <>
                  <EmptyStateHero
                    compact={!!briefing}
                    name={name}
                    bots={bots}
                    bot={bot}
                    context={context}
                    onChoose={(text) => {
                      setDraft(text);
                      setFocusRequest((n) => n + 1);
                    }}
                  />
                  {briefing}
                </>
              ) : (
                messages.map((m, i) =>
                  m.role === "user" ? (
                    <div key={m.id} className="assistant-message">
                      <p className="assistant-user">{m.content}</p>
                    </div>
                  ) : (
                    <article key={m.id} className="assistant-message">
                      <div className="mb-3 flex items-center gap-2">
                        {bot && (
                          <WorkerAvatar
                            bot={bot}
                            size={29}
                            working={busy && i === messages.length - 1}
                          />
                        )}
                        <span className="text-xs font-semibold">
                          {bot?.name ?? "Equipe Cordial"}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{bot?.modules[0]}</span>
                      </div>
                      <div className="pl-1 sm:pl-9">
                        {m.steps && (
                          <StepTimeline
                            steps={m.steps}
                            awaitingChoice={
                              !!m.choices?.length && i === messages.length - 1 && !busy && !readOnly
                            }
                          />
                        )}
                        <div className="assistant-message-content">
                          {m.content ||
                            (!m.failed && busy && i === messages.length - 1 ? (
                              <span
                                className="inline-flex items-center gap-1"
                                aria-label="Preparando resposta"
                              >
                                <span className="assistant-pulse size-1.5 rounded-full bg-primary" />
                                <span className="assistant-pulse size-1.5 rounded-full bg-primary/50" />
                                <span className="assistant-pulse size-1.5 rounded-full bg-primary/25" />
                              </span>
                            ) : null)}
                        </div>
                        {m.results.map((r, j) => (
                          <RichToolResult key={j} result={r} />
                        ))}
                        {m.choices?.map((choice) => (
                          <ChoiceQuestion
                            key={choice.id}
                            choice={choice}
                            disabled={busy || readOnly || i !== messages.length - 1}
                            onChoose={(option) =>
                              onChoice
                                ? onChoice(choice, option)
                                : send(`Sobre “${choice.question}”: ${option.value}`)
                            }
                            onOther={() => {
                              setFocusRequest((request) => request + 1);
                            }}
                          />
                        ))}
                        {!busy &&
                          !readOnly &&
                          bot &&
                          i === messages.length - 1 &&
                          !m.choices?.length &&
                          m.results.length > 0 && (
                            <div className="mt-4">
                              <ChoiceChips
                                choices={contextualSuggestions(bot, context, m.results).slice(0, 2)}
                                onChoose={(text) => {
                                  setDraft(text);
                                  setFocusRequest((n) => n + 1);
                                }}
                              />
                            </div>
                          )}
                        {m.content && !busy && (
                          <MessageFeedback
                            message={m}
                            onRetry={
                              readOnly
                                ? undefined
                                : () => {
                                    const previous = messages
                                      .slice(0, i)
                                      .reverse()
                                      .find((x) => x.role === "user");
                                    if (previous) setDraft(previous.content);
                                  }
                            }
                          />
                        )}
                      </div>
                    </article>
                  ),
                )
              )}
              {error && (
                <div
                  role="alert"
                  className="mx-auto max-w-xl rounded-2xl border border-destructive/20 bg-destructive/5 p-4"
                >
                  <p className="text-xs leading-relaxed text-destructive">{error}</p>
                  <button
                    type="button"
                    className="mt-2 text-xs font-semibold text-primary"
                    onClick={() => {
                      const previous = messages
                        .slice()
                        .reverse()
                        .find((x) => x.role === "user");
                      if (previous) setDraft(previous.content);
                    }}
                  >
                    Revisar pedido e tentar novamente
                  </button>
                </div>
              )}
              <div ref={tail} />
            </div>
            {readOnly ? (
              <p
                role="status"
                className="border-t border-border p-4 text-center text-sm text-muted-foreground"
              >
                {bot
                  ? "Este agente está pausado. Seu histórico continua disponível."
                  : "A equipe está pausada. Seu histórico continua disponível."}
              </p>
            ) : (
              <Composer
                bot={bot}
                value={draft}
                onChange={setDraft}
                onSend={() => send(draft)}
                busy={busy}
                onRecordPick={onRecordPick}
                context={context}
                focusRequest={focusRequest}
                onCancel={onCancel}
              />
            )}
          </>
        ) : tab === "Rotinas" ? (
          (routineContent ?? <RoutinesTab bot={bot} />)
        ) : tab === "Resultados" ? (
          <div className="assistant-conversation">
            {results.length ? (
              results.map((r, i) => <RichToolResult key={i} result={r} />)
            ) : (
              <div className="py-16 text-center">
                <FileText className="mx-auto mb-4 text-primary/40" />
                <p className="text-sm font-semibold">Nenhum resultado ainda</p>
                <button
                  type="button"
                  className="assistant-chip mt-4"
                  onClick={() => setTab("Conversa")}
                >
                  Fazer uma consulta
                  <ArrowRight size={12} />
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="assistant-conversation">
            <h2 className="text-xl font-semibold">
              {bot ? `Conheça ${bot.name}` : "Conheça sua equipe"}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {bot?.description ?? "Agentes especializados nos módulos do Gestão Cordial."}
            </p>
            {bot && (
              <div className="mt-5 flex flex-wrap gap-2">
                {bot.modules.map((module) => (
                  <span
                    key={module}
                    className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground"
                  >
                    {module}
                  </span>
                ))}
              </div>
            )}
            <a
              href={bot ? `/assistente/equipe/${bot.id}` : "/assistente/equipe"}
              className="assistant-chip mt-6"
            >
              Habilidades e limites
              <ArrowRight size={13} />
            </a>
          </div>
        )}
      </section>
      <aside className="assistant-context" aria-label="Registro em foco">
        <ContextPanel
          context={context}
          result={contextResult}
          loading={contextLoading}
          error={contextError}
        />
      </aside>
      <Sheet open={pendingOpen} onOpenChange={setPendingOpen}>
        <SheetContent
          closeLabel="Fechar pendências"
          className="assistant-panel !w-full !max-w-lg overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle>Precisa de você</SheetTitle>
            <SheetDescription className="sr-only">
              Revise e confirme cada proposta.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            {actionLoading && (
              <p role="status" className="text-sm text-muted-foreground">
                Carregando proposta…
              </p>
            )}
            {actionError && (
              <div role="alert" className="rounded-xl bg-muted p-3 text-sm">
                <p>Não foi possível abrir esta proposta com seu acesso atual.</p>
                {onActionRetry && (
                  <button type="button" className="assistant-chip mt-3" onClick={onActionRetry}>
                    Tentar novamente
                  </button>
                )}
              </div>
            )}
            {actions
              .filter(
                (action) => actionViewState(action) === "pending" || action.id === initialActionId,
              )
              .map((action) => (
                <AssistantActionCard key={action.id} action={action} />
              ))}
            {!actionLoading &&
              !actionError &&
              !actions.some(
                (action) => actionViewState(action) === "pending" || action.id === initialActionId,
              ) && <p className="text-xs text-muted-foreground">Nenhuma proposta pendente.</p>}
          </div>
        </SheetContent>
      </Sheet>
      <Sheet open={memoryOpen} onOpenChange={setMemoryOpen}>
        <SheetContent
          closeLabel="Fechar preferências"
          className="assistant-panel !w-full !max-w-md overflow-y-auto"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Preferências</SheetTitle>
            <SheetDescription>Preferências que você decidiu guardar.</SheetDescription>
          </SheetHeader>
          <div className="pt-7">
            {memoryContent ?? (
              <p className="text-xs text-muted-foreground">
                Preferências indisponíveis nesta revisão.
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>
      <Sheet open={sidebar} onOpenChange={setSidebar}>
        <SheetContent
          side="left"
          closeLabel="Fechar equipe"
          className="assistant-panel !w-[min(86vw,300px)] overflow-y-auto !rounded-r-3xl !p-5"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Equipe e conversas</SheetTitle>
            <SheetDescription className="sr-only">
              Escolha um agente ou retome uma conversa.
            </SheetDescription>
          </SheetHeader>
          <div className="pt-5">{sidebarContent}</div>
        </SheetContent>
      </Sheet>
      <Sheet open={showContext} onOpenChange={setShowContext}>
        <SheetContent
          closeLabel="Fechar contexto"
          className="assistant-panel !w-[min(90vw,360px)] overflow-y-auto !rounded-l-3xl"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Registro em foco</SheetTitle>
            <SheetDescription className="sr-only">
              Informações do registro consultado na conversa.
            </SheetDescription>
          </SheetHeader>
          <div className="pt-8">
            <ContextPanel
              context={context}
              result={contextResult}
              loading={contextLoading}
              error={contextError}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function AgentWorkspace({
  botId,
  conversationId,
  prompt,
  context,
  initialTab,
  routineId,
  runId,
  actionId,
}: {
  initialTab?: string;
  routineId?: string;
  runId?: string;
  actionId?: string;
  botId?: string;
  conversationId?: string;
  prompt?: string;
  context?: AssistantRecordContext;
}) {
  const session = useSession();
  const navigate = useNavigate();
  const catalog = useAssistantCatalog();
  const bots = catalog.bots;
  const defaultBot = bots.find((entry) => entry.active);
  const linkedAction = useAssistantAction(actionId);
  const effectiveBotId = botId ?? linkedAction.data?.botId;
  const bot = effectiveBotId ? bots.find((entry) => entry.id === effectiveBotId) : undefined;
  const [handoffDraft, setHandoffDraft] = useState<string>();
  useEffect(() => {
    if (session && botId) setHandoffDraft(takeAssistantDraft(session.id, botId));
  }, [session?.id, botId]);
  const [selectedContext, setSelectedContext] = useState(context);
  useEffect(() => setSelectedContext(context), [context?.kind, context?.id, botId]);
  const conversationBotId = effectiveBotId ?? defaultBot?.id ?? bots[0]?.id;
  const activeContext = conversationBotId
    ? contextForActiveBot(conversationBotId, selectedContext)
    : undefined;
  const chat = useAssistant(conversationBotId ?? "agenda", conversationId, activeContext);
  const focus = useAssistantContext(selectedContext);
  const actions = useAssistantActions();
  const control = useAssistantControls(routineId ? undefined : botId, runId);
  if (!session) return null;
  if (catalog.isLoading)
    return (
      <div className="assistant-surface p-8" role="status">
        Carregando sua equipe…
      </div>
    );
  if (catalog.isError)
    return (
      <div className="assistant-surface p-8" role="alert">
        <p>Não foi possível carregar sua equipe.</p>
        <button
          type="button"
          className="assistant-chip mt-4"
          onClick={() => void catalog.refetch()}
        >
          Tentar novamente
        </button>
      </div>
    );
  if (botId && (!bot || (!bot.active && !conversationId) || !bots.some((b) => b.id === botId)))
    return (
      <div className="assistant-surface p-10 text-center">
        <p className="text-sm">Este agente não está disponível para conversa.</p>
        <a href="/assistente/equipe" className="assistant-chip mt-4">
          Conheça a equipe
        </a>
      </div>
    );
  const go = (id: string) => void navigate({ to: "/assistente/$botId", params: { botId: id } });
  return (
    <AssistantWorkspaceView
      actions={
        linkedAction.data
          ? [
              linkedAction.data,
              ...(actions.data ?? []).filter((row) => row.id !== linkedAction.data?.id),
            ]
          : (actions.data ?? [])
      }
      actionsError={actions.isError}
      initialActionId={actionId}
      actionLoading={!!actionId && linkedAction.isLoading}
      actionError={!!actionId && linkedAction.isError}
      onActionRetry={() => void linkedAction.refetch()}
      initialTab={initialTab}
      memoryContent={
        <>
        <MemoryPanelView
          key={control.memory.data?.updatedAt ?? "new"}
          preferences={control.memory.data?.preferences}
          updatedAt={control.memory.data?.updatedAt}
          loading={control.memory.isLoading}
          busy={control.busy}
          error={
            control.error ||
            (control.memory.isError ? "Não foi possível carregar suas preferências." : undefined)
          }
          onSave={control.memory.isError ? undefined : control.saveMemory}
          onDelete={control.memory.isError ? undefined : control.deleteMemory}
        />
        <FactsPanel />
        </>
      }
      routineContent={
        <>
          <div className="px-5 pt-4">
            {runId && (
              <RoutineRunResult
                run={
                  control.selectedRun.data as
                    | {
                        status: string;
                        scheduledAt: string;
                        items: Array<{ tool: string; data: Record<string, any> }>;
                      }
                    | undefined
                }
                loading={control.selectedRun.isLoading}
                error={control.selectedRun.isError}
              />
            )}
          </div>
          <RoutinesPanelView
            routines={control.routineRows}
            selectedRoutineId={routineId}
            readiness={control.readiness.data as ReadinessView | undefined}
            loading={control.routines.isLoading}
            error={
              control.error ||
              (control.routines.isError ? "Não foi possível carregar as rotinas." : undefined)
            }
            busy={control.busy}
            proposal={control.proposal}
            onPrepare={control.prepare}
            onSave={control.save}
            onState={control.setState}
            onDelete={control.remove}
            onEdit={control.edit}
            onClearProposal={control.clearProposal}
            connection={control.connection}
          />
        </>
      }
      name={session.nome.split(" ")[0]}
      bots={bots}
      bot={bot}
      messages={chat.messages}
      conversations={chat.conversations}
      busy={chat.busy}
      readOnly={(!!bot && !bot.active) || !bots.some((entry) => entry.active)}
      error={
        chat.error ?? (chat.historyError ? "Não foi possível carregar a conversa salva." : null)
      }
      historyLoading={chat.historyLoading}
      historyNotice={!!conversationId}
      context={selectedContext}
      onRecordPick={setSelectedContext}
      onCancel={chat.cancel}
      contextResult={focus.data}
      contextLoading={focus.isLoading && !!selectedContext}
      contextError={focus.isError}
      initialPrompt={handoffDraft ?? prompt}
      onSend={(text) => {
        if (!bot) {
          if (!defaultBot) return;
          void navigate({
            to: "/assistente/$botId",
            params: { botId: defaultBot.id },
            search: { prompt: text },
          });
          return;
        }
        void chat.send(text);
      }}
      onBotChange={go}
      onConversation={(id) => {
        const target =
          chat.conversations.find((conversation) => conversation.id === id)?.bot_id ??
          conversationBotId;
        if (target)
          void navigate({
            to: "/assistente/$botId",
            params: { botId: target },
            search: { conversation: id },
          });
      }}
      onNew={() => {
        const target = bot?.active ? bot : defaultBot;
        if (!target) return;
        chat.reset();
        void navigate({ to: "/assistente/$botId", params: { botId: target.id } });
      }}
      briefing={<DailyBriefing compact />}
    />
  );
}

const briefingLabels: Record<string, { title: string; href: string; bot: string }> = {
  agenda_today: { title: "Compromissos", href: "/agenda", bot: "agenda" },
  stale_attendances: { title: "Atendimentos parados", href: "/atendimentos", bot: "lead" },
  expiring_agenciamentos: {
    title: "Captações com pendências",
    href: "/agenciamentos",
    bot: "capta",
  },
  rentals_overdue: { title: "Aluguéis em atraso", href: "/alugueis", bot: "caixa" },
};
export function DailyBriefingView({
  items,
  loading = false,
  error = false,
  compact = false,
  onRetry,
}: {
  items?: AssistantResult[];
  loading?: boolean;
  error?: boolean;
  compact?: boolean;
  onRetry?: () => void;
}) {
  return (
    <section
      className={`rounded-3xl border border-border bg-card ${compact ? "mx-auto max-w-xl p-4" : "mb-5 p-5"}`}
      aria-label="Seu dia"
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-full bg-primary/7 text-primary">
          <AssistantMark size={18} />
        </span>
        <h2 className="text-sm font-semibold tracking-tight">Seu dia</h2>
      </div>
      {loading ? (
        <div className="grid grid-cols-2 gap-2" role="status" aria-label="Consultando seu dia">
          <div className="assistant-skeleton h-14" />
          <div className="assistant-skeleton h-14" />
        </div>
      ) : error ? (
        <div role="alert" className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">Não foi possível consultar seu dia.</p>
          <button type="button" onClick={onRetry} className="text-xs font-semibold text-primary">
            Tentar novamente
          </button>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {items?.map((item, index) => {
            const label = briefingLabels[item.tool];
            if (!label) return null;
            const data = item.data as Record<string, unknown>;
            const count =
              typeof data?.total === "number"
                ? data.total
                : Object.values(data ?? {}).find(Array.isArray)?.length;
            const unavailable = data?.status === "unavailable";
            return (
              <a
                key={index}
                href={label.href}
                className="flex items-center justify-between gap-3 rounded-2xl bg-muted/35 px-3 py-3 transition-colors hover:bg-primary/5"
              >
                <div>
                  <p className="text-[10px] text-muted-foreground">{label.title}</p>
                  <p className="mt-0.5 text-lg font-semibold leading-tight">
                    {unavailable ? "Indisponível" : (count ?? "Sem dados")}
                    {!unavailable && data?.limited ? "+" : ""}
                  </p>
                </div>
                <ArrowRight className="size-3.5 text-primary/60" />
              </a>
            );
          })}
        </div>
      )}
    </section>
  );
}
export function DailyBriefing({ compact = false }: { compact?: boolean }) {
  const briefing = useAssistantBriefing();
  return (
    <DailyBriefingView
      items={briefing.data?.items}
      loading={briefing.isLoading}
      error={briefing.isError}
      compact={compact}
      onRetry={() => void briefing.refetch()}
    />
  );
}
