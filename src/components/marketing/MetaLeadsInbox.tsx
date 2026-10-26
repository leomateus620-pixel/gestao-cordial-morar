import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, ChevronLeft, ChevronRight, Inbox, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  listMetaLeads,
  retryMetaLead,
  assignMetaLead,
  resolveMetaLead,
  getMetaLeadDetail,
  type MetaLeadInboxItem,
} from "@/lib/ads/leads.functions";
import { listAttendanceBrokers } from "@/lib/attendances/attendances.functions";
import { brokerCanServeAgency } from "@/lib/attendances/broker-scope";
import { useSession } from "@/lib/auth-mock";
import { isAdminUser } from "@/lib/access-control";
import type { MarketingAgencyId } from "@/types/marketing";
const LABEL: Record<MetaLeadInboxItem["status"], string> = {
  queued: "Novo",
  processing: "Processando",
  unassigned: "A distribuir",
  imported: "Importado",
  review: "Revisar",
  failed: "Falha",
  quarantined: "Página não reconhecida",
};
export function MetaLeadsInbox({ agency }: { agency: MarketingAgencyId | "todas" }) {
  const session = useSession(),
    admin = isAdminUser(session),
    qc = useQueryClient();
  const [status, setStatus] = useState<MetaLeadInboxItem["status"] | "">(""),
    [page, setPage] = useState(1),
    [brokerByLead, setBrokerByLead] = useState<Record<string, string>>({}),
    [attendanceLinks, setAttendanceLinks] = useState<Record<string, string>>({});
  const list = useServerFn(listMetaLeads),
    retry = useServerFn(retryMetaLead),
    assign = useServerFn(assignMetaLead),
    resolve = useServerFn(resolveMetaLead),
    getBrokers = useServerFn(listAttendanceBrokers);
  const query = useQuery({
    queryKey: ["marketing", "meta-leads", session?.id, session?.perfil, agency, status, page],
    queryFn: () =>
      list({
        data: {
          imobiliaria: agency === "todas" ? undefined : agency,
          status: status || undefined,
          page,
          pageSize: 20,
        },
      }),
    enabled: Boolean(session),
    staleTime: 15_000,
  });
  const brokers = useQuery({
    queryKey: ["marketing", "lead-brokers", session?.id, session?.perfil, agency],
    queryFn: () => getBrokers(),
    enabled: Boolean(session),
    staleTime: 60_000,
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["marketing", "meta-leads"] });
  };
  const retryMutation = useMutation({
    mutationFn: (id: string) => retry({ data: { id } }),
    onSuccess: () => {
      refresh();
      toast.success("Reprocessamento colocado na fila.");
    },
    onError: () => toast.error("Revise a conexão e o mapeamento antes de reprocessar."),
  });
  const assignMutation = useMutation({
    mutationFn: (data: { id: string; brokerId: string }) => assign({ data }),
    onSuccess: () => {
      refresh();
      toast.success("Lead distribuído.");
    },
    onError: () => toast.error("Não foi possível distribuir. Confira o corretor e a imobiliária."),
  });
  const resolveMutation = useMutation({
    mutationFn: (data: { id: string; attendanceId: string }) => resolve({ data }),
    onSuccess: () => {
      refresh();
      toast.success("Submissão vinculada ao atendimento revisado.");
    },
    onError: () =>
      toast.error(
        "Confira o atendimento, a imobiliária e a situação da submissão antes de vincular.",
      ),
  });
  function attendanceId(link: string) {
    try {
      const url = new URL(link, window.location.origin);
      return url.origin === window.location.origin && url.pathname === "/atendimentos"
        ? url.searchParams.get("id")
        : null;
    } catch {
      return null;
    }
  }
  return (
    <section className="space-y-4" aria-label="Caixa de entrada de leads Meta">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold">Leads Meta</h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-foreground/65">
            Submissões recebidas do webhook. Leads reportados pela Meta, submissões e atendimentos
            únicos podem ter contagens diferentes.
          </p>
        </div>
        <Button variant="outline" className="min-h-11 shrink-0 rounded-2xl" onClick={refresh}>
          <RefreshCw className="size-4" />
          Atualizar
        </Button>
      </div>
      <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground/70">
        Situação
        <select
          className="h-11 w-full rounded-2xl border bg-card px-3 text-sm sm:max-w-xs"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as typeof status);
            setPage(1);
          }}
        >
          <option value="">Todas as situações</option>
          {Object.entries(LABEL)
            .filter(([key]) => admin || key !== "quarantined")
            .map(([key, value]) => (
              <option key={key} value={key}>
                {value}
              </option>
            ))}
        </select>
      </label>
      {query.isLoading ? (
        <p className="rounded-3xl bg-card p-6 text-sm text-foreground/65" role="status">
          Carregando submissões…
        </p>
      ) : query.isError ? (
        <div className="rounded-3xl border border-red-200 bg-card p-5 text-sm text-red-800">
          Não foi possível carregar os leads.{" "}
          <button type="button" className="min-h-11 underline" onClick={refresh}>
            Tentar novamente
          </button>
        </div>
      ) : !query.data?.items.length ? (
        <div className="rounded-3xl border border-dashed bg-card p-8 text-center">
          <Inbox className="mx-auto size-6 text-primary" />
          <h3 className="mt-3 text-sm font-semibold">Nenhuma submissão neste filtro</h3>
          <p className="mx-auto mt-2 max-w-lg text-xs leading-relaxed text-foreground/65">
            Os leads aparecerão após entrega e processamento do webhook. Uma conexão de anúncios,
            sozinha, não confirma o recebimento de leads.
          </p>
        </div>
      ) : (
        <div className="divide-y overflow-hidden rounded-3xl bg-card ring-1 ring-border/60">
          {query.data.items.map((lead) => (
            <article key={lead.id} className="p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
                <div className="min-w-0">
                  <p className="break-words text-sm font-semibold">
                    {lead.full_name || "Nome a identificar"}
                  </p>
                  <p className="mt-1 break-words text-xs text-foreground/65">
                    {lead.phone || lead.email || "Contato a identificar"}
                  </p>
                  <p className="mt-2 break-words text-xs text-foreground/60">
                    {lead.imobiliaria || "Marca a revisar"} · Formulário{" "}
                    {lead.form_id || "não informado"} ·{" "}
                    {new Date(lead.received_at).toLocaleString("pt-BR")}
                  </p>
                </div>
                <span className="h-fit w-fit rounded-full bg-muted px-3 py-1.5 text-xs font-semibold">
                  {LABEL[lead.status]}
                </span>
              </div>
              <LeadOriginalFields id={lead.id} />
              {lead.last_error && (
                <p className="mt-3 rounded-xl bg-amber-500/10 p-3 text-xs text-amber-900">
                  Processamento requer revisão.{" "}
                  {admin
                    ? "Consulte o diagnóstico e o mapeamento da integração."
                    : "Peça ao administrador para revisar a integração."}
                </p>
              )}
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                {lead.attendance_id && (
                  <a
                    href={`/atendimentos?id=${encodeURIComponent(lead.attendance_id)}`}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary/10 px-3 text-xs font-semibold text-primary"
                  >
                    Abrir atendimento
                    <ArrowUpRight className="size-4" />
                  </a>
                )}
                {lead.status === "unassigned" && (
                  <>
                    <select
                      aria-label={`Corretor para ${lead.full_name || "lead sem nome"}`}
                      value={brokerByLead[lead.id] ?? ""}
                      onChange={(e) =>
                        setBrokerByLead((v) => ({ ...v, [lead.id]: e.target.value }))
                      }
                      className="h-11 min-w-0 rounded-xl border bg-background px-3 text-sm sm:max-w-xs"
                    >
                      <option value="">Selecionar corretor da marca</option>
                      {brokers.data
                        ?.filter((b) => brokerCanServeAgency(b, lead.imobiliaria))
                        .map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.nome}
                          </option>
                        ))}
                    </select>
                    <Button
                      className="min-h-11 rounded-xl"
                      disabled={!brokerByLead[lead.id] || assignMutation.isPending}
                      onClick={() =>
                        assignMutation.mutate({ id: lead.id, brokerId: brokerByLead[lead.id] })
                      }
                    >
                      Distribuir
                    </Button>
                  </>
                )}
                {admin && ["failed", "review", "quarantined"].includes(lead.status) && (
                  <Button
                    variant="outline"
                    className="min-h-11 rounded-xl"
                    disabled={retryMutation.isPending}
                    onClick={() => retryMutation.mutate(lead.id)}
                  >
                    Reprocessar
                  </Button>
                )}
              </div>
              {lead.status === "review" && (
                <details className="mt-3 rounded-2xl border p-3">
                  <summary className="min-h-11 cursor-pointer text-xs font-semibold">
                    Resolver revisão e vincular atendimento
                  </summary>
                  <p className="mt-2 text-xs leading-relaxed text-foreground/65">
                    Confira a nova intenção e os dados de contato. Crie um atendimento pelo cadastro
                    existente quando necessário, ou escolha um atendimento compatível após revisar a
                    ambiguidade.
                  </p>
                  <a
                    href="/atendimentos"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-11 items-center text-xs font-semibold text-primary underline"
                  >
                    Abrir atendimentos para revisão
                  </a>
                  <form
                    className="mt-2 flex flex-col gap-2 sm:flex-row"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const id = attendanceId(attendanceLinks[lead.id] || "");
                      if (!id) {
                        toast.error("Cole o link de um atendimento deste Gestão Cordial.");
                        return;
                      }
                      resolveMutation.mutate({ id: lead.id, attendanceId: id });
                    }}
                  >
                    <label className="min-w-0 flex-1 text-xs font-semibold">
                      Link do atendimento revisado
                      <input
                        type="url"
                        required
                        className="mt-1 h-11 w-full rounded-xl border bg-background px-3 text-sm font-normal"
                        value={attendanceLinks[lead.id] || ""}
                        onChange={(event) =>
                          setAttendanceLinks((old) => ({ ...old, [lead.id]: event.target.value }))
                        }
                        placeholder="Cole o link do atendimento aberto"
                      />
                    </label>
                    <Button
                      type="submit"
                      variant="outline"
                      className="min-h-11 self-end rounded-xl"
                      disabled={resolveMutation.isPending}
                    >
                      Confirmar vínculo
                    </Button>
                  </form>
                </details>
              )}
            </article>
          ))}
        </div>
      )}
      {Boolean(query.data?.total) && (
        <div className="flex items-center justify-between gap-3 text-xs text-foreground/65">
          <span>
            {query.data?.total} submissões · página {page}
          </span>
          <div className="flex gap-2">
            <Button
              aria-label="Página anterior de leads"
              size="icon"
              variant="outline"
              className="size-11 rounded-xl"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              aria-label="Próxima página de leads"
              size="icon"
              variant="outline"
              className="size-11 rounded-xl"
              disabled={page * 20 >= (query.data?.total ?? 0)}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function LeadOriginalFields({ id }: { id: string }) {
  const session = useSession(),
    [open, setOpen] = useState(false),
    detail = useServerFn(getMetaLeadDetail);
  const query = useQuery({
    queryKey: ["marketing", "lead-detail", session?.id, session?.perfil, id],
    queryFn: () => detail({ data: { id } }),
    enabled: open && Boolean(session),
    staleTime: 15_000,
  });
  const answers: Array<{ name: string; values: string[] }> = Array.isArray(query.data?.field_data)
    ? query.data.field_data.filter((field: unknown): field is { name: string; values: string[] } =>
        Boolean(
          field &&
          typeof field === "object" &&
          "name" in field &&
          typeof field.name === "string" &&
          "values" in field &&
          Array.isArray(field.values) &&
          field.values.every((value: unknown) => typeof value === "string"),
        ),
      )
    : [];
  return (
    <details
      className="mt-3 rounded-2xl bg-muted/40 p-3"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="min-h-11 cursor-pointer text-xs font-semibold">
        Ver origem e respostas do formulário
      </summary>
      {query.isLoading ? (
        <p className="mt-2 text-xs text-foreground/65">Carregando submissão…</p>
      ) : query.isError ? (
        <p className="mt-2 text-xs text-red-800">Não foi possível abrir esta submissão.</p>
      ) : (
        <>
          <p className="mt-2 break-words text-xs text-foreground/65">
            Campanha Meta: {query.data?.external_campaign_id || "não informada"} · Anúncio:{" "}
            {query.data?.ad_id || "não informado"}
          </p>
          {answers.length ? (
            <dl className="mt-3 space-y-3">
              {answers.map((answer, index) => (
                <div key={`${answer.name}-${index}`}>
                  <dt className="break-words text-xs font-semibold">{answer.name}</dt>
                  <dd className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground/75">
                    {answer.values.join(" · ") || "Sem resposta"}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-2 text-xs text-foreground/65">
              As respostas completas ainda não estão disponíveis.
            </p>
          )}
        </>
      )}
    </details>
  );
}
