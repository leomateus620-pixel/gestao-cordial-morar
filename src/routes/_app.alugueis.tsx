import { createFileRoute, type SearchSchemaInput } from "@tanstack/react-router";
import { RequireModuleAccess } from "@/components/auth/RequireModuleAccess";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getRentalWorkspaceDraft } from "@/lib/rentals/rentals.functions";
import { Button } from "@/components/ui/button";
import { CalendarClock, CheckCircle2, Plus, Wallet } from "lucide-react";
import { useRentals } from "@/hooks/useRentals";
import { RentalKpiCards } from "@/components/alugueis/RentalKpiCards";
import { RentalFilters } from "@/components/alugueis/RentalFilters";
import { RentalCard } from "@/components/alugueis/RentalCard";
import { RentalExpandedDetails } from "@/components/alugueis/RentalExpandedDetails";
import { RentalFormModal } from "@/components/alugueis/RentalFormModal";
import { RentalSkeleton } from "@/components/alugueis/RentalSkeleton";
import { EmptyRentalState } from "@/components/alugueis/EmptyRentalState";
import type { RentalContractFull, RentalFilter, RentalPeriodFilter } from "@/types/rental";
import { useSession } from "@/lib/auth-mock";
import { canSeeFinancialInsights } from "@/lib/access-control";
import { brl } from "@/lib/format";
import { useRegisterPageSearch } from "@/lib/page-search";
import { useRentalFormRequest } from "@/lib/rentals/rental-form-ui";

