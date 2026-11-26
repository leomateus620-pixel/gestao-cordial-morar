import { EmptyState } from "@/components/shared/empty-state";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { canSeeAllInspections } from "@/lib/access-control";
import { useSession } from "@/lib/auth-mock";
import { cn } from "@/lib/utils";
import { countPending } from "@/lib/vistoria/local-store";
import {
  INSPECTION_KINDS,
  KIND_LABEL,
  type InspectionKind,
  type InspectionStatus,
} from "@/lib/vistoria/model";
import { inspectionPropertyCodes } from "@/lib/vistoria/ui";
import {
  listInspectionResponsibles,
  listInspections,
  type InspectionListRow,
} from "@/lib/vistoria/vistoria.functions";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  ArrowRight,
  ClipboardCheck,
  Plus,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useEffect, useState } from "react";

type Filters = {
  q: string;
  status: InspectionStatus | "";
  kind: InspectionKind | "";
  agency: "" | "cordial" | "morar";
  from: string;
  to: string;
  dateField: "inspected_at" | "created_at";
  responsibleId: string;
  page: number;
};
const initialFilters: Filters = {
  q: "",
  status: "",
  kind: "",
  agency: "",
  from: "",
  to: "",
  dateField: "inspected_at",
  responsibleId: "",
  page: 0,
};
const GROUPS: Array<{ status: InspectionStatus; label: string }> = [
  { status: "em_andamento", label: "Em andamento" },
  { status: "em_revisao", label: "Em revisão" },
  { status: "rascunho", label: "Rascunhos" },
  { status: "concluida", label: "Concluídas" },
];
type Resume = InspectionListRow & {
  last_room: string | null;
  pending_items: number;
  pending_media: number;
};
const formatDate = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeZone: "America/Sao_Paulo",
});

function InspectionCard({
  row,
  resume,
  localPhotos,
}: {
  row: InspectionListRow;
  resume?: Resume;
  localPhotos: number;
}) {
  const codes = inspectionPropertyCodes(row.property_snapshot?.cadastro);
  const date = row.inspected_at ?? row.created_at;
  const action =
    row.status === "concluida"
      ? row.rental_contract_id
        ? "Ver termo"
        : "Ver laudo"
      : row.status === "em_revisao"
        ? "Revisar"
        : resume?.last_room
          ? `Continuar · ${resume.last_room}`
          : row.status === "rascunho"
            ? "Retomar rascunho"
            : "Continuar vistoria";
  const pending = [
    resume?.pending_items
      ? `${resume.pending_items} ${resume.pending_items === 1 ? "item pendente" : "itens pendentes"}`
      : "",
    localPhotos
      ? `${localPhotos} ${localPhotos === 1 ? "foto aguardando envio" : "fotos aguardando envio"} neste aparelho`
      : "",
    resume?.pending_media
      ? `${resume.pending_media} ${resume.pending_media === 1 ? "foto aguardando confirmação" : "fotos aguardando confirmação"}`
      : "",
  ].filter(Boolean);
  return (
    <article
      className={cn(
        "grid min-w-0 gap-2 rounded-2xl border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_minmax(9rem,15rem)] sm:items-center sm:gap-x-6 sm:p-5",
        resume ? "border-primary/45" : "border-border",
      )}
    >
      <div className="min-w-0 space-y-1.5">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-foreground/70">
          <span className="font-semibold text-primary">
            Nº {row.numero} · {KIND_LABEL[row.kind as InspectionKind]}
          </span>
          {codes && <span className="break-words">{codes}</span>}
        </p>
        <h3 className="break-words text-base font-semibold leading-snug sm:text-lg">
          {row.property_snapshot?.endereco || "Endereço não informado"}
        </h3>
        <p className="flex flex-wrap gap-x-2 text-sm text-foreground/60">
          <span>{row.agency === "morar" ? "Morar" : "Cordial"}</span>
          {row.responsible_name && <span>· {row.responsible_name}</span>}
          <time dateTime={date}>· {formatDate.format(new Date(date))}</time>
        </p>
        {pending.length > 0 && (
          <p className="text-sm font-medium text-foreground/80">{pending.join(" · ")}</p>
        )}
      </div>
      <Link
        to="/vistorias/$vistoriaId"
        params={{ vistoriaId: row.id }}
        search={{
          central: true,
          comodo: resume?.last_room ?? undefined,
          revisao: row.status === "em_revisao" ? true : undefined,
        }}
        aria-label={`${action}, vistoria número ${row.numero}`}
        className="inline-flex min-h-11 w-fit max-w-full items-center gap-2 rounded-xl px-3 text-sm font-semibold text-primary hover:bg-primary/10 sm:justify-self-end"
      >
        <span className="min-w-0 break-words">{action}</span>
        <ArrowRight className="size-4 shrink-0" aria-hidden />
      </Link>
    </article>
  );
}

