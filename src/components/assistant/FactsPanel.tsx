import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/lib/auth-mock";
import { listFacts, deleteFact } from "@/lib/agent/facts.functions";

const dateTime = (value: string) =>
  new Date(value).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

/** Shows the short facts the assistant has saved about the current session
 * (its working memory) and lets the user delete any of them. */
export function FactsPanel() {
  const session = useSession();
  const qc = useQueryClient();
  const [removing, setRemoving] = useState<string>();

  const facts = useQuery({
    queryKey: ["assistant-facts", session?.id],
    queryFn: () => listFacts(),
    enabled: !!session,
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFact({ data: { id } }),
    onSuccess: () => {
      setRemoving(undefined);
      void qc.invalidateQueries({ queryKey: ["assistant-facts", session?.id] });
    },
  });

  const items = facts.data?.facts ?? [];

  return (
    <section className="space-y-4" aria-label="Fatos guardados pelo assistente">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Fatos guardados</h2>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Pequenas anotações que o assistente guardou durante as conversas.
        </p>
      </div>
      {facts.isLoading ? (
        <div role="status" aria-label="Carregando fatos" className="assistant-skeleton h-24" />
      ) : facts.isError ? (
        <p role="alert" className="text-xs text-destructive">
          Não foi possível carregar os fatos guardados.
        </p>
      ) : !items.length ? (
        <div className="rounded-2xl border border-dashed border-border py-8 text-center">
          <p className="text-sm font-semibold">Nenhum fato guardado ainda.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((fact) => (
            <li key={fact.id} className="rounded-2xl border border-border bg-card p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
                    {fact.tipo}
                  </p>
                  <p className="mt-1 text-xs">{fact.texto}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Guardado em {dateTime(fact.createdAt)}
                    {fact.expiresAt ? ` · expira em ${dateTime(fact.expiresAt)}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  className="assistant-icon-button !size-8"
                  aria-label={`Apagar fato ${fact.tipo}`}
                  onClick={() => setRemoving(fact.id)}
                  disabled={remove.isPending}
                >
                  <Trash2 size={13} />
                </button>
              </div>
              {removing === fact.id && (
                <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
                  <p className="flex-1 text-[11px]">Apagar este fato?</p>
                  <button
                    type="button"
                    className="assistant-small-button"
                    onClick={() => setRemoving(undefined)}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="assistant-small-button text-destructive"
                    onClick={() => remove.mutate(fact.id)}
                    disabled={remove.isPending}
                  >
                    Apagar
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
