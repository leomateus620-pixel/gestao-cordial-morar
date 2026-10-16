import { AssistantDialogContent as DialogContent } from "./AssistantDialog";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Eye, Loader2, RotateCcw, ShieldCheck } from "lucide-react";
import { agentBots, getAgentBot } from "@/lib/agent/bots";
import {
  adminListAssistantBotConfigs,
  adminSaveAssistantBotConfig,
  adminResetAssistantBotConfig,
  adminSetAssistantMcpClient,
} from "@/lib/agent/bot-config.functions";
import {
  botConfigInput,
  mcpClientInput,
  type AssistantAdminConfigDTO,
  type BotConfigAdminDTO,
  type McpClientAdminDTO,
} from "@/lib/agent/bot-config.schemas";
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { WorkerAvatar } from "./WorkerAvatar";

type SaveBot = {
  id: string;
  expectedRevision: number;
  enabled: boolean;
  instructions: string;
  suggestions: string[];
  confirmed: true;
};
type SetClient = {
  clientId: string;
  name: string;
  approved: boolean;
  expectedRevision: number;
  confirmed: true;
};
const field =
  "min-h-11 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
type ConfigProps = {
  data: AssistantAdminConfigDTO;
  tab: "team" | "connections";
  busy?: boolean;
  error?: string;
  notice?: string;
  onSave(input: SaveBot): Promise<boolean> | boolean;
  onReset(input: {
    id: string;
    expectedRevision: number;
    confirmed: true;
  }): Promise<boolean> | boolean;
  onClient(input: SetClient): Promise<boolean> | boolean;
  onReload(): void;
};

export function AssistantConfigurationView({
  data,
  tab,
  busy = false,
  error,
  notice,
  onSave,
  onReset,
  onClient,
  onReload,
}: ConfigProps) {
  const [selected, setSelected] = useState(data.bots[0]?.id ?? "agenda");
  const config = data.bots.find((bot) => bot.id === selected);
  return (
    <div>
      <p className="mb-4 inline-flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck size={14} />
        Configuração compartilhada · Cordial e Morar
      </p>
      {error && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm"
        >
          <p>{error}</p>
          <button
            type="button"
            className="mt-2 min-h-11 font-semibold text-primary"
            onClick={onReload}
            disabled={busy}
          >
            Recarregar configuração
          </button>
        </div>
      )}
      {notice && (
        <p role="status" className="mb-4 flex items-center gap-2 text-sm text-primary">
          <Check size={14} />
          {notice}
        </p>
      )}
      {tab === "team" ? (
        <div className="grid gap-5 md:grid-cols-[190px_minmax(0,1fr)]">
          <div className="flex gap-2 overflow-x-auto md:flex-col" aria-label="Agente a configurar">
            {data.bots.map((row) => {
              const bot = getAgentBot(row.id);
              return (
                bot && (
                  <button
                    key={row.id}
                    type="button"
                    className={`flex min-h-14 shrink-0 items-center gap-2 rounded-2xl px-3 py-2 text-left ${selected === row.id ? "bg-primary/8" : "hover:bg-muted"}`}
                    aria-pressed={selected === row.id}
                    disabled={busy}
                    onClick={() => setSelected(row.id)}
                  >
                    <WorkerAvatar bot={bot} size={35} />
                    <span className="text-sm font-semibold">
                      {bot.name}
                      <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">
                        {row.enabled ? "Ativo" : "Pausado"}
                      </span>
                    </span>
                  </button>
                )
              );
            })}
          </div>
          {config && (
            <BotConfigEditorView
              key={`${config.id}:${config.revision}`}
              config={config}
              busy={busy}
              error={error}
              onReload={onReload}
              onSave={onSave}
              onReset={onReset}
            />
          )}
        </div>
      ) : (
        <McpClientsView
          clients={data.clients}
          oauthConfigured={data.oauthConfigured}
          clientsLimited={data.clientsLimited}
          busy={busy}
          error={error}
          onReload={onReload}
          onClient={onClient}
        />
      )}
    </div>
  );
}