export function InspectionCentral() {
  const user = useSession();
  return user ? <InspectionList key={user.id} userId={user.id} /> : null;
}
function InspectionList({ userId }: { userId: string }) {
  const session = useSession(),
    list = useServerFn(listInspections),
    responsiblesFn = useServerFn(listInspectionResponsibles);
  const storageKey = `vistoria-list:${userId}`;
  const [filters, setFilters] = useState<Filters>(() => {
    try {
      return { ...initialFilters, ...JSON.parse(sessionStorage.getItem(storageKey) || "{}") };
    } catch {
      return initialFilters;
    }
  });
  const [q, setQ] = useState(filters.q),
    [open, setOpen] = useState(false),
    [editing, setEditing] = useState(filters);
  useEffect(() => {
    const timer = setTimeout(
      () => setFilters((f) => (f.q === q.trim() ? f : { ...f, q: q.trim(), page: 0 })),
      300,
    );
    return () => clearTimeout(timer);
  }, [q]);
  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({ ...filters, q }));
    } catch {
      // Filtros seguem disponíveis nesta visita.
    }
  }, [filters, q, storageKey]);
  const responsibles = useQuery({
    queryKey: ["inspection-responsibles", userId],
    queryFn: () => responsiblesFn(),
    enabled: canSeeAllInspections(session),
  });
  const query = useQuery({
    queryKey: ["inspections", userId, filters],
    queryFn: () =>
      list({
        data: {
          q: filters.q || undefined,
          status: filters.status || undefined,
          kind: filters.kind || undefined,
          agency: filters.agency || undefined,
          from: filters.from || undefined,
          to: filters.to || undefined,
          dateField: filters.dateField,
          responsibleId: filters.responsibleId || undefined,
          page: filters.page,
        },
      }),
  });
  const data = query.data,
    active = [filters.kind, filters.agency, filters.from, filters.to, filters.responsibleId].filter(
      Boolean,
    ).length;
  const hasFilters = Boolean(active || filters.status || filters.q);
  const resume = filters.page === 0 ? data?.continueInspection : null;
  const localPhotos = useQuery({
    queryKey: ["inspection-local-photos", userId, resume?.id],
    queryFn: () => countPending(userId, resume!.id, "photo"),
    enabled: Boolean(resume),
  });
  const field = "min-h-11 w-full rounded-xl border border-input bg-background px-3 text-base";
  const rows = data?.rows ?? [];
  const ordered = resume ? [resume, ...rows.filter((row) => row.id !== resume.id)] : rows;
  return (
    <div className="inspection-workspace mx-auto w-full max-w-5xl pb-8 pt-2">
      <Link to="/" className="inline-flex min-h-11 items-center gap-2 text-sm text-primary">
        <ArrowLeft className="size-4" />
        Voltar ao sistema
      </Link>
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Vistorias</h1>
          <p className="text-sm text-foreground/60">
            {canSeeAllInspections(session) ? "Vistorias da equipe" : "Seu trabalho em campo"}
          </p>
        </div>
        <Link
          to="/vistorias/nova"
          className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground"
        >
          <Plus className="size-4" />
          Nova vistoria
        </Link>
      </header>
      <div className="mb-3 flex items-center gap-2">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Buscar por código ou endereço</span>
          <Search className="absolute left-3 top-3.5 size-4 text-foreground/60" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Código ou endereço"
            maxLength={80}
            className="h-11 pl-9"
          />
        </label>
        <button
          type="button"
          onClick={() => {
            setEditing(filters);
            setOpen(true);
          }}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-input px-3 text-sm font-semibold"
        >
          <SlidersHorizontal className="size-4" />
          Filtros{active > 0 ? ` (${active})` : ""}
        </button>
      </div>
      <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Filtrar por status">
        {[{ status: "" as const, label: "Todas" }, ...GROUPS].map(({ status, label }) => (
          <button
            key={status}
            type="button"
            aria-pressed={filters.status === status}
            onClick={() => setFilters((f) => ({ ...f, status, page: 0 }))}
            className={cn(
              "min-h-11 rounded-xl border px-3 text-sm font-medium",
              filters.status === status
                ? "border-primary bg-primary/10 font-semibold text-primary"
                : "border-border bg-card text-foreground/70",
            )}
          >
            {label}{" "}
            <span className="ml-0.5 tabular-nums">
              {data ? (status ? (data.byStatus[status] ?? 0) : data.scopeTotal) : "…"}
            </span>
          </button>
        ))}
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="inspection-workspace mx-auto max-h-[90dvh] max-w-2xl overflow-auto rounded-t-2xl p-5"
        >
          <SheetTitle>Filtros da vistoria</SheetTitle>
          <SheetDescription>Aplicados à lista, à continuação e às contagens.</SheetDescription>
          <div className="mt-4 space-y-3">
            <label className="block text-sm">
              Imobiliária do laudo
              <select
                className={field}
                value={editing.agency}
                onChange={(e) =>
                  setEditing({ ...editing, agency: e.target.value as Filters["agency"] })
                }
              >
                <option value="">Todas</option>
                <option value="cordial">Cordial</option>
                <option value="morar">Morar</option>
              </select>
            </label>
            <label className="block text-sm">
              Tipo
              <select
                className={field}
                value={editing.kind}
                onChange={(e) =>
                  setEditing({ ...editing, kind: e.target.value as Filters["kind"] })
                }
              >
                <option value="">Todos os tipos</option>
                {INSPECTION_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Período por
              <select
                className={field}
                value={editing.dateField}
                onChange={(e) =>
                  setEditing({ ...editing, dateField: e.target.value as Filters["dateField"] })
                }
              >
                <option value="inspected_at">Data da vistoria</option>
                <option value="created_at">Data de criação</option>
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm">
                De
                <Input
                  type="date"
                  value={editing.from}
                  onChange={(e) => setEditing({ ...editing, from: e.target.value })}
                />
              </label>
              <label className="text-sm">
                Até
                <Input
                  type="date"
                  value={editing.to}
                  onChange={(e) => setEditing({ ...editing, to: e.target.value })}
                />
              </label>
            </div>
            {responsibles.data?.canChoose && (
              <label className="block text-sm">
                Responsável
                <select
                  className={field}
                  value={editing.responsibleId}
                  onChange={(e) => setEditing({ ...editing, responsibleId: e.target.value })}
                >
                  <option value="">Toda a equipe</option>
                  {responsibles.data.options.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {editing.from && editing.to && editing.from > editing.to && (
              <p role="alert" className="text-destructive">
                A data final precisa ser igual ou posterior à inicial.
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                className="min-h-11 flex-1 rounded-xl border"
                onClick={() => setEditing({ ...initialFilters, q: filters.q })}
              >
                Limpar filtros
              </button>
              <button
                type="button"
                disabled={Boolean(editing.from && editing.to && editing.from > editing.to)}
                className="min-h-11 flex-1 rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-50"
                onClick={() => {
                  setFilters({ ...editing, q: q.trim(), page: 0 });
                  setOpen(false);
                }}
              >
                Aplicar e fechar
              </button>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="min-h-11 w-full text-sm"
            >
              Fechar sem aplicar
            </button>
          </div>
        </SheetContent>
      </Sheet>
      {query.isPending ? (
        <p role="status" className="py-8 text-center">
          Carregando vistorias…
        </p>
      ) : query.error ? (
        <div role="alert">
          <EmptyState
            title="Não foi possível carregar"
            description={(query.error as Error).message}
          />
          <button
            type="button"
            className="min-h-11 text-primary"
            onClick={() => void query.refetch()}
          >
            Tentar novamente
          </button>
        </div>
      ) : !data?.rows.length ? (
        <EmptyState
          icon={<ClipboardCheck className="size-5" />}
          title={
            hasFilters ? "Nenhum resultado para estes filtros" : "Você ainda não tem vistorias"
          }
          description={
            hasFilters
              ? "Ajuste ou limpe os filtros para procurar novamente."
              : "Selecione Nova vistoria para começar pelo imóvel."
          }
        />
      ) : (
        <div className="space-y-6">
          {GROUPS.map(({ status, label }) => {
            const group = ordered.filter((row) => row.status === status);
            if (!group.length) return null;
            return (
              <section key={status} aria-labelledby={`vistorias-${status}`}>
                <h2 id={`vistorias-${status}`} className="mb-2 text-base font-semibold">
                  {label}
                </h2>
                <ul className="space-y-2">
                  {group.map((row) => (
                    <li key={row.id}>
                      <InspectionCard
                        row={row}
                        resume={row.id === resume?.id ? resume : undefined}
                        localPhotos={row.id === resume?.id ? (localPhotos.data ?? 0) : 0}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      {data && data.total > data.pageSize && (
        <nav aria-label="Paginação" className="mt-4 flex items-center justify-between">
          <button
            className="min-h-11 px-2 disabled:opacity-40"
            type="button"
            disabled={!filters.page}
            onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
          >
            Anterior
          </button>
          <span className="text-sm">
            {filters.page + 1} / {Math.ceil(data.total / data.pageSize)}
          </span>
          <button
            className="min-h-11 px-2 disabled:opacity-40"
            type="button"
            disabled={(filters.page + 1) * data.pageSize >= data.total}
            onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
          >
            Próxima
          </button>
        </nav>
      )}
    </div>
  );
}
