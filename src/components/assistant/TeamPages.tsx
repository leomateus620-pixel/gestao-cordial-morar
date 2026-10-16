import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Check, ChevronRight, LockKeyhole, Search } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import { allowedBotsForRole, getAgentBot, neverActions, type AgentBot } from "@/lib/agent/bots";
import { useSession } from "@/lib/auth-mock";
import { WorkerAvatar } from "./WorkerAvatar";
import "./assistant.css";

export function AgentCard({ bot }: { bot: AgentBot }) {
  return (
    <article
      className="assistant-worker-card"
      style={{ "--worker-color": bot.color } as CSSProperties}
    >
      <div className="absolute right-5 top-5 rounded-full border border-border px-2.5 py-1 text-[9px] text-muted-foreground">
        {bot.roles.length === 3
          ? "Toda a equipe"
          : bot.roles.length === 1
            ? "Admin"
            : "Admin e secretária"}
      </div>
      <div className="assistant-worker-card-art">
        <WorkerAvatar bot={bot} size={113} />
      </div>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">{bot.name}</h2>
        {!bot.active && (
          <span className="rounded-full bg-muted px-2 py-1 text-[9px] font-semibold text-muted-foreground">
            Em breve
          </span>
        )}
      </div>
      <p className="mt-2 min-h-10 text-xs leading-relaxed text-muted-foreground">{bot.tagline}</p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {bot.modules.map((m) => (
          <span
            key={m}
            className="rounded-full bg-muted/70 px-2 py-1 text-[9px] text-muted-foreground"
          >
            {m}
          </span>
        ))}
      </div>
      <div className="mt-5 flex items-center gap-2">
        <Link
          to="/assistente/equipe/$botId"
          params={{ botId: bot.id }}
          className="assistant-small-button flex-1"
        >
          Conhecer <ChevronRight size={12} />
        </Link>
        {bot.active && (
          <Link
            to="/assistente/$botId"
            params={{ botId: bot.id }}
            className="assistant-small-button flex-1 !border-primary/20 !bg-primary/7 text-primary"
          >
            Conversar <ArrowRight size={12} />
          </Link>
        )}
      </div>
    </article>
  );
}

