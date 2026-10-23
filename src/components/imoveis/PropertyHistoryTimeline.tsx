import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Archive, Building2, ChevronDown, Code2, FileText, Globe, Home, Image as ImageIcon, KeyRound,
  Loader2, Lock, MapPin, ShieldCheck, Tag, UserRound, Video, type LucideIcon,
} from "lucide-react";
import { listPropertyHistory, type PropertyHistoryEvent } from "@/lib/imoveis/history.functions";
import {
  HISTORY_CATEGORY_LABEL, describeHistoryChange, formatHistoryDate,
} from "@/lib/imoveis/history-labels";
import { cn } from "@/lib/utils";

const ICON: Record<string, LucideIcon> = {
  criacao: Home, caracteristicas: Building2, valores: Tag, endereco: MapPin, descricao: FileText,
  operacao: KeyRound, documentacao: ShieldCheck, codigos: Code2, publicacao: Globe, corretor: UserRound,
  dados_privados: Lock, arquivamento: Archive, fotos: ImageIcon, videos: Video,
};

/** Data em que o histórico começou a ser registrado. */
const HISTORY_START = "23/10/2026";

function EventRow({ event, last }: { event: PropertyHistoryEvent; last: boolean }) {
  const [open, setOpen] = useState(false);
  const Icon = ICON[event.category] ?? FileText;
  const hasDetail = event.changes.length > 0 || event.privateHidden;
  return (
    <li className="relative flex gap-3">
      {!last && <span className="absolute left-4 top-9 h-[calc(100%-1.25rem)] w-px bg-border" />}
      <span className="relative z-10 grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1 pb-4">
        <button
          type="button"
          disabled={!hasDetail}
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-start justify-between gap-2 text-left"
          aria-expanded={open}
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold">{event.title}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{formatHistoryDate(event.createdAt)}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-foreground/70">
                por {event.actorName}
              </span>
            </div>
          </div>
          {hasDetail && (
            <ChevronDown className={cn("mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
          )}
        </button>
        {open && (
          <ul className="mt-2 space-y-1 rounded-xl bg-muted/60 p-3 text-xs text-foreground/80">
            {event.privateHidden && event.category === "dados_privados" && (
              <li>Dados privados alterados (valores visíveis só para administração e secretaria).</li>
            )}
            {event.changes.map((c, i) => (
              <li key={`${c.field}-${i}`} className="break-words">{describeHistoryChange(c)}</li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

export function PropertyHistoryTimeline({ propertyId }: { propertyId: string }) {
  const list = useServerFn(listPropertyHistory);
  const [category, setCategory] = useState("");
  const query = useInfiniteQuery({
    queryKey: ["imovel-historico", propertyId, category],
    initialPageParam: null as { createdAt: string; id: string } | null,
    queryFn: ({ pageParam }) => list({ data: { propertyId, before: pageParam, category: category || null } }),
    getNextPageParam: (last) => {
      const tail = last.events[last.events.length - 1];
      return last.hasMore && tail ? { createdAt: tail.createdAt, id: tail.id } : undefined;
    },
    staleTime: 30_000,
  });
  const events = query.data?.pages.flatMap((p) => p.events) ?? [];

  return (
    <section className="rounded-3xl border border-border bg-card/70 p-5 backdrop-blur-xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Histórico</h2>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-xl border border-border bg-background px-2 py-1.5 text-xs"
          aria-label="Filtrar histórico por tipo"
        >
          <option value="">Todos os tipos</option>
          {Object.entries(HISTORY_CATEGORY_LABEL).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>
      {query.isPending ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Carregando histórico…
        </div>
      ) : query.isError ? (
        <p className="text-sm text-destructive">Não foi possível carregar o histórico.</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {category ? "Nenhuma alteração deste tipo." : `O histórico começa a partir de ${HISTORY_START}.`}
        </p>
      ) : (
        <>
          <ol>
            {events.map((e, i) => (
              <EventRow key={e.id} event={e} last={i === events.length - 1} />
            ))}
          </ol>
          {query.hasNextPage && (
            <button
              type="button"
              onClick={() => query.fetchNextPage()}
              disabled={query.isFetchingNextPage}
              className="mt-1 text-sm font-medium text-primary hover:underline"
            >
              {query.isFetchingNextPage ? "Carregando…" : "Carregar mais"}
            </button>
          )}
        </>
      )}
    </section>
  );
}
