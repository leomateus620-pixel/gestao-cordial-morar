import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, ChevronLeft, ChevronRight, Inbox, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { MetaLeadOperations } from "@/components/marketing/MetaLeadOperations";
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
import type { MarketingAgencyId, MarketingCampaign } from "@/types/marketing";
const LABEL: Record<MetaLeadInboxItem["status"], string> = {
  queued: "Novo",
  processing: "Processando",
  unassigned: "A distribuir",
  imported: "Importado",
  review: "Revisar",
  failed: "Falha",
  quarantined: "Página não reconhecida",
};
export function MetaLeadsInbox({
  agency,
  status = "",
  page = 1,
  onFiltersChange,
  period,
  accountId,
  campaigns = [],
  extraFilters = { search: "", formId: "", campaignId: "", brokerId: "" },
  onExtraFiltersChange,
}: {
  agency: MarketingAgencyId | "todas";
  period?: { since: string; until: string };
  accountId?: string;
  campaigns?: MarketingCampaign[];
  extraFilters?: { search: string; formId: string; campaignId: string; brokerId: string };
  onExtraFiltersChange?: (
    patch: Partial<{ search: string; formId: string; campaignId: string; brokerId: string }>,
  ) => void;
  status?: MetaLeadInboxItem["status"] | "";
  page?: number;
  onFiltersChange?: (patch: { status?: MetaLeadInboxItem["status"] | ""; page?: number }) => void;
}) {
  const session = useSession(),
    admin = isAdminUser(session),
    qc = useQueryClient();
  const canReadContacts = admin || session?.perfil === "secretaria";
  const [secondaryFiltersOpen, setSecondaryFiltersOpen] = useState(false);
  const secondaryFilterCount = [
    extraFilters.formId,
    extraFilters.campaignId,
    extraFilters.brokerId,
  ].filter(Boolean).length;
  const [brokerByLead, setBrokerByLead] = useState<Record<string, string>>({}),
    [attendanceLinks, setAttendanceLinks] = useState<Record<string, string>>({});
  const list = useServerFn(listMetaLeads),
    retry = useServerFn(retryMetaLead),
    assign = useServerFn(assignMetaLead),
    resolve = useServerFn(resolveMetaLead),
    getBrokers = useServerFn(listAttendanceBrokers);
  const query = useQuery({
    queryKey: [
      "marketing",
      "meta-leads",
      session?.id,
      session?.perfil,
      agency,
      status,
      page,
      extraFilters,
      period,
      accountId,
    ],
    queryFn: () =>
      list({
        data: {
          imobiliaria: agency === "todas" ? undefined : agency,
          status: status || undefined,
          accountId: accountId || undefined,
          search: extraFilters.search || undefined,
          formId: extraFilters.formId || undefined,
          campaignId: extraFilters.campaignId || undefined,
          brokerId: extraFilters.brokerId || undefined,
          since: period?.since,
          until: period?.until,
          page,
          pageSize: 20,
        },
      }),
    enabled: Boolean(session) && canReadContacts,
    staleTime: 15_000,
  });
  const brokers = useQuery({
    queryKey: ["marketing", "lead-brokers", session?.id, session?.perfil, agency],
    queryFn: () => getBrokers(),
    enabled: Boolean(session) && canReadContacts,
    staleTime: 60_000,
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["marketing", "meta-leads"] });
    void qc.invalidateQueries({ queryKey: ["marketing", "lead-detail"] });
    void qc.invalidateQueries({ queryKey: ["marketing", "lead-health"] });
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
  if (!canReadContacts)
    return (
      <section className="border-y py-8" aria-label="Acesso aos leads">
        <h2 className="font-display text-lg font-semibold">Acesso aos contatos restrito</h2>
        <p className="mt-2 max-w-xl text-sm text-foreground/70">
          Este perfil pode consultar os resultados agregados na Visão geral. A caixa de entrada e o
          tratamento dos contatos exigem autorização operacional.
        </p>
      </section>
    );
  return (
    <section className="space-y-4" aria-label="Caixa de entrada de leads Meta">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold">Caixa de entrada</h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-foreground/65">
            Submissões recebidas do webhook. Leads reportados pela Meta, submissões e atendimentos
            únicos podem ter contagens diferentes.
          </p>
        </div>
        <Button variant="outline" className="min-h-11 shrink-0 rounded-xl" onClick={refresh}>
          <RefreshCw className="size-4" />
          Atualizar
        </Button>
      </div>
      <MetaLeadOperations agency={agency} />
      <div className="grid gap-3 sm:grid-cols-2">
        <LeadSearch
          value={extraFilters.search}
          onCommit={(search) => onExtraFiltersChange?.({ search })}
        />
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground/70">
          Situação
          <select
            className="h-11 w-full rounded-xl border border-foreground/55 bg-card px-3 text-sm sm:max-w-xs"
            value={status}
            onChange={(e) => {
              onFiltersChange?.({ status: e.target.value as typeof status, page: 1 });
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
      </div>
      <Button
        variant="outline"
        className="min-h-11 w-full justify-between sm:hidden"
        aria-expanded={secondaryFiltersOpen}
        aria-controls="meta-lead-secondary-filters"
        onClick={() => setSecondaryFiltersOpen((open) => !open)}
      >
        Filtros adicionais
        <span className="text-xs">
          {secondaryFilterCount ? `${secondaryFilterCount} ativos` : "3 opções"}
        </span>
      </Button>
      <div
        id="meta-lead-secondary-filters"
        className={`${secondaryFiltersOpen ? "grid" : "hidden"} gap-3 sm:grid sm:grid-cols-3`}
      >
        <LeadSearch
          label="Formulário"
          numeric
          value={extraFilters.formId}
          onCommit={(formId) => onExtraFiltersChange?.({ formId })}
        />
        <label className="text-xs font-semibold">
          Campanha
          <select
            className="mt-1.5 h-11 w-full rounded-xl border border-foreground/55 bg-card px-3 text-sm font-normal"
            value={extraFilters.campaignId}
            onChange={(event) => onExtraFiltersChange?.({ campaignId: event.target.value })}
          >
            <option value="">Todas as campanhas</option>
            {campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold">
          Responsável
          <select
            className="mt-1.5 h-11 w-full rounded-xl border border-foreground/55 bg-card px-3 text-sm font-normal"
            value={extraFilters.brokerId}
            onChange={(event) => onExtraFiltersChange?.({ brokerId: event.target.value })}
          >
            <option value="">Todos os responsáveis</option>
            {brokers.data?.map((broker) => (
              <option key={broker.id} value={broker.id}>
                {broker.nome}
              </option>
            ))}
          </select>
        </label>
      </div>
      {period && (
        <p className="text-xs text-foreground/70">
          Recebimento: {period.since} a {period.until} · America/Sao_Paulo
        </p>
      )}
      {query.isLoading ? (
        <p className="rounded-xl bg-card p-6 text-sm text-foreground/65" role="status">
          Carregando submissões…
        </p>
      ) : query.isError ? (
        <div className="rounded-xl border border-red-200 bg-card p-5 text-sm text-red-800">
          Não foi possível carregar os leads.{" "}
          <button type="button" className="min-h-11 underline" onClick={refresh}>
            Tentar novamente
          </button>
        </div>
      ) : !query.data?.items.length ? (
        <div className="rounded-xl border border-dashed bg-card p-8 text-center">
          <Inbox className="mx-auto size-6 text-primary" />
          <h3 className="mt-3 text-sm font-semibold">
            {status || Object.values(extraFilters).some(Boolean)
              ? "Nenhum resultado neste filtro"
              : "Nenhum lead recebido"}
          </h3>
          <p className="mx-auto mt-2 max-w-lg text-xs leading-relaxed text-foreground/65">
            {status
              ? "Altere a situação para consultar outras submissões."
              : "As submissões aparecerão após o recebimento e processamento do formulário conectado."}
          </p>
        </div>
      ) : (
        <div className="divide-y overflow-hidden rounded-xl bg-card ring-1 ring-border/60">
          {query.data.items.map((lead) => (
            <article key={lead.id} className="p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
                <div className="min-w-0">
                  {lead.is_synthetic && <SyntheticLeadBadge />}
                  <p className="break-words text-sm font-semibold">
                    {lead.full_name || "Nome a identificar"}
                  </p>
                  <p className="mt-1 break-words text-xs text-foreground/65">
                    {lead.phone || lead.email || "Contato a identificar"}
                  </p>
                  <p className="mt-2 break-words text-xs text-foreground/65">
                    {lead.imobiliaria || "Marca a revisar"} · Formulário{" "}
                    {lead.form_id || "não informado"} ·{" "}
                    {new Date(lead.received_at).toLocaleString("pt-BR", {
                      timeZone: "America/Sao_Paulo",
                    })}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-end">
                  <span className="h-fit w-fit rounded-full bg-muted px-3 py-1.5 text-xs font-semibold">
                    {LABEL[lead.status]}
                  </span>
                  <p className="text-xs text-foreground/70">
                    Responsável:{" "}
                    {lead.broker_id
                      ? brokers.data?.find((broker) => broker.id === lead.broker_id)?.nome ||
                        "atribuído"
                      : "a distribuir"}
                  </p>
                </div>
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
                      className="h-11 min-w-0 rounded-xl border border-foreground/55 bg-background px-3 text-sm sm:max-w-xs"
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
                <details className="mt-3 rounded-xl border p-3">
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
                        className="mt-1 h-11 w-full rounded-xl border border-foreground/55 bg-background px-3 text-sm font-normal"
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
              onClick={() => onFiltersChange?.({ page: page - 1 })}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              aria-label="Próxima página de leads"
              size="icon"
              variant="outline"
              className="size-11 rounded-xl"
              disabled={page * 20 >= (query.data?.total ?? 0)}
              onClick={() => onFiltersChange?.({ page: page + 1 })}
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
      className="mt-3 rounded-xl bg-muted/40 p-3"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="min-h-11 cursor-pointer text-xs font-semibold">
        Ver detalhes e histórico
      </summary>
      {query.isLoading ? (
        <p className="mt-2 text-xs text-foreground/65">Carregando submissão…</p>
      ) : query.isError ? (
        <p className="mt-2 text-xs text-red-800">Não foi possível abrir esta submissão.</p>
      ) : (
        <>
          {query.data?.is_synthetic && <SyntheticLeadBadge />}
          <p className="mt-2 break-words text-xs text-foreground/65">
            Campanha Meta: {query.data?.external_campaign_id || "não informada"} · Anúncio:{" "}
            {query.data?.ad_id || "não informado"}
          </p>
          <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-3">
            {[
              ["Criado na Meta", query.data?.meta_created_at],
              ["Recebido", query.data?.received_at],
              ["Importado", query.data?.completed_at],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="font-semibold">{label}</dt>
                <dd className="mt-1 text-foreground/70">
                  {value
                    ? new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
                    : "Não disponível"}
                </dd>
              </div>
            ))}
          </dl>
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
          {Boolean(query.data?.history?.length) && (
            <section className="mt-4 border-t pt-3">
              <h4 className="text-xs font-semibold">Histórico de processamento</h4>
              <ol className="mt-2 space-y-2">
                {query.data?.history.map((event) => (
                  <li key={event.id} className="text-xs text-foreground/70">
                    {new Date(event.occurred_at).toLocaleString("pt-BR", {
                      timeZone: "America/Sao_Paulo",
                    })}{" "}
                    · {LABEL[event.status as keyof typeof LABEL] ?? event.status}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </>
      )}
    </details>
  );
}

function LeadSearch({
  value,
  onCommit,
  label = "Buscar contato",
  numeric = false,
}: {
  value: string;
  onCommit: (value: string) => void;
  label?: string;
  numeric?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (draft === value) return;
    const timer = window.setTimeout(() => onCommit(draft), 350);
    return () => window.clearTimeout(timer);
  }, [draft, value, onCommit]);
  return (
    <label className="text-xs font-semibold">
      {label}
      <input
        className="mt-1.5 h-11 w-full rounded-xl border border-foreground/55 bg-card px-3 text-sm font-normal"
        value={draft}
        placeholder={numeric ? "ID do formulário" : "Nome, telefone ou e-mail"}
        inputMode={numeric ? "numeric" : "text"}
        maxLength={numeric ? 80 : 100}
        onChange={(event) => {
          if (!numeric || /^\d*$/.test(event.target.value)) setDraft(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") onCommit(draft);
        }}
      />
    </label>
  );
}

function SyntheticLeadBadge() {
  return (
    <span className="mb-2 inline-flex rounded-md border border-amber-700/30 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-950">
      TESTE SINTÉTICO
    </span>
  );
}
