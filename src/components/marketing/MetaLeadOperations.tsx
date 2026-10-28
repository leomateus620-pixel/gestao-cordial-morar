import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth-mock";
import { useAds } from "@/hooks/useAds";
import { MetaFormMapping } from "@/components/integracoes/MetaAdsCard";
import { listMetaLeadFormMappings } from "@/lib/ads/leads.functions";
import {
  getMetaLeadHealth,
  recoverMetaFormLeads,
  listMetaLeadRecoveries,
} from "@/lib/ads/leads-admin.functions";

export function MetaLeadOperations({ agency }: { agency: "cordial" | "morar" | "todas" }) {
  const session = useSession(),
    qc = useQueryClient();
  const admin = session?.perfil === "admin_owner";
  const [open, setOpen] = useState(false),
    [mappingId, setMappingId] = useState(""),
    [since, setSince] = useState(""),
    [until, setUntil] = useState("");
  const getHealth = useServerFn(getMetaLeadHealth),
    mappingsFn = useServerFn(listMetaLeadFormMappings),
    recover = useServerFn(recoverMetaFormLeads),
    listRecoveries = useServerFn(listMetaLeadRecoveries);
  const ads = useAds([], agency);
  const health = useQuery({
    queryKey: ["marketing", "lead-health", session?.id, session?.perfil, agency],
    queryFn: () => getHealth({ data: { imobiliaria: agency as "cordial" | "morar" } }),
    enabled: open && agency !== "todas" && (admin || session?.perfil === "secretaria"),
    staleTime: 30_000,
  });
  const mappings = useQuery({
    queryKey: ["marketing", "lead-form-mappings", session?.id, session?.perfil],
    queryFn: () => mappingsFn(),
    enabled: open && admin,
    staleTime: 30_000,
  });
  const recoveries = useQuery({
    queryKey: ["marketing", "lead-recoveries", session?.id, session?.perfil, agency],
    queryFn: () => listRecoveries({ data: { imobiliaria: agency as "cordial" | "morar" } }),
    enabled: open && admin && agency !== "todas",
    staleTime: 15_000,
    refetchInterval: (query) =>
      query.state.data?.some((job) => ["queued", "processing"].includes(job.status)) ? 5000 : false,
  });
  const recovery = useMutation({
    mutationFn: () =>
      recover({
        data: { mappingId, since: `${since}T00:00:00-03:00`, until: `${until}T23:59:59-03:00` },
      }),
    onSuccess: () => {
      toast.success("Recuperação agendada. A fila preserva o checkpoint e a deduplicação.");
      void qc.invalidateQueries({ queryKey: ["marketing", "lead-health"] });
      void qc.invalidateQueries({ queryKey: ["marketing", "lead-recoveries"] });
    },
    onError: () =>
      toast.error(
        "Não foi possível agendar. Selecione um formulário mapeado e até 30 dias passados.",
      ),
  });
  return (
    <details className="border-y py-2" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-primary">
        Recebimento, formulários e recuperação
      </summary>
      {agency === "todas" ? (
        <p className="py-3 text-sm text-foreground/70">
          Selecione uma imobiliária no filtro para consultar a saúde e os formulários
          correspondentes.
        </p>
      ) : health.isError ? (
        <p role="alert" className="py-3 text-sm text-red-800">
          Diagnóstico indisponível.{" "}
          <button className="min-h-11 underline" onClick={() => void health.refetch()}>
            Tentar novamente
          </button>
        </p>
      ) : health.isLoading ? (
        <p role="status" className="py-3 text-sm">
          Consultando recebimento…
        </p>
      ) : (
        health.data && (
          <div className="grid gap-4 py-4 sm:grid-cols-3">
            <Health label="Formulários mapeados" value={String(health.data.mappedForms)} />
            <Health label="Na fila" value={String(health.data.queued)} />
            <Health label="A revisar / falhas" value={String(health.data.needsReview)} />
            <Health
              label="Último evento recebido"
              value={
                health.data.lastEvent
                  ? new Date(health.data.lastEvent).toLocaleString("pt-BR")
                  : "Nenhum evento recebido"
              }
            />
            <Health
              label="Último atendimento criado"
              value={
                health.data.lastAttendance
                  ? new Date(health.data.lastAttendance).toLocaleString("pt-BR")
                  : "Ainda não comprovado"
              }
            />
          </div>
        )
      )}
      {admin && agency !== "todas" && (
        <>
          <a
            href="/integracoes"
            className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline"
          >
            Conferir callback, permissões e inscrições em Integrações
          </a>
          {ads.connections
            .filter(
              (connection) =>
                connection.platform === "meta" &&
                connection.imobiliaria === agency &&
                connection.id &&
                connection.pageId,
            )
            .map((connection) => (
              <div key={connection.id} className="py-2">
                <p className="text-sm font-semibold">
                  {connection.accountLabel || connection.accountId} · Página {connection.pageId}
                </p>
                <MetaFormMapping connection={connection} />
              </div>
            ))}
          <form
            className="my-4 space-y-3 border-t pt-4"
            onSubmit={(event) => {
              event.preventDefault();
              recovery.mutate();
            }}
          >
            <h3 className="text-sm font-semibold">Recuperar submissões não recebidas</h3>
            <p className="text-xs text-foreground/70">
              Até 30 dias por solicitação, sujeito à disponibilidade da Meta. Datas no fuso
              America/Sao_Paulo. Entradas já excluídas permanecem excluídas.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-xs font-semibold">
                Formulário mapeado
                <select
                  required
                  className="mt-1.5 h-11 w-full rounded-xl border border-foreground/55 bg-card px-3 text-sm"
                  value={mappingId}
                  onChange={(event) => setMappingId(event.target.value)}
                >
                  <option value="">Selecionar formulário</option>
                  {mappings.data
                    ?.filter((mapping) => mapping.imobiliaria === agency && mapping.enabled)
                    .map((mapping) => (
                      <option key={mapping.id} value={mapping.id}>
                        Formulário {mapping.form_id}
                      </option>
                    ))}
                </select>
              </label>
              <label className="text-xs font-semibold">
                Desde
                <input
                  required
                  type="date"
                  className="mt-1.5 h-11 w-full rounded-xl border border-foreground/55 bg-card px-3 text-sm"
                  value={since}
                  onChange={(event) => setSince(event.target.value)}
                />
              </label>
              <label className="text-xs font-semibold">
                Até
                <input
                  required
                  type="date"
                  className="mt-1.5 h-11 w-full rounded-xl border border-foreground/55 bg-card px-3 text-sm"
                  value={until}
                  onChange={(event) => setUntil(event.target.value)}
                />
              </label>
            </div>
            <Button
              type="submit"
              variant="outline"
              className="min-h-11"
              disabled={recovery.isPending || !mappingId}
            >
              Agendar recuperação
            </Button>
          </form>{" "}
          {Boolean(recoveries.data?.length) && (
            <section className="mb-4 border-t pt-4">
              <h3 className="text-sm font-semibold">Recuperações recentes</h3>
              <ul className="mt-2 divide-y">
                {recoveries.data?.map((job) => (
                  <li key={job.id} className="py-3 text-xs">
                    <p className="font-semibold">
                      {job.status === "done"
                        ? "Concluída"
                        : job.status === "queued"
                          ? "Na fila"
                          : job.status === "processing"
                            ? "Em andamento"
                            : "Requer revisão"}{" "}
                      · {job.processed} submissões processadas
                    </p>
                    <p className="mt-1 text-foreground/70">
                      {new Date(job.range_start).toLocaleDateString("pt-BR", {
                        timeZone: "America/Sao_Paulo",
                      })}{" "}
                      a{" "}
                      {new Date(job.range_end).toLocaleDateString("pt-BR", {
                        timeZone: "America/Sao_Paulo",
                      })}{" "}
                      · {job.pages} páginas consultadas
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </details>
  );
}
function Health({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-foreground/70">{label}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}