export function TeamHomeView({
  name,
  bots,
  onboarding = false,
}: {
  name: string;
  bots: AgentBot[];
  onboarding?: boolean;
}) {
  const [category, setCategory] = useState("Todos");
  const [search, setSearch] = useState("");
  const categories = ["Todos", ...new Set(bots.map((b) => b.category))];
  const filtered = bots.filter(
    (b) =>
      (category === "Todos" || b.category === category) &&
      `${b.name} ${b.description}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="assistant-surface p-5 sm:p-8 lg:p-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="assistant-eyebrow">Assistente Cordial</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Conheça a equipe<span className="text-primary">.</span>
          </h1>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
            {onboarding
              ? `Escolha com quem conversar, ${name}.`
              : "Um colega para cada parte do seu dia."}
          </p>
        </div>
        <div className="hidden items-end -space-x-4 sm:flex">
          {bots.slice(0, 3).map((b, i) => (
            <WorkerAvatar key={b.id} bot={b} size={60 + i * 8} />
          ))}
        </div>
      </div>
      <div className="mt-6 flex flex-col justify-between gap-4 md:flex-row">
        <div className="flex flex-wrap gap-2" aria-label="Filtrar equipe por especialidade">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
              className={`assistant-chip ${category === c ? "!bg-primary !text-primary-foreground !border-primary" : ""}`}
            >
              {c}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 rounded-full border border-border px-3 py-2 text-muted-foreground">
          <Search size={14} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Buscar na equipe"
            placeholder="Quem pode ajudar?"
            className="w-full bg-transparent text-xs outline-none md:w-36"
          />
        </label>
      </div>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((bot) => (
          <AgentCard key={bot.id} bot={bot} />
        ))}
      </div>
      {filtered.length === 0 && (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Não encontrei um agente com esse nome.
        </p>
      )}
    </div>
  );
}
export function TeamHome() {
  const session = useSession();
  useEffect(() => {
    if (session)
      try {
        localStorage.setItem(`cordial:assistant:intro:${session.id}`, "seen");
      } catch {}
  }, [session?.id]);
  if (!session) return null;
  return (
    <TeamHomeView
      name={session.nome.split(" ")[0]}
      bots={allowedBotsForRole(session.perfil)}
      onboarding
    />
  );
}

export function BotPresentationView({ bot }: { bot: AgentBot }) {
  const detailsClass = "group border-t border-border py-5";
  const summaryClass =
    "flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden";
  return (
    <div className="assistant-surface">
      <div className="px-6 pt-6 sm:px-10">
        <Link
          to="/assistente/equipe"
          className="inline-flex items-center gap-2 text-xs text-muted-foreground"
        >
          <ArrowLeft size={13} />
          Conheça a equipe
        </Link>
      </div>
      <section
        className="flex flex-col items-center gap-5 px-6 pb-9 pt-7 text-center sm:flex-row sm:px-10 sm:text-left"
        style={{ background: `radial-gradient(ellipse at 85% 60%,${bot.color}16,transparent 60%)` }}
      >
        <WorkerAvatar bot={bot} size={140} />
        <div className="max-w-xl">
          <p className="assistant-eyebrow">{bot.category}</p>
          <div className="mt-2 flex items-center justify-center gap-3 sm:justify-start">
            <h1 className="text-4xl font-semibold tracking-tight">{bot.name}</h1>
            {!bot.active && (
              <span className="rounded-full bg-muted px-3 py-1 text-[10px] text-muted-foreground">
                Em breve
              </span>
            )}
          </div>
          <p className="mt-3 text-lg font-medium tracking-tight">{bot.tagline}</p>
          {bot.active && (
            <Link
              to="/assistente/$botId"
              params={{ botId: bot.id }}
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-xs font-semibold text-primary-foreground"
            >
              Conversar com {bot.name}
              <ArrowRight size={14} />
            </Link>
          )}
        </div>
      </section>
      <div className="border-t border-border px-6 py-7 sm:px-10">
        <section>
          <h2 className="text-lg font-semibold tracking-tight">
            {bot.active ? "Como posso ajudar" : "Habilidades planejadas"}
          </h2>
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {bot.abilities.map((ability) => (
              <li
                key={ability}
                className="flex gap-2 text-xs leading-relaxed text-muted-foreground"
              >
                <Check size={14} className="mt-0.5 shrink-0 text-primary" />
                {ability}
              </li>
            ))}
          </ul>
        </section>
        <section className="mt-8">
          <h2 className="text-lg font-semibold tracking-tight">Experimente perguntar</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {bot.suggestions.map((s) =>
              bot.active ? (
                <Link
                  key={s}
                  to="/assistente/$botId"
                  params={{ botId: bot.id }}
                  search={{ prompt: s }}
                  className="assistant-chip"
                >
                  {s}
                  <ArrowRight size={12} />
                </Link>
              ) : (
                <span key={s} className="assistant-chip opacity-65">
                  {s}
                </span>
              ),
            )}
          </div>
        </section>
        <section className="my-8">
          <h2 className="text-lg font-semibold tracking-tight">Como funciona</h2>
          <ol className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              ["Você pede", "Uma pergunta ou um registro."],
              ["Ele consulta", "Informações do Gestão, com fontes."],
              ["Você decide", "Abra o registro para continuar."],
            ].map(([title, description], index) => (
              <li key={title} className="flex gap-3 rounded-2xl bg-muted/35 p-4">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/7 text-[10px] font-semibold text-primary">
                  {index + 1}
                </span>
                <div>
                  <h3 className="text-xs font-semibold">{title}</h3>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    {description}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
        <div aria-label="Detalhes do agente">
          <details className={detailsClass}>
            <summary className={summaryClass}>
              O que cria ou altera
              <ChevronRight
                size={15}
                className="shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
              />
            </summary>
            <div className="mt-4 text-xs leading-relaxed text-muted-foreground">
              <p>Por enquanto, somente consultas.</p>
              {bot.futureActions.length > 0 && (
                <>
                  <p className="mt-3">Ações planejadas:</p>
                  <ul className="mt-2 space-y-3">
                    {bot.futureActions.map((action) => (
                      <li key={action}>
                        <p>{action}</p>
                        <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-primary">
                          <LockKeyhole size={10} />
                          Precisa da sua confirmação
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </details>
          <details className={detailsClass}>
            <summary className={summaryClass}>
              Dados e quem pode usar
              <ChevronRight
                size={15}
                className="shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
              />
            </summary>
            <div className="mt-4">
              <p className="text-xs leading-relaxed text-muted-foreground">
                {bot.modules.join(", ")}. Cada consulta respeita seu acesso no Gestão; CPF, telefone
                e e-mail são mascarados.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {bot.roles.map((role) => (
                  <span
                    key={role}
                    className="rounded-full bg-muted px-3 py-1.5 text-[10px] text-muted-foreground"
                  >
                    {role === "admin"
                      ? "Administrador"
                      : role === "secretaria"
                        ? "Secretária"
                        : "Corretor"}
                  </span>
                ))}
              </div>
            </div>
          </details>
          <details className={detailsClass}>
            <summary className={summaryClass}>
              O que eu nunca faço
              <ChevronRight
                size={15}
                className="shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
              />
            </summary>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {neverActions.map((action) => (
                <li key={action} className="text-xs leading-relaxed text-muted-foreground">
                  {action}
                </li>
              ))}
            </ul>
          </details>
          <details className={detailsClass}>
            <summary className={summaryClass}>
              Rotinas sugeridas
              <ChevronRight
                size={15}
                className="shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
              />
            </summary>
            <p className="mt-4 text-[11px] text-muted-foreground">
              Sugestões futuras; nenhuma rotina ativa.
            </p>
            <ul className="mt-3 space-y-2">
              {bot.routines.map((routine) => (
                <li key={routine} className="text-xs leading-relaxed text-muted-foreground">
                  {routine}
                </li>
              ))}
            </ul>
          </details>
        </div>
      </div>
    </div>
  );
}
export function BotPresentation({ botId }: { botId: string }) {
  const session = useSession();
  const bot = getAgentBot(botId);
  if (!bot || !session || !allowedBotsForRole(session.perfil).some((b) => b.id === bot.id))
    return (
      <div className="assistant-surface p-10 text-center">
        <LockKeyhole className="mx-auto mb-4 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Este agente não está disponível para seu perfil.</h1>
        <Link to="/assistente/equipe" className="assistant-chip mt-5">
          Ver minha equipe
        </Link>
      </div>
    );
  return <BotPresentationView bot={bot} />;
}
