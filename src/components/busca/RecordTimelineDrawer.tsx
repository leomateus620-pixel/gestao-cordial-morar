import { Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useRecordTimeline } from "@/hooks/useGlobalSearch";
import type { BuscaCategoria } from "@/types/busca";
import { buscaCategoriaLabels, formatBuscaDateTime } from "@/types/busca";
import { categoriaIcons } from "./SearchResultCard";

type Target = { categoria: BuscaCategoria; id: string } | null;

type Props = {
  target: Target;
  onOpenChange: (open: boolean) => void;
};

export function RecordTimelineDrawer({ target, onOpenChange }: Props) {
  const query = useRecordTimeline(target);
  const record = query.data;
  const Icon = target ? categoriaIcons[target.categoria] : null;

  return (
    <Sheet open={Boolean(target)} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-xl"
      >
        <SheetHeader className="space-y-1 text-left">
          <SheetTitle className="flex items-center gap-2 text-lg">
            {Icon ? (
              <span className="grid size-8 place-items-center rounded-xl bg-primary/10 text-primary">
                <Icon className="size-4" />
              </span>
            ) : null}
            <span className="truncate">{record?.titulo ?? "Carregando registro"}</span>
          </SheetTitle>
          <SheetDescription>
            {target ? buscaCategoriaLabels[target.categoria] : ""}
            {record?.subtitulo ? ` · ${record.subtitulo}` : ""}
          </SheetDescription>
        </SheetHeader>

        {query.isLoading ? (
          <div className="flex flex-1 items-center justify-center gap-2 py-16 text-sm text-foreground/50">
            <Loader2 className="size-4 animate-spin" /> Carregando histórico…
          </div>
        ) : null}

        {query.isError ? (
          <p className="mt-6 rounded-2xl bg-destructive/8 p-4 text-sm text-destructive">
            Não foi possível carregar este registro: {(query.error as Error).message}
          </p>
        ) : null}

        {record ? (
          <div className="mt-4 space-y-6 pb-8">
            {record.status ? (
              <span className="inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary capitalize">
                {String(record.status).replace(/_/g, " ")}
              </span>
            ) : null}

            <section>
              <h3 className="text-[11px] font-bold tracking-[0.18em] text-foreground/45 uppercase">
                Dados do registro
              </h3>
              <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                {record.campos.map((campo) => (
                  <div key={campo.label} className="min-w-0">
                    <dt className="text-[11px] text-foreground/45">{campo.label}</dt>
                    <dd className="truncate text-sm font-medium text-foreground/85 capitalize-first">
                      {campo.valor || "—"}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>

            <section>
              <h3 className="text-[11px] font-bold tracking-[0.18em] text-foreground/45 uppercase">
                Histórico e alterações
              </h3>
              {record.eventos.length === 0 ? (
                <p className="mt-3 text-sm text-foreground/50">
                  Ainda não há movimentações registradas para este item.
                </p>
              ) : (
                <ol className="mt-3 space-y-0">
                  {record.eventos.map((evento, index) => (
                    <li key={evento.id} className="relative flex gap-3 pb-5 last:pb-0">
                      <div className="flex flex-col items-center">
                        <span className="mt-1.5 size-2 rounded-full bg-primary" />
                        {index < record.eventos.length - 1 ? (
                          <span className="w-px flex-1 bg-foreground/10" />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground/90">{evento.titulo}</p>
                        {evento.descricao ? (
                          <p className="text-xs text-foreground/55">{evento.descricao}</p>
                        ) : null}
                        <p className="mt-0.5 text-[11px] text-foreground/40">
                          {formatBuscaDateTime(evento.data) || "Sem data registrada"}
                          {evento.tag ? ` · ${evento.tag}` : ""}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <Link
              to={record.rota}
              onClick={() => onOpenChange(false)}
              className="inline-flex items-center justify-center rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:bg-primary/90"
            >
              Abrir no módulo
            </Link>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