export const Route = createFileRoute("/_app/alugueis")({
  head: () => ({
    meta: [
      { title: "Aluguéis e Emissões — Gestão Cordial/Morar" },
      {
        name: "description",
        content: "Contratos de aluguel, recibos e histórico de emissões do Gestão Cordial/Morar.",
      },
      { property: "og:title", content: "Aluguéis e Emissões — Gestão Cordial/Morar" },
      { property: "og:description", content: "Contratos, recibos e notas de cada aluguel." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  validateSearch: (
    search: {
      id?: unknown;
      formulario?: unknown;
      etapa?: unknown;
      corretorId?: unknown;
      periodo?: unknown;
      imobiliaria?: unknown;
      status?: unknown;
    } & SearchSchemaInput,
  ) => ({
    id: typeof search.id === "string" ? search.id : undefined,
    formulario: parseBrokerId(search.formulario),
    etapa: search.etapa === "vistorias" ? ("vistorias" as const) : undefined,
    corretorId: parseBrokerId(search.corretorId),
    periodo: parseOperationalPeriod(search.periodo),
    imobiliaria: parseAgency(search.imobiliaria),
    status: parseRentalStatus(search.status),
  }),
  component: GuardedPage,
});

function GuardedPage() {
  return (
    <RequireModuleAccess module="alugueis">
      <Page />
    </RequireModuleAccess>
  );
}

function Page() {
  const {
    id: highlightedId,
    formulario,
    etapa,
    corretorId,
    periodo,
    imobiliaria,
    status,
  } = Route.useSearch();
  const navigate = Route.useNavigate();
  const r = useRentals({
    initialFilter: status,
    corretorId,
    periodo,
    imobiliaria,
  });
  useRegisterPageSearch({
    placeholder: "Buscar inquilino, proprietário, fiador ou imóvel…",
    value: r.search,
    onChange: r.setSearch,
  });
  const session = useSession();
  const canViewFinancialInsights = canSeeFinancialInsights(session);
  const [freshFormId, setFreshFormId] = useState<string>();
  const [editing, setEditing] = useState<{ contract: RentalContractFull; field?: string } | null>(
    null,
  );
  const loadDraft = useServerFn(getRentalWorkspaceDraft);
  const resumed = r.allContracts.find((contract) => contract.id === formulario);
  const draft = useQuery({
    queryKey: ["rentals", "workspace-draft", formulario, session?.id],
    queryFn: () => loadDraft({ data: { id: formulario! } }),
    enabled: !!formulario && !resumed,
  });
  const [selectedId, setSelectedId] = useState<string | null>(highlightedId ?? null);
  const selected = r.allContracts.find((contract) => contract.id === selectedId) ?? null;
  const newContractRequested = useRentalFormRequest((state) => state.requested);

  function openNew(id?: string) {
    const nextId = id ?? crypto.randomUUID();
    setFreshFormId(id ? undefined : nextId);
    setEditing(null);
    setSelectedId(null);
    void navigate({ search: { formulario: nextId, corretorId, periodo, imobiliaria, status } });
  }

  useEffect(() => {
    if (!newContractRequested) return;
    useRentalFormRequest.getState().consume();
    openNew();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newContractRequested]);

  useEffect(() => {
    setSelectedId(highlightedId ?? null);
  }, [highlightedId]);

  function selectContract(id: string) {
    setSelectedId(id);
    void navigate({
      to: ".",
      search: { id, corretorId, periodo, imobiliaria, status },
    });
  }

  function clearSelection() {
    setSelectedId(null);
    if (highlightedId) {
      void navigate({
        to: ".",
        search: { corretorId, periodo, imobiliaria, status },
        replace: true,
      });
    }
  }

  const k = r.kpis;

  return (
    <>
      <header
        className={
          "relative mb-4 overflow-hidden rounded-[1.75rem] border border-white/70 " +
          "bg-white/65 px-5 py-5 backdrop-blur-xl sm:px-7 sm:py-6 " +
          "shadow-[0_28px_60px_-40px_rgba(23,60,80,0.55),inset_0_1px_0_rgba(255,255,255,0.75)] " +
          "animate-in fade-in slide-in-from-top-1 duration-500"
        }
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-[radial-gradient(circle_at_center,rgba(23,77,97,0.28),transparent_65%)]"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -left-16 bottom-[-40%] size-56 rounded-full bg-[radial-gradient(circle_at_center,rgba(217,120,45,0.14),transparent_70%)]"
        />

        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-6 items-center rounded-full border border-[#174d61]/20 bg-[#174d61]/10 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#174d61]">
                Módulo
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-foreground/50">
                Locação
              </span>
            </div>
            <h1 className="mt-2 text-3xl font-extrabold leading-none tracking-[-0.04em] text-foreground sm:text-[2.15rem]">
              Aluguéis
            </h1>
            <p className="mt-1.5 max-w-md text-[12px] leading-snug text-foreground/62">
              Controle real de contratos, locatários e pagamentos.
            </p>

            {k && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200/70 bg-emerald-50/80 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                  <CheckCircle2 className="size-3" strokeWidth={2.4} />
                  {k.contratosAtivos} ativos
                </span>
                {canViewFinancialInsights && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-[#174d61]/20 bg-[#174d61]/8 px-2.5 py-1 text-[11px] font-semibold text-[#174d61]">
                    <Wallet className="size-3" strokeWidth={2.4} />
                    {brl(k.receitaMensalAtiva, { compact: true })} / mês
                  </span>
                )}
                {k.vencendoEm30 > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-200/80 bg-amber-50/80 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                    <CalendarClock className="size-3" strokeWidth={2.4} />
                    {k.vencendoEm30} vencendo em 30d
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex shrink-0 sm:justify-end">
            <button
              onClick={() => openNew()}
              className={
                "group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white " +
                "bg-gradient-to-br from-[#1f6a80] via-[#174d61] to-[#0f3a4a] " +
                "shadow-[0_18px_36px_-14px_rgba(23,77,97,0.65),inset_0_1px_0_rgba(255,255,255,0.25)] " +
                "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_42px_-14px_rgba(23,77,97,0.75)] active:translate-y-0 active:scale-[0.98]"
              }
            >
              <span className="grid size-5 place-items-center rounded-full bg-white/18 transition-transform duration-200 group-hover:rotate-90">
                <Plus className="size-3.5" strokeWidth={2.6} />
              </span>
              Novo aluguel
            </button>
          </div>
        </div>
      </header>

      <section className="mb-4">
        <RentalKpiCards kpis={r.kpis} canViewFinancialInsights={canViewFinancialInsights} />
      </section>

      {r.drafts.length > 0 && (
        <section className="mb-4 rounded-2xl border bg-card p-4" aria-label="Rascunhos de aluguel">
          <h2 className="mb-2 text-sm font-semibold">Rascunhos</h2>
          <ul className="flex flex-wrap gap-2">
            {r.drafts
              .filter(
                (item) =>
                  !imobiliaria ||
                  imobiliaria === "todas" ||
                  item.brand === "ambas" ||
                  item.brand === imobiliaria,
              )
              .map((item) => (
                <li key={item.id}>
                  <Button variant="outline" onClick={() => openNew(item.id)} className="min-h-11">
                    Retomar{" "}
                    {item.name || (item.brand === "morar" ? "aluguel Morar" : "aluguel Cordial")}
                  </Button>
                </li>
              ))}
          </ul>
        </section>
      )}
      {r.isDraftsError && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          Não foi possível carregar os rascunhos.
        </p>
      )}

      <section className="mb-4">
        <RentalFilters
          filter={r.filter}
          onFilterChange={r.setFilter}
          search={r.search}
          onSearchChange={r.setSearch}
        />
      </section>

      <section>
        {r.isLoading ? (
          <RentalSkeleton />
        ) : r.isError ? (
          <div className="glass-panel rounded-3xl p-6 text-center text-xs text-rose-700">
            Erro ao carregar aluguéis. Tente novamente.
          </div>
        ) : r.allContracts.length === 0 ? (
          <EmptyRentalState onCreate={() => openNew()} />
        ) : r.contracts.length === 0 ? (
          <div className="glass-panel rounded-3xl p-6 text-center text-xs text-foreground/60">
            Nenhum contrato encontrado para este filtro.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {r.contracts.map((c) => (
              <RentalCard key={c.id} contract={c} onClick={() => selectContract(c.id)} />
            ))}
          </div>
        )}
      </section>

      {formulario && draft.isError && !resumed && (
        <p className="my-3 text-sm text-destructive" role="alert">
          Não foi possível retomar o rascunho.{" "}
          <Button variant="link" onClick={() => draft.refetch()}>
            Tentar novamente
          </Button>
        </p>
      )}
      {formulario &&
        formulario !== freshFormId &&
        !r.isLoading &&
        draft.isSuccess &&
        !resumed &&
        !draft.data && (
          <p role="alert" className="my-3 text-sm text-destructive">
            Aluguel não encontrado ou fora do seu escopo.
          </p>
        )}
      {(editing || (formulario && (resumed || draft.data || formulario === freshFormId))) && (
        <RentalFormModal
          key={editing?.contract.id ?? formulario}
          open
          onOpenChange={(open) => {
            if (open) return;
            if (editing) {
              const id = editing.contract.id;
              setEditing(null);
              if (editing.field)
                void navigate({
                  search: { id, etapa: "vistorias", corretorId, periodo, imobiliaria, status },
                });
            }
            if (formulario) {
              setFreshFormId(undefined);
              void navigate({
                search: { corretorId, periodo, imobiliaria, status },
                replace: true,
              });
            }
          }}
          workspaceId={editing?.contract.id ?? formulario!}
          resumeForm={!editing}
          focusField={editing?.field}
          returnToInspections={etapa === "vistorias"}
          properties={r.properties}
          tenants={r.tenants}
          onSubmit={r.saveRental}
          onSaveDraft={r.saveDraft}
          onConfirmed={async () => {
            await r.refreshContracts();
            if (formulario) await draft.refetch();
          }}
          isSaving={r.isSaving}
          initial={editing?.contract ?? resumed ?? null}
          draft={draft.data}
        />
      )}

      <RentalExpandedDetails
        contract={selected}
        open={!editing && selectedId !== null && selected !== null}
        returnToInspections={etapa === "vistorias"}
        onContractConfirmed={async () => {
          await r.refreshContracts();
        }}
        onOpenChange={(o) => !o && clearSelection()}
        onEdit={(contract, field) => {
          if (!field) clearSelection();
          setEditing({ contract, field });
        }}
        onClose={async (id) => {
          await r.closeRental(id);
          clearSelection();
        }}
        onRenew={async (id) => {
          if (!selected) return;
          const d = new Date(selected.dataFim);
          d.setFullYear(d.getFullYear() + 1);
          await r.renewRental(id, d.toISOString().slice(0, 10));
          clearSelection();
        }}
        onMarkPaid={async (id) => {
          await r.markPaid(id);
        }}
        onDelete={async (id) => {
          if (!window.confirm("Excluir este contrato? Esta ação não pode ser desfeita.")) return;
          await r.deleteRental(id);
          clearSelection();
        }}
      />
    </>
  );
}

const BROKER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const rentalPeriods = new Set<RentalPeriodFilter>(["mes", "ultimos_30", "trimestre", "ano"]);

function parseBrokerId(value: unknown) {
  return typeof value === "string" && BROKER_ID_PATTERN.test(value) ? value : undefined;
}

function parseOperationalPeriod(value: unknown): RentalPeriodFilter | undefined {
  return typeof value === "string" && rentalPeriods.has(value as RentalPeriodFilter)
    ? (value as RentalPeriodFilter)
    : undefined;
}

function parseAgency(value: unknown): "todas" | "cordial" | "morar" | undefined {
  return value === "todas" || value === "cordial" || value === "morar" ? value : undefined;
}

function parseRentalStatus(value: unknown): RentalFilter | undefined {
  if (value === "ativo" || value === "ativos") return "ativos";
  if (value === "pendente_assinatura" || value === "pendentes") return "pendentes";
  if (value === "vencido" || value === "vencidos") return "vencidos";
  if (value === "encerrado" || value === "cancelado" || value === "encerrados") return "encerrados";
  if (value === "atrasado" || value === "atrasados") return "atrasados";
  return undefined;
}
