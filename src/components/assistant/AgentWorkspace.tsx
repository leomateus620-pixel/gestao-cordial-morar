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
  MessageCircle,
  Mic,
  Paperclip,
  Plus,
  RotateCcw,
  Send,
  ShieldCheck,
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
import { allowedBotsForRole, getAgentBot, type AgentBot } from "@/lib/agent/bots";
import {
  useAssistant,
  useAssistantBriefing,
  useAssistantContext,
  type AssistantRecordContext,
  type ChatMessage,
} from "@/lib/agent/use-assistant";
import type { AssistantResult } from "@/lib/agent/stream";
import { useSession } from "@/lib/auth-mock";
import { WorkerAvatar } from "./WorkerAvatar";
import { RichToolResult, StepTimeline } from "./RichResults";
import "./assistant.css";
import { Composer } from "./Composer";
import { contextForActiveBot } from "@/lib/agent/context-routing";
import { AssistantMark } from "@/components/brand/AssistantMark";
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
export function NeedsYouSection() {
  return (
    <section className="my-6 border-y border-border py-4">
      <h3 className="flex items-center gap-2 text-[10px] font-semibold text-muted-foreground">
        <span className="size-1.5 rounded-full bg-primary/50" />
        Precisa de você
      </h3>
      <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">Nenhuma pendência.</p>
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
              {b.active ? b.modules.slice(0, 2).join(" · ") : "Em breve"}
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
}: {
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
        <AssistantMark size={22} />
        ASSISTENTE CORDIAL
      </a>
      <button
        type="button"
        onClick={onNew}
        className="assistant-small-button mb-6 w-full !rounded-full !py-2.5 !text-[11px]"
      >
        <Plus size={14} />
        Nova conversa
      </button>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[10px] font-semibold text-muted-foreground">Sua equipe</h2>
        <a href="/assistente/equipe" className="text-[9px] text-primary">
          Conhecer
        </a>
      </div>
      <WorkerList bots={bots} selected={bot?.id} onSelect={onBotChange} />
      <NeedsYouSection />
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
}: {
  name: string;
  bots: AgentBot[];
  bot?: AgentBot;
  onChoose: (prompt: string) => void;
}) {
  return (
    <div className="assistant-hero">
      <div className="assistant-mascot-group">
        {(bot
          ? [
              bots.find((b) => b.id !== bot.id) ?? bot,
              bot,
              bots.find((b) => b.id !== bot.id && b.id !== bots[0]?.id) ?? bot,
            ]
          : bots.slice(0, 3)
        ).map((b, i) => (
          <WorkerAvatar key={`${b.id}${i}`} bot={b} size={i === 1 ? 110 : 79} />
        ))}
      </div>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-[28px]">
        {bot
          ? ({
              agenda: "Vamos organizar seu dia?",
              match: "Vamos encontrar o imóvel certo?",
              capta: "O que acompanhamos hoje?",
              lead: "Quem precisa de atenção?",
            }[bot.id] ?? bot.tagline)
          : `Olá, ${name}.`}
      </h1>
      <div className="h-6" aria-hidden="true" />
      {bot ? (
        <div className="max-w-lg">
          <ChoiceChips choices={bot.suggestions} onChoose={onChoose} />
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

function MessageFeedback({ message, onRetry }: { message: ChatMessage; onRetry: () => void }) {
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
      <button
        type="button"
        className="assistant-icon-button !size-7"
        aria-label="Refazer consulta"
        onClick={onRetry}
      >
        <RotateCcw size={12} />
      </button>
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
  onRecordPick?: (record: AssistantRecordContext) => void;
  onCancel?: () => void;
};
export function AssistantWorkspaceView({
  name,
  bots,
  bot,
  messages,
  conversations = [],
  busy = false,
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
  onCancel,
}: AssistantWorkspaceViewProps) {
  const [draft, setDraft] = useState(initialPrompt);
  const [tab, setTab] = useState("Conversa");
  const tabsId = useId();
  const tabNames = ["Conversa", "Rotinas", "Resultados", "Sobre"];
  const [sidebar, setSidebar] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const tail = useRef<HTMLDivElement>(null);
  useEffect(() => setDraft(initialPrompt), [initialPrompt, bot?.id]);
  useEffect(() => {
    tail.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [messages, busy]);
  function send(text: string) {
    if (!busy) {
      onSend(text);
      setDraft("");
    }
  }
  const sidebarContent = (
    <AgentSidebar
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
    <div className="assistant-surface assistant-workspace">
      <aside className="assistant-workspace-sidebar" aria-label="Equipe e conversas">
        {sidebarContent}
      </aside>
      <section className="assistant-workspace-main">
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <button
            type="button"
            className="assistant-icon-button md:hidden"
            aria-label="Abrir equipe e conversas"
            onClick={() => setSidebar(true)}
          >
            <Menu size={17} />
          </button>
          <button
            type="button"
            className="flex min-w-0 items-center gap-2 rounded-full border border-border bg-muted/20 py-1 pl-1.5 pr-3"
            onClick={() => setSidebar(true)}
          >
            {bot ? (
              <WorkerAvatar bot={bot} size={30} working={busy} />
            ) : (
              <AssistantMark size={26} className="m-1" />
            )}
            <span className="truncate text-xs font-semibold">{bot?.name ?? "Sua equipe"}</span>
            <span className="hidden text-[10px] text-muted-foreground sm:inline">
              · {bot?.category ?? "Nova conversa"}
            </span>
            <ChevronDown size={12} className="ml-2 text-muted-foreground" />
          </button>
          <span className="ml-auto hidden items-center gap-1.5 text-[9px] text-muted-foreground sm:flex">
            <span
              className={`size-1.5 rounded-full ${busy ? "bg-primary assistant-pulse" : "bg-emerald-500/70"}`}
            />
            {busy ? "Consultando" : "Somente leitura"}
          </span>
          <button
            type="button"
            className="assistant-icon-button xl:hidden"
            aria-label="Abrir painel de contexto"
            onClick={() => setShowContext(true)}
          >
            <ListFilter size={16} />
          </button>
          {bot && (
            <a
              href={`/assistente/equipe/${bot.id}`}
              className="assistant-icon-button"
              aria-label={`Sobre ${bot.name}`}
            >
              <Info size={16} />
            </a>
          )}
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
                  <EmptyStateHero name={name} bots={bots} bot={bot} onChoose={setDraft} />
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
                        {m.steps && <StepTimeline steps={m.steps} />}
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
                        {m.content && !busy && (
                          <MessageFeedback
                            message={m}
                            onRetry={() => {
                              const previous = messages
                                .slice(0, i)
                                .reverse()
                                .find((x) => x.role === "user");
                              if (previous) setDraft(previous.content);
                            }}
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
            <Composer
              bot={bot}
              value={draft}
              onChange={setDraft}
              onSend={() => send(draft)}
              busy={busy}
              onRecordPick={onRecordPick}
              onCancel={onCancel}
            />
          </>
        ) : tab === "Rotinas" ? (
          <RoutinesTab bot={bot} />
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
      <Sheet open={sidebar} onOpenChange={setSidebar}>
        <SheetContent
          side="left"
          closeLabel="Fechar equipe"
          className="!w-[min(86vw,300px)] overflow-y-auto !rounded-r-3xl !p-5"
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
          className="!w-[min(90vw,360px)] overflow-y-auto !rounded-l-3xl"
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
}: {
  botId?: string;
  conversationId?: string;
  prompt?: string;
  context?: AssistantRecordContext;
}) {
  const session = useSession();
  const navigate = useNavigate();
  const bots = allowedBotsForRole(session?.perfil ?? "");
  const bot = botId ? getAgentBot(botId) : undefined;
  const [selectedContext, setSelectedContext] = useState(context);
  useEffect(() => setSelectedContext(context), [context?.kind, context?.id, botId]);
  const activeContext = contextForActiveBot(botId ?? "agenda", selectedContext);
  const chat = useAssistant(botId ?? "agenda", conversationId, activeContext);
  const focus = useAssistantContext(selectedContext);
  if (!session) return null;
  if (botId && (!bot || !bot.active || !bots.some((b) => b.id === botId)))
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
      name={session.nome.split(" ")[0]}
      bots={bots}
      bot={bot}
      messages={chat.messages}
      conversations={chat.conversations}
      busy={chat.busy}
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
      initialPrompt={prompt}
      onSend={(text) => {
        if (!bot) {
          void navigate({
            to: "/assistente/$botId",
            params: { botId: "agenda" },
            search: { prompt: text },
          });
          return;
        }
        void chat.send(text);
      }}
      onBotChange={go}
      onConversation={(id) =>
        void navigate({
          to: "/assistente/$botId",
          params: { botId: botId ?? "agenda" },
          search: { conversation: id },
        })
      }
      onNew={() => {
        chat.reset();
        void navigate({ to: "/assistente/$botId", params: { botId: botId ?? "agenda" } });
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
