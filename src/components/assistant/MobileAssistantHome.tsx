import { ArrowRight, Clock3, MessageCircle, Search } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AgentBot } from "@/lib/agent/bots";
import { allowedBotsForRole } from "@/lib/agent/bots";
import { useAssistantCatalog } from "@/lib/agent/use-assistant";
import { useSession } from "@/lib/auth-mock";
import { listAssistantConversations } from "@/lib/agent/assistant.functions";
import { WorkerAvatar } from "./WorkerAvatar";
import { CordialBotBrand } from "@/components/brand/CordialBotBrand";
import type { ConversationItem } from "./AgentWorkspace";
import "./assistant.css";

export function MobileAssistantHomeView({
  name,
  bots,
  conversations = [],
  loading = false,
  error = false,
}: {
  name: string;
  bots: AgentBot[];
  conversations?: ConversationItem[];
  loading?: boolean;
  error?: boolean;
}) {
  const [tab, setTab] = useState("Equipe");
  const [query, setQuery] = useState("");
  const visibleBots = bots.filter((bot) =>
    bot.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <section className="assistant-surface min-h-[650px] px-5 pb-7 pt-6">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-full bg-primary/7 text-sm font-semibold text-primary">
          {name.slice(0, 1)}
        </span>
        <div>
          <CordialBotBrand compact />
          <h1 className="mt-1 text-xl font-semibold tracking-tight">Olá, {name}.</h1>
        </div>
        <a
          href="/assistente/equipe"
          className="assistant-icon-button ml-auto"
          aria-label="Conheça a equipe"
        >
          <MessageCircle size={19} />
        </a>
      </div>
      <div
        className="mt-5 inline-flex rounded-full bg-muted/60 p-1"
        role="tablist"
        aria-label="Equipe e atividades"
      >
        {["Equipe", "Atividades"].map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-full px-5 py-2 text-xs font-semibold ${tab === t ? "bg-card shadow-sm" : "text-muted-foreground"}`}
          >
            {t}
          </button>
        ))}
      </div>
      <label className="mt-5 flex items-center gap-2 rounded-full border border-border px-3 py-2 text-muted-foreground">
        <Search size={14} />
        <input
          aria-label="Buscar na sua equipe"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Quem pode ajudar?"
          className="w-full bg-transparent text-xs outline-none"
        />
      </label>
      {tab === "Equipe" ? (
        <div className="mt-3 divide-y divide-border/60">
          {visibleBots.map((bot) => {
            const recent = conversations.find((conversation) => conversation.bot_id === bot.id);
            return (
              <a
                key={bot.id}
                href={
                  bot.active || recent
                    ? `/assistente/${bot.id}${recent ? `?conversation=${recent.id}` : ""}`
                    : `/assistente/equipe/${bot.id}`
                }
                className="flex items-center gap-3 py-4"
              >
                <WorkerAvatar bot={bot} size={53} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold">{bot.name}</h2>
                    {!bot.active && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[8px] text-muted-foreground">
                        Pausado
                      </span>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                    {bot.active ? (recent?.title ?? bot.tagline) : bot.tagline}
                  </p>
                </div>
                {recent ? (
                  <time
                    dateTime={recent.updated_at}
                    className="self-start pt-2 text-[9px] text-muted-foreground"
                  >
                    {new Date(recent.updated_at).toLocaleDateString("pt-BR", {
                      timeZone: "America/Sao_Paulo",
                      day: "2-digit",
                      month: "2-digit",
                    })}
                  </time>
                ) : (
                  <ArrowRight size={14} className="text-primary/60" />
                )}
              </a>
            );
          })}
          {loading && !bots.length && (
            <div
              role="status"
              aria-label="Carregando equipe"
              className="assistant-skeleton my-5 h-40"
            />
          )}
          {error && !bots.length && (
            <p role="alert" className="py-8 text-sm text-muted-foreground">
              Não foi possível carregar sua equipe.
            </p>
          )}
          {!loading && !error && visibleBots.length === 0 && (
            <p role="status" className="py-8 text-center text-xs text-muted-foreground">
              Não encontrei um agente com esse nome.
            </p>
          )}
        </div>
      ) : (
        <div className="mt-6">
          {loading ? (
            <div
              className="assistant-skeleton h-24"
              role="status"
              aria-label="Carregando atividades"
            />
          ) : error ? (
            <p role="alert" className="text-xs text-muted-foreground">
              Não foi possível consultar as conversas.
            </p>
          ) : conversations.length ? (
            conversations.map((c) => {
              const bot = bots.find((b) => b.id === c.bot_id);
              return (
                bot && (
                  <a
                    key={c.id}
                    href={`/assistente/${c.bot_id}?conversation=${c.id}`}
                    className="mb-2 flex items-center gap-2 rounded-2xl border border-border p-3"
                  >
                    <WorkerAvatar bot={bot} size={36} />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold">{c.title}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {bot.name} ·{" "}
                        {new Date(c.updated_at).toLocaleDateString("pt-BR", {
                          timeZone: "America/Sao_Paulo",
                        })}
                      </p>
                    </div>
                  </a>
                )
              );
            })
          ) : (
            <div className="rounded-2xl border border-dashed border-border px-5 py-10 text-center">
              <Clock3 className="mx-auto mb-3 text-primary/50" />
              <h2 className="text-sm font-semibold">Nenhuma conversa ainda.</h2>
            </div>
          )}
        </div>
      )}
      <a href="/assistente/equipe" className="assistant-chip mt-5 w-full text-primary">
        Conheça a equipe
        <ArrowRight size={13} />
      </a>
    </section>
  );
}
export function MobileAssistantHome() {
  const session = useSession();
  const catalog = useAssistantCatalog();
  const history = useQuery({
    queryKey: ["assistant-conversations", session?.id, "all"],
    queryFn: () => listAssistantConversations({ data: { limit: 20 } }),
    enabled: !!session,
    staleTime: 15000,
  });
  if (!session) return null;
  return (
    <MobileAssistantHomeView
      name={session.nome.split(" ")[0]}
      bots={catalog.bots}
      conversations={history.data}
      loading={history.isLoading || catalog.isLoading}
      error={history.isError || catalog.isError}
    />
  );
}
