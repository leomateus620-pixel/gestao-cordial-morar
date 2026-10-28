import { lazy, Suspense, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Info,
  RefreshCw,
  Settings2,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { MarketingSearchSelect } from "@/components/marketing/MarketingSearchSelect";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
const MetaLeadOperations = lazy(() =>
  import("@/components/marketing/MetaLeadOperations").then((module) => ({
    default: module.MetaLeadOperations,
  })),
);
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
  onClearFilters,
  toolbarTarget,
}: {
  agency: MarketingAgencyId | "todas";
  period?: { since: string; until: string };
  accountId?: string;
  campaigns?: MarketingCampaign[];
  extraFilters?: { search: string; formId: string; campaignId: string; brokerId: string };
  onExtraFiltersChange?: (
    patch: Partial<{ search: string; formId: string; campaignId: string; brokerId: string }>,
  ) => void;
  onClearFilters?: () => void;
  toolbarTarget?: HTMLElement | null;
  status?: MetaLeadInboxItem["status"] | "";
  page?: number;
  onFiltersChange?: (patch: { status?: MetaLeadInboxItem["status"] | ""; page?: number }) => void;
}) {
  const session = useSession(),
    admin = isAdminUser(session),
    qc = useQueryClient();
  const canReadContacts = admin || session?.perfil === "secretaria";
  const [operationsOpen, setOperationsOpen] = useState(false);
  const hasFilters = Boolean(status || Object.values(extraFilters).some(Boolean));
  const clearFilters = () => {
    if (onClearFilters) onClearFilters();
    else {
      onFiltersChange?.({ status: "", page: 1 });
      onExtraFiltersChange?.({ search: "", formId: "", campaignId: "", brokerId: "" });
    }
  };
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
  const toolbar = (
    <>
      <div
        className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center"
        aria-label="Filtros dos contatos"
      >
        <MarketingSearchSelect
          label="Situação"
          value={status}
          onValueChange={(next) => onFiltersChange?.({ status: next as typeof status, page: 1 })}
          options={[
            { value: "", label: "Todas as situações" },
            ...Object.entries(LABEL)
              .filter(([key]) => admin || key !== "quarantined")
              .map(([value, label]) => ({ value, label })),
          ]}
          className="w-full sm:w-44 sm:flex-none"
        />
        <MarketingSearchSelect
          label="Campanha"
          value={extraFilters.campaignId}
          onValueChange={(campaignId) => onExtraFiltersChange?.({ campaignId })}
          options={[
            { value: "", label: "Todas as campanhas" },
            ...campaigns.map((campaign) => ({ value: campaign.id, label: campaign.name })),
          ]}
          className="w-full sm:w-52 sm:flex-none"
        />
        <MarketingSearchSelect
          label="Responsável"
          value={extraFilters.brokerId}
          onValueChange={(brokerId) => onExtraFiltersChange?.({ brokerId })}
          options={[
            { value: "", label: "Todos os responsáveis" },
            ...(brokers.data?.map((broker) => ({ value: broker.id, label: broker.nome })) ?? []),
          ]}
          className="hidden sm:inline-flex sm:w-48 sm:flex-none"
        />
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="h-11 w-full rounded-xl bg-card px-3 sm:h-10 sm:w-auto"
            >
              <SlidersHorizontal className="size-4" />
              Mais filtros
              <span className="sm:hidden">
                {[extraFilters.formId, extraFilters.brokerId].filter(Boolean).length
                  ? ` (${[extraFilters.formId, extraFilters.brokerId].filter(Boolean).length})`
                  : ""}
              </span>
              <span className="hidden sm:inline">{extraFilters.formId ? " (1)" : ""}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-[min(22rem,calc(100vw-2rem))] space-y-3 rounded-xl"
          >
            <div className="space-y-3 sm:hidden">
              <p className="text-sm font-semibold">Responsável</p>
              <MarketingSearchSelect
                label="Responsável"
                value={extraFilters.brokerId}
                onValueChange={(brokerId) => onExtraFiltersChange?.({ brokerId })}
                options={[
                  { value: "", label: "Todos os responsáveis" },
                  ...(brokers.data?.map((broker) => ({ value: broker.id, label: broker.nome })) ??
                    []),
                ]}
                className="w-full"
              />
            </div>
            <p className="text-sm font-semibold">Formulário</p>
            <MarketingSearchSelect
              label="Formulário"
              value={extraFilters.formId}
              onValueChange={(formId) => onExtraFiltersChange?.({ formId })}
              options={[
                { value: "", label: "Todos os formulários" },
                ...[
                  ...new Set(
                    query.data?.items
                      .map((lead) => lead.form_id)
                      .filter((id): id is string => Boolean(id)) ?? [],
                  ),
                ].map((id) => ({ value: id, label: `Formulário ${id}` })),
              ]}
              allowNumericValue
              className="w-full"
            />
            <p className="text-xs leading-relaxed text-foreground/65">
              Pesquise entre os formulários recebidos nesta página ou informe o ID de outro
              formulário.
            </p>
          </PopoverContent>
        </Popover>
        <div className="flex items-center justify-self-end gap-1 sm:ml-auto">
          <Button
            variant="ghost"
            size="icon"
            className="size-11 rounded-xl sm:size-10"
            aria-label="Reconsultar contatos"
            title="Reconsultar contatos salvos"
            disabled={query.isFetching}
            onClick={refresh}
          >
            <RefreshCw
              className={`size-4 ${query.isFetching ? "animate-spin motion-reduce:animate-none" : ""}`}
            />
          </Button>
          <Sheet open={operationsOpen} onOpenChange={setOperationsOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-11 rounded-xl sm:size-10"
                aria-label="Abrir formulários e recuperação"
                title="Formulários e recuperação"
              >
                <Settings2 className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent
              closeLabel="Fechar operações de leads"
              className="w-full overflow-y-auto sm:max-w-2xl"
            >
              <SheetHeader className="pr-8 text-left">
                <SheetTitle>Formulários e recuperação</SheetTitle>
                <SheetDescription>
                  Recebimento e operações autorizadas para a imobiliária selecionada.
                </SheetDescription>
              </SheetHeader>
              {operationsOpen && (
                <Suspense
                  fallback={
                    <p role="status" className="py-6 text-sm">
                      Carregando operações…
                    </p>
                  }
                >
                  <MetaLeadOperations key={agency} agency={agency} />
                </Suspense>
              )}
            </SheetContent>
          </Sheet>
        </div>
      </div>
      {hasFilters && (
        <div className="flex flex-wrap items-center gap-2" aria-label="Filtros de leads ativos">
          {[
            ["search", extraFilters.search, `Contato: ${extraFilters.search}`],
            [
              "campaignId",
              extraFilters.campaignId,
              `Campanha: ${campaigns.find((campaign) => campaign.id === extraFilters.campaignId)?.name ?? extraFilters.campaignId}`,
            ],
            [
              "brokerId",
              extraFilters.brokerId,
              `Responsável: ${brokers.data?.find((broker) => broker.id === extraFilters.brokerId)?.nome ?? extraFilters.brokerId}`,
            ],
            ["formId", extraFilters.formId, `Formulário: ${extraFilters.formId}`],
            ["status", status, `Situação: ${status ? LABEL[status] : ""}`],
          ]
            .filter(([, value]) => Boolean(value))
            .map(([key, , label]) => (
              <Button
                key={key}
                size="sm"
                variant="secondary"
                title={label}
                aria-label={`Remover filtro ${label}`}
                className="h-auto min-h-9 max-w-full gap-2 rounded-lg py-1.5 text-xs"
                onClick={() =>
                  key === "status"
                    ? onFiltersChange?.({ status: "", page: 1 })
                    : onExtraFiltersChange?.({ [key]: "" })
                }
              >
                <span className="max-w-64 truncate">{label}</span>
                <X className="size-3" />
              </Button>
            ))}
          <Button variant="ghost" size="sm" className="min-h-9 text-xs" onClick={clearFilters}>
            Limpar filtros de leads
          </Button>
        </div>
      )}
    </>
  );
  return (
    <section className="space-y-4" aria-label="Caixa de entrada de leads Meta">
      {toolbarTarget ? createPortal(toolbar, toolbarTarget, "marketing-leads-toolbar") : toolbar}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">
          Contatos recebidos{query.data ? ` · ${query.data.total}` : ""}
        </h2>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-9"
              aria-label="Sobre as contagens de leads"
            >
              <Info className="size-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="text-xs leading-relaxed">
            Leads reportados pela plataforma, submissões recebidas e atendimentos únicos têm
            contagens próprias. Esta caixa mostra os contatos recebidos no período selecionado.
          </PopoverContent>
        </Popover>
      </div>
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
          <h3 className="mt-3 text-sm font-semibold">Nenhum lead neste período</h3>
          {hasFilters && (
            <Button variant="ghost" className="mt-2" onClick={clearFilters}>
              Limpar filtros de leads
            </Button>
          )}
        </div>
      ) : (
        <div className="divide-y overflow-hidden rounded-xl bg-card ring-1 ring-border/60">
          {query.data.items.map((lead) => (
            <article key={lead.id} className="p-4">
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
                    {agency === "todas" && `${lead.imobiliaria || "Marca a revisar"} · `}
                    {new Date(lead.received_at).toLocaleString("pt-BR", {
                      timeZone: "America/Sao_Paulo",
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
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
                    <MarketingSearchSelect
                      label={`Corretor para ${lead.full_name || "lead sem nome"}`}
                      value={brokerByLead[lead.id] ?? ""}
                      onValueChange={(brokerId) =>
                        setBrokerByLead((old) => ({ ...old, [lead.id]: brokerId }))
                      }
                      options={[
                        { value: "", label: "Selecionar corretor da marca" },
                        ...(brokers.data
                          ?.filter((broker) => brokerCanServeAgency(broker, lead.imobiliaria))
                          .map((broker) => ({ value: broker.id, label: broker.nome })) ?? []),
                      ]}
                      className="w-full sm:max-w-xs"
                    />
                    <Button
                      className="h-11 rounded-xl sm:h-10"
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
                    className="h-11 rounded-xl sm:h-10"
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
                      <Input
                        type="url"
                        required
                        className="mt-1 h-11 w-full rounded-xl bg-background px-3 text-sm font-normal sm:h-10"
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
                      className="h-11 self-end rounded-xl sm:h-10"
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
    <details className="mt-2" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="inline-flex min-h-9 cursor-pointer items-center text-xs font-medium text-primary">
        Detalhes e histórico
      </summary>
      {query.isLoading ? (
        <p className="mt-2 text-xs text-foreground/65">Carregando submissão…</p>
      ) : query.isError ? (
        <p className="mt-2 text-xs text-red-800">Não foi possível abrir esta submissão.</p>
      ) : (
        <>
          {query.data?.is_synthetic && <SyntheticLeadBadge />}
          <p className="mt-2 break-words text-xs text-foreground/65">
            Formulário: {query.data?.form_id || "não informado"} · Campanha Meta:{" "}
            {query.data?.external_campaign_id || "não informada"} · Anúncio:{" "}
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

function SyntheticLeadBadge() {
  return (
    <span className="mb-2 inline-flex rounded-md border border-amber-700/30 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-950">
      TESTE SINTÉTICO
    </span>
  );
}
