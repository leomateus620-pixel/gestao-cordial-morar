import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ClipboardCheck, Loader2, Plus, Search } from "lucide-react";
import { RequireModuleAccess } from "@/components/auth/RequireModuleAccess";
import { EmptyState } from "@/components/shared/empty-state";
import { Input } from "@/components/ui/input";
import { useSession } from "@/lib/auth-mock";
import { canSeeAllInspections } from "@/lib/access-control";
import { INSPECTION_KINDS, INSPECTION_STATUSES, KIND_LABEL, STATUS_LABEL, type InspectionKind, type InspectionStatus } from "@/lib/vistoria/model";
import { listInspections } from "@/lib/vistoria/vistoria.functions";
import { cn } from "@/lib/utils";
import { STATUS_TONE } from "@/lib/vistoria/ui";

export const Route = createFileRoute("/_app/vistorias/")({
  head: () => ({
    meta: [
      { title: "Vistoria inteligente — Gestão Cordial" },
      { name: "description", content: "Vistorias de entrada, saída, periódicas e constatação com fotos, relatos e laudo em PDF." },
      { property: "og:title", content: "Vistoria inteligente — Gestão Cordial" },
      { property: "og:description", content: "Vistorias com fotos, relatos e laudo em PDF." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <RequireModuleAccess module="vistorias">
      <VistoriasPage />
    </RequireModuleAccess>
  ),
});


function VistoriasPage() {
  const session = useSession();
  const list = useServerFn(listInspections);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState<InspectionStatus | "">("");
  const [kind, setKind] = useState<InspectionKind | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => setPage(0), [debounced, status, kind, from, to]);

  const query = useQuery({
    queryKey: ["inspections", debounced, status, kind, from, to, page],
    queryFn: () =>
      list({
        data: {
          q: debounced || undefined,
          status: status || undefined,
          kind: kind || undefined,
          from: from || undefined,
          to: to || undefined,
          page,
        },
      }),
    placeholderData: keepPreviousData,
  });
  const data = query.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <header className="mb-4 flex items-start justify-between gap-3 pt-2">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight">Vistoria inteligente</h1>
          <p className="mt-0.5 text-sm text-foreground/55">
            {canSeeAllInspections(session) ? "Vistorias de toda a equipe" : "Suas vistorias e as atribuídas a você"}
          </p>
        </div>
        <Link
          to="/vistorias/nova"
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-2xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 active:scale-[0.98]"
        >
          <Plus className="size-4" /> Nova vistoria
        </Link>
      </header>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {INSPECTION_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(status === s ? "" : s)}
            aria-pressed={status === s}
            className={cn(
              "premium-card min-h-16 rounded-2xl p-3 text-left transition",
              status === s && "ring-2 ring-primary",
            )}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground/55">{STATUS_LABEL[s]}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{data?.byStatus[s] ?? 0}</p>
          </button>
        ))}
      </div>

      <div className="premium-card mb-4 space-y-2 rounded-2xl p-3">
        <label className="relative block">
          <span className="sr-only">Buscar por código ou endereço</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground/40" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Código Cordial/Morar ou endereço" className="h-11 pl-9" />
        </label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <select
            aria-label="Tipo de vistoria"
            value={kind}
            onChange={(e) => setKind(e.target.value as InspectionKind | "")}
            className="h-11 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Todos os tipos</option>
            {INSPECTION_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-xs text-foreground/60">
            De
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-11" />
          </label>
          <label className="flex items-center gap-2 text-xs text-foreground/60">
            Até
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-11" />
          </label>
        </div>
      </div>

      {query.isLoading ? (
        <div className="grid place-items-center py-12 text-foreground/50">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : query.error ? (
        <EmptyState title="Não foi possível carregar" description={(query.error as Error).message} />
      ) : !data?.rows.length ? (
        <EmptyState
          icon={<ClipboardCheck className="size-5" />}
          title="Nenhuma vistoria encontrada"
          description="Crie a primeira vistoria a partir de um imóvel cadastrado."
        />
      ) : (
        <ul className="space-y-2">
          {data.rows.map((r) => {
            const snap = r.property_snapshot ?? {};
            const cad = snap.cadastro ?? {};
            const codes = [cad.codigo_cordial && `C ${cad.codigo_cordial}`, cad.codigo_morar && `M ${cad.codigo_morar}`]
              .filter(Boolean)
              .join(" · ");
            return (
              <li key={r.id}>
                <Link
                  to="/vistorias/$vistoriaId"
                  params={{ vistoriaId: r.id }}
                  className="premium-card block rounded-2xl p-4 transition active:scale-[0.99]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground/55">
                        Nº {r.numero} · {KIND_LABEL[r.kind as InspectionKind]} {codes && `· ${codes}`}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-sm font-semibold">{snap.endereco || "Endereço não informado"}</p>
                      <p className="mt-1 text-xs text-foreground/55">
                        {r.responsible_name || "Responsável"} ·{" "}
                        {new Date(r.inspected_at ?? r.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                        {r.current_version > 0 && ` · laudo v${r.current_version}`}
                      </p>
                    </div>
                    <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold", STATUS_TONE[r.status as InspectionStatus])}>
                      {STATUS_LABEL[r.status as InspectionStatus]}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {data && data.total > data.pageSize && (
        <nav className="mt-4 flex items-center justify-between" aria-label="Paginação">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            className="inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-sm font-medium disabled:opacity-40"
          >
            <ChevronLeft className="size-4" /> Anterior
          </button>
          <span className="text-xs text-foreground/55">
            Página {page + 1} de {pages} · {data.total} vistorias
          </span>
          <button
            type="button"
            disabled={page + 1 >= pages}
            onClick={() => setPage((p) => p + 1)}
            className="inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-sm font-medium disabled:opacity-40"
          >
            Próxima <ChevronRight className="size-4" />
          </button>
        </nav>
      )}
    </div>
  );
}
