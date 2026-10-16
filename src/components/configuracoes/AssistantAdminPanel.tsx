import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getAssistantAdminOverview } from "@/lib/agent/admin.functions";
import { agentBots } from "@/lib/agent/bots";
import { CordialBotBrand } from "@/components/brand/CordialBotBrand";
import { AssistantConfiguration } from "@/components/assistant/AssistantConfiguration";
import { Button } from "@/components/ui/button";

const statusLabels: Record<string, string> = {
  pending: "Pendente",
  confirmed: "Confirmada",
  executed: "Concluída",
  failed: "Falhou",
  cancelled: "Cancelada",
};
function AssistantUsagePanel({ tab }: { tab: "usage" | "actions" | "audit" }) {
  const [days, setDays] = useState(7);
  const [botId, setBotId] = useState("");
  const [userId, setUserId] = useState("");
  const [status, setStatus] = useState("");
  const validUser = !userId || /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(userId);
  const query = useQuery({
    queryKey: ["assistant-admin", days, botId, userId, status],
    queryFn: () =>
      getAssistantAdminOverview({
        data: {
          days,
          ...(botId ? { botId } : {}),
          ...(userId ? { userId } : {}),
          ...(status ? { status: status as "pending" } : {}),
        },
      }),
    enabled: validUser,
    staleTime: 30_000,
  });
  const data = query.data;
  const inputClass = "min-h-10 rounded-xl border bg-background px-3 text-sm";
  return (
    <div>
      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <select
          aria-label="Período da auditoria"
          className={inputClass}
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          <option value={7}>Últimos 7 dias</option>
          <option value={30}>Últimos 30 dias</option>
          <option value={90}>Últimos 90 dias</option>
        </select>
        <select
          aria-label="Agente na auditoria"
          className={inputClass}
          value={botId}
          onChange={(e) => setBotId(e.target.value)}
        >
          <option value="">Todos os agentes</option>
          {agentBots.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <input
          aria-label="ID do usuário na auditoria"
          placeholder="ID do usuário"
          className={inputClass}
          value={userId}
          onChange={(e) => setUserId(e.target.value.trim())}
          aria-invalid={!validUser}
        />
        <select
          aria-label="Estado da ação"
          className={inputClass}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Todos os estados</option>
          {Object.entries(statusLabels).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {!validUser && <p className="text-sm text-destructive">Informe um ID de usuário válido.</p>}
      {query.isPending && validUser && (
        <p role="status" className="py-4 text-sm text-muted-foreground">
          Carregando indicadores…
        </p>
      )}
      {query.error && (
        <p role="alert" className="py-4 text-sm text-destructive">
          {query.error.message}
        </p>
      )}
      {data && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Metric label="Chamadas à IA" value={String(data.summary.gatewayCalls)} />
            <Metric label="Tokens informados" value={data.summary.tokens.toLocaleString("pt-BR")} />
            <Metric label="Ações concluídas" value={String(data.summary.executed)} />
            <Metric
              label="Custo estimado (USD)"
              value={
                data.summary.costUsd === null
                  ? "Indisponível"
                  : `$ ${data.summary.costUsd.toFixed(4)}`
              }
            />
          </div>
          {!!data.summary.unknownCosts && (
            <p className="mb-3 text-xs text-muted-foreground">
              {data.summary.unknownCosts} chamada(s) sem estimativa de custo.
            </p>
          )}
          <div role="tabpanel" className="max-h-96 overflow-auto rounded-xl border">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  <th className="p-3">Quando</th>
                  <th className="p-3">Agente / usuário</th>
                  <th className="p-3">
                    {tab === "usage" ? "Modelo" : tab === "actions" ? "Ação" : "Operação"}
                  </th>
                  <th className="p-3">{tab === "usage" ? "Tokens / custo USD" : "Resultado"}</th>
                </tr>
              </thead>
              <tbody>
                {(data[tab] as any[]).map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="whitespace-nowrap p-3">
                      {new Date(row.created_at).toLocaleString("pt-BR", {
                        timeZone: "America/Sao_Paulo",
                      })}
                    </td>
                    <td className="p-3">
                      {agentBots.find((b) => b.id === row.bot_id)?.name ?? row.bot_id}
                      <span className="block text-muted-foreground" title={row.user_id}>
                        {row.user_id?.slice(0, 8)}
                      </span>
                    </td>
                    <td className="p-3">
                      {tab === "usage" ? row.model : tab === "actions" ? row.type : row.tool}
                    </td>
                    <td className="p-3">
                      {tab === "usage"
                        ? `${row.prompt_tokens == null ? "—" : row.prompt_tokens + (row.completion_tokens ?? 0)} / ${row.estimated_cost_usd == null ? "Indisponível" : Number(row.estimated_cost_usd).toFixed(4)}`
                        : tab === "actions"
                          ? (statusLabels[row.status] ?? row.status)
                          : (row.result_summary?.status ?? "Registrado")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data[tab].length && (
              <p className="p-5 text-sm text-muted-foreground">Nenhum registro neste período.</p>
            )}
          </div>
          {data.limited && (
            <p className="mt-2 text-xs text-muted-foreground">
              Amostra limitada. Reduza o período ou filtre por usuário.
            </p>
          )}
        </>
      )}
    </div>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

export function AssistantAdminPanel() {
  const cache = useQueryClient();
  const [tab, setTab] = useState<"team" | "connections" | "usage" | "actions" | "audit">("team");
  return (
    <section
      className="assistant-settings mb-5 min-w-0 rounded-2xl border bg-card p-4 sm:p-5"
      aria-label="Administração do Cordial Bot"
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2>
          <CordialBotBrand />
        </h2>
        <Button
          variant="outline"
          className="min-h-11"
          onClick={() => {
            void cache.invalidateQueries({
              queryKey:
                tab === "team" || tab === "connections"
                  ? ["assistant-admin-config"]
                  : ["assistant-admin"],
            });
          }}
        >
          Atualizar
        </Button>
      </div>
      <div
        className="mb-5 flex gap-1 overflow-x-auto"
        role="tablist"
        aria-label="Administração do Cordial Bot"
      >
        {(
          [
            ["team", "Equipe"],
            ["connections", "Conexões MCP"],
            ["usage", "Uso"],
            ["actions", "Ações"],
            ["audit", "Auditoria"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            className={`min-h-11 shrink-0 rounded-full px-4 text-sm ${tab === value ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "team" || tab === "connections" ? (
        <AssistantConfiguration tab={tab} />
      ) : (
        <AssistantUsagePanel tab={tab} />
      )}
    </section>
  );
}