export function BotConfigEditorView({
  config,
  busy = false,
  error,
  onReload,
  onSave,
  onReset,
}: {
  config: BotConfigAdminDTO;
  busy?: boolean;
  error?: string;
  onReload?(): void;
  onSave: ConfigProps["onSave"];
  onReset: ConfigProps["onReset"];
}) {
  const bot = getAgentBot(config.id)!;
  const [enabled, setEnabled] = useState(config.enabled);
  const [instructions, setInstructions] = useState(config.instructions);
  const [suggestions, setSuggestions] = useState(config.suggestions.join("\n"));
  const [review, setReview] = useState<"save" | "reset" | null>(null);
  const [validation, setValidation] = useState("");
  const parsedSuggestions = [
    ...new Set(
      suggestions
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  ];
  const changed =
    enabled !== config.enabled ||
    instructions !== config.instructions ||
    JSON.stringify(parsedSuggestions) !== JSON.stringify(config.suggestions);
  const payload = {
    id: config.id,
    expectedRevision: config.revision,
    enabled,
    instructions,
    suggestions: parsedSuggestions,
    confirmed: true as const,
  };
  function preview() {
    const parsed = botConfigInput.safeParse(payload);
    if (!parsed.success) {
      setValidation(
        "Use até 5 sugestões de 3–180 caracteres e instruções de até 4.000 caracteres.",
      );
      return;
    }
    setValidation("");
    setReview("save");
  }
  return (
    <div className="min-w-0 rounded-2xl border border-border p-4 sm:p-5">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">{bot.name}</h3>
        <label className="inline-flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            disabled={busy}
            className="size-4 accent-primary"
          />
          Ativo
        </label>
      </div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {bot.modules.map((module) => (
          <span
            key={module}
            className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"
          >
            {module}
          </span>
        ))}
      </div>
      <label className="block text-sm font-medium">
        Orientações adicionais
        <textarea
          className={`${field} mt-2 min-h-28 resize-y`}
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
          maxLength={4000}
          disabled={busy}
          placeholder="Preferências da sua equipe"
        />
      </label>
      <p className="mb-5 mt-1 text-xs text-muted-foreground">
        Permissões, privacidade e confirmação permanecem fixas.
      </p>
      <label className="block text-sm font-medium">
        Sugestões iniciais
        <textarea
          className={`${field} mt-2 min-h-28 resize-y`}
          value={suggestions}
          onChange={(event) => setSuggestions(event.target.value)}
          disabled={busy}
          placeholder="Uma sugestão por linha"
        />
      </label>
      <p className="mt-1 text-xs text-muted-foreground">Uma por linha · até 5 sugestões</p>
      {validation && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {validation}
        </p>
      )}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button onClick={preview} disabled={!changed || busy} className="min-h-11">
          <Eye size={15} />
          Revisar alterações
        </Button>
        <Button
          variant="ghost"
          className="min-h-11"
          onClick={() => setReview("reset")}
          disabled={busy}
        >
          <RotateCcw size={14} />
          Restaurar padrão
        </Button>
        {changed && <span className="text-xs text-muted-foreground">Não salvo</span>}
      </div>
      <Dialog
        open={!!review}
        onOpenChange={(open) => {
          if (!busy && !open) setReview(null);
        }}
      >
        <DialogContent
          closeDisabled={busy}
          className="assistant-panel max-h-[90dvh] overflow-y-auto !rounded-3xl"
        >
          <DialogHeader>
            <DialogTitle>
              {review === "reset" ? `Restaurar ${bot.name}?` : `Revisar ${bot.name}`}
            </DialogTitle>
            <DialogDescription>
              {review === "reset"
                ? "O agente volta às orientações e sugestões originais e fica ativo para os papéis permitidos."
                : "Estas alterações valem para Cordial e Morar."}
            </DialogDescription>
          </DialogHeader>
          {review === "save" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-2xl bg-muted/40 p-4">
                <WorkerAvatar bot={bot} size={54} />
                <div>
                  <p className="font-semibold">{bot.name}</p>
                  <p className="text-sm text-muted-foreground">{enabled ? "Ativo" : "Pausado"}</p>
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold text-muted-foreground">
                  Sugestões na conversa
                </p>
                <div className="flex flex-wrap gap-2">
                  {parsedSuggestions.length ? (
                    parsedSuggestions.map((prompt) => (
                      <span className="rounded-full border px-3 py-2 text-xs" key={prompt}>
                        {prompt}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">Sem sugestões iniciais.</span>
                  )}
                </div>
              </div>
              {instructions !== config.instructions && (
                <details>
                  <summary className="cursor-pointer text-sm font-medium">
                    Orientações alteradas
                  </summary>
                  <p className="mt-2 whitespace-pre-wrap rounded-xl bg-muted p-3 text-sm">
                    {instructions || "Usar as orientações originais."}
                  </p>
                </details>
              )}
            </div>
          )}
          {error && (
            <div
              role="alert"
              className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm"
            >
              <p>{error}</p>
              {onReload && (
                <button
                  type="button"
                  disabled={busy}
                  className="mt-2 min-h-11 font-semibold text-primary"
                  onClick={() => {
                    setReview(null);
                    onReload();
                  }}
                >
                  Recarregar configuração
                </button>
              )}
            </div>
          )}
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              className="min-h-11"
              disabled={busy}
              onClick={() => setReview(null)}
            >
              Voltar
            </Button>
            <Button
              className="min-h-11"
              disabled={busy}
              onClick={async () => {
                const ok =
                  review === "reset"
                    ? await onReset({
                        id: config.id,
                        expectedRevision: config.revision,
                        confirmed: true,
                      })
                    : await onSave(payload);
                if (ok) setReview(null);
              }}
            >
              {busy && <Loader2 size={14} className="animate-spin" />}
              {review === "reset" ? "Confirmar restauração" : "Confirmar alterações"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function McpClientsView({
  clients,
  oauthConfigured,
  clientsLimited = false,
  busy = false,
  error,
  onReload,
  onClient,
}: {
  clients: McpClientAdminDTO[];
  oauthConfigured: boolean;
  clientsLimited?: boolean;
  busy?: boolean;
  error?: string;
  onReload?(): void;
  onClient: ConfigProps["onClient"];
}) {
  const [clientId, setClientId] = useState("");
  const [name, setName] = useState("");
  const [review, setReview] = useState<SetClient | null>(null);
  const [validation, setValidation] = useState("");
  function prepare(input: SetClient) {
    const parsed = mcpClientInput.safeParse(input);
    if (!parsed.success) {
      setValidation("Confira o nome e o identificador do cliente OAuth.");
      return;
    }
    setValidation("");
    setReview(parsed.data);
  }
  return (
    <div>
      {clientsLimited && (
        <p role="status" className="mb-4 text-xs text-muted-foreground">
          A lista atingiu o limite. Informe o identificador do aplicativo para gerenciar outro
          cliente.
        </p>
      )}
      {!oauthConfigured && (
        <p role="status" className="mb-4 rounded-xl bg-muted p-3 text-sm text-muted-foreground">
          Descoberta de clientes OAuth indisponível. Os registros salvos continuam abaixo.
        </p>
      )}
      <div className="space-y-3">
        {clients.map((client) => (
          <article
            key={client.clientId}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border p-4"
          >
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold">{client.name}</h3>
              <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                {client.clientId}
              </p>
              <span
                className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs ${client.approved ? "bg-primary/8 text-primary" : "bg-muted text-muted-foreground"}`}
              >
                {client.approved ? "Propostas aprovadas" : "Não aprovado"}
              </span>
            </div>
            <Button
              variant={client.approved ? "outline" : "default"}
              className="min-h-11"
              disabled={busy}
              onClick={() =>
                prepare({
                  clientId: client.clientId,
                  name: client.name,
                  approved: !client.approved,
                  expectedRevision: client.revision,
                  confirmed: true,
                })
              }
            >
              {client.approved ? "Revogar" : "Aprovar"}
            </Button>
          </article>
        ))}
      </div>
      {!clients.length && (
        <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nenhuma conexão aprovada.
        </p>
      )}
      <details className="mt-5 rounded-2xl border border-border p-4">
        <summary className="cursor-pointer text-sm font-semibold">Adicionar cliente OAuth</summary>
        <form
          className="mt-4 grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            prepare({
              clientId: clientId.trim(),
              name: name.trim(),
              approved: true,
              expectedRevision: 0,
              confirmed: true,
            });
          }}
        >
          <label className="text-sm">
            Nome
            <input
              className={`${field} mt-1`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              minLength={2}
              maxLength={100}
              disabled={busy}
            />
          </label>
          <label className="text-sm">
            Identificador OAuth
            <input
              className={`${field} mt-1 font-mono`}
              value={clientId}
              onChange={(event) => setClientId(event.target.value)}
              required
              minLength={4}
              maxLength={200}
              disabled={busy}
            />
          </label>
          <Button
            type="submit"
            className="min-h-11 sm:col-span-2 sm:justify-self-start"
            disabled={busy}
          >
            Revisar aprovação
          </Button>
        </form>
      </details>
      {validation && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {validation}
        </p>
      )}
      <p className="mt-4 text-xs text-muted-foreground">
        Cada pessoa ainda autoriza sua própria conta. Alterações no Gestão continuam exigindo
        confirmação.
      </p>
      <Dialog
        open={!!review}
        onOpenChange={(open) => {
          if (!busy && !open) setReview(null);
        }}
      >
        <DialogContent closeDisabled={busy} className="assistant-panel !rounded-3xl">
          <DialogHeader>
            <DialogTitle>
              {review?.approved ? "Aprovar propostas?" : "Revogar propostas?"}
            </DialogTitle>
            <DialogDescription>
              {review?.approved
                ? "O aplicativo poderá preparar propostas em nome de quem autorizar sua conta. A execução continua no Cordial Bot."
                : "O aplicativo não poderá preparar novas propostas. As propostas pendentes serão canceladas."}
            </DialogDescription>
          </DialogHeader>
          <p className="font-semibold">{review?.name}</p>
          <p className="break-all font-mono text-xs text-muted-foreground">{review?.clientId}</p>
          {error && (
            <div role="alert" className="rounded-xl bg-destructive/5 p-3 text-sm">
              <p>{error}</p>
              {onReload && (
                <button
                  type="button"
                  className="mt-2 min-h-11 font-semibold text-primary"
                  onClick={() => {
                    setReview(null);
                    onReload();
                  }}
                >
                  Recarregar configuração
                </button>
              )}
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              className="min-h-11"
              disabled={busy}
              onClick={() => setReview(null)}
            >
              Cancelar
            </Button>
            <Button
              className="min-h-11"
              disabled={busy}
              onClick={async () => {
                if (review && (await onClient(review))) {
                  setReview(null);
                  setClientId("");
                  setName("");
                }
              }}
            >
              {busy && <Loader2 size={14} className="animate-spin" />}
              {review?.approved ? "Confirmar aprovação" : "Confirmar revogação"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function AssistantConfiguration({ tab }: { tab: ConfigProps["tab"] }) {
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ["assistant-admin-config"],
    queryFn: () => adminListAssistantBotConfigs(),
    staleTime: 15_000,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function mutate(task: () => Promise<AssistantAdminConfigDTO>, message: string) {
    if (busy) return false;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await task();
      cache.setQueryData(["assistant-admin-config"], data);
      await cache.invalidateQueries({ queryKey: ["assistant-catalog"] });
      setNotice(message);
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível salvar. Tente novamente.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  if (query.isLoading)
    return (
      <p role="status" className="py-6 text-sm text-muted-foreground">
        Carregando configurações…
      </p>
    );
  if (!query.data)
    return (
      <div role="alert" className="py-6 text-sm">
        <p>Não foi possível carregar as configurações.</p>
        <Button className="mt-3 min-h-11" variant="outline" onClick={() => void query.refetch()}>
          Tentar novamente
        </Button>
      </div>
    );
  return (
    <AssistantConfigurationView
      data={query.data}
      tab={tab}
      busy={busy}
      error={error}
      notice={notice}
      onReload={() => {
        setError("");
        void query.refetch();
      }}
      onSave={(input) =>
        mutate(
          () => adminSaveAssistantBotConfig({ data: botConfigInput.parse(input) }),
          "Configuração salva.",
        )
      }
      onReset={(input) =>
        mutate(
          () =>
            adminResetAssistantBotConfig({
              data: { ...input, id: botConfigInput.shape.id.parse(input.id) },
            }),
          "Padrão restaurado.",
        )
      }
      onClient={(input) =>
        mutate(
          () => adminSetAssistantMcpClient({ data: input }),
          input.approved ? "Conexão aprovada." : "Acesso revogado.",
        )
      }
    />
  );
}
