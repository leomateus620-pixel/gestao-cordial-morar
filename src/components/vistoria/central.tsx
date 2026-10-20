import { EmptyState } from "@/components/shared/empty-state";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { canSeeAllInspections } from "@/lib/access-control";
import { useSession } from "@/lib/auth-mock";
import { cn } from "@/lib/utils";
import { countPending } from "@/lib/vistoria/local-store";
import {
  INSPECTION_KINDS,
  INSPECTION_STATUSES,
  KIND_LABEL,
  STATUS_LABEL,
  type InspectionKind,
  type InspectionStatus,
} from "@/lib/vistoria/model";
import { STATUS_TONE } from "@/lib/vistoria/ui";
import { listInspectionResponsibles, listInspections } from "@/lib/vistoria/vistoria.functions";
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
    sessionStorage.setItem(storageKey, JSON.stringify(filters));
  }, [filters, storageKey]);
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
  const resume = data?.continueInspection;
  const localPhotos = useQuery({
    queryKey: ["inspection-local-photos", userId, resume?.id],
    queryFn: () => countPending(userId, resume!.id, "photo"),
    enabled: Boolean(resume),
  });
  const field = "min-h-11 w-full rounded-xl border border-input bg-background px-3 text-base";
  const card = (r: NonNullable<typeof data>["rows"][number], continuing = false) => {
    const cad = r.property_snapshot?.cadastro ?? {};
    return (
      <Link
        to="/vistorias/$vistoriaId"
        params={{ vistoriaId: r.id }}
        className={cn(
          "block rounded-2xl border p-4",
          continuing ? "border-primary/35 bg-primary/5" : "border-border bg-card",
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-semibold text-foreground/60">
            Nº {r.numero} · {KIND_LABEL[r.kind as InspectionKind]}
          </span>
          <span
            className={cn(
              "rounded-full px-2 py-1 font-semibold",
              STATUS_TONE[r.status as InspectionStatus],
            )}
          >
            {STATUS_LABEL[r.status as InspectionStatus]}
          </span>
        </div>
        <p className="mt-2 text-base font-semibold leading-snug">
          {r.property_snapshot?.endereco || "Endereço não informado"}
        </p>
        <p className="mt-1 text-sm text-foreground/60">
          {cad.tipo || "Tipo não informado"} ·{" "}
          {[
            cad.codigo_cordial && `Cordial ${cad.codigo_cordial}`,
            cad.codigo_morar && `Morar ${cad.codigo_morar}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <p className="mt-2 text-xs text-foreground/60">
          {r.responsible_name || "Responsável não informado"} ·{" "}
          {new Date(r.inspected_at ?? r.created_at).toLocaleDateString("pt-BR")}
        </p>
        {continuing && resume && (
          <p className="mt-2 text-sm">
            {resume.last_room ? `Último registro em ${resume.last_room}` : "Ambientes"} ·{" "}
            {resume.pending_items} itens pendentes ·{" "}
            {localPhotos.isPending
              ? "…"
              : localPhotos.error
                ? "Fila indisponível"
                : localPhotos.data}{" "}
            fotos aguardando envio neste aparelho
            {resume.pending_media
              ? ` · ${resume.pending_media} aguardando confirmação no servidor`
              : ""}
          </p>
        )}
        <div className="mt-3 flex min-h-11 items-center justify-between gap-2 border-t border-border pt-2 text-sm font-semibold text-primary">
          <span>
            {r.status === "concluida"
              ? `Abrir laudo v${r.current_version}`
              : r.status === "em_revisao"
                ? "Revisar vistoria"
                : "Continuar vistoria"}
          </span>
          <ArrowRight className="size-4" />
        </div>
        {continuing && (
          <p className="text-xs text-foreground/60">
            Última alteração:{" "}
            {new Date(r.updated_at).toLocaleString("pt-BR", {
              dateStyle: "short",
              timeStyle: "short",
            })}
          </p>
        )}
      </Link>
    );
  };
  return (
    <div className="inspection-workspace mx-auto w-full max-w-3xl pt-2">
      <Link to="/" className="inline-flex min-h-11 items-center gap-2 text-sm text-primary">
        <ArrowLeft className="size-4" />
        Voltar ao sistema
      </Link>
      <header className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Vistorias</h1>
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
      {resume && (
        <section aria-label="Continuar vistoria" className="mb-4">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-primary">
            Continuar de onde parou
          </h2>
          {card(resume, true)}
        </section>
      )}
      <div className="mb-3 flex items-center gap-2">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Buscar por código ou endereço</span>
          <Search className="absolute left-3 top-3.5 size-4 text-foreground/60" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Código ou endereço"
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
      <p className="mb-1 text-xs text-foreground/60">
        Contagens do escopo e filtros acima, antes do filtro de status
      </p>
      <div className="mb-4 flex flex-wrap gap-x-3 gap-y-1" aria-label="Filtrar por status">
        {INSPECTION_STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            aria-pressed={filters.status === status}
            onClick={() =>
              setFilters((f) => ({ ...f, status: f.status === status ? "" : status, page: 0 }))
            }
            className={cn(
              "min-h-11 border-b-2 text-sm",
              filters.status === status
                ? "border-primary font-bold text-primary"
                : "border-transparent text-foreground/60",
            )}
          >
            {STATUS_LABEL[status]}{" "}
            <span className="tabular-nums">
              {query.isPending ? "…" : (data?.byStatus[status] ?? "—")}
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
                  setFilters({ ...editing, page: 0 });
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
        <>
          <h2 className="mb-2 text-sm font-semibold">
            {hasFilters ? "Resultados" : "Todas as vistorias"} · {data.total}
          </h2>
          <ul className="space-y-3">
            {data.rows.map((r) => (
              <li key={r.id}>{card(r)}</li>
            ))}
          </ul>
        </>
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
