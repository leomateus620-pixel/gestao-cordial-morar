import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { featuredAction, featuredSnapshot } from "@/lib/site-showcase/featured.functions";
import type { SiteBrand } from "@/lib/cordial-site/brand";

export function FeaturedManager({ brand }: { brand: SiteBrand }) {
  const load = useServerFn(featuredSnapshot),
    act = useServerFn(featuredAction),
    qc = useQueryClient();
  const key = ["featured-treatment", brand];
  const q = useQuery({
    queryKey: key,
    queryFn: () => load({ data: { brand } }),
    refetchInterval: (state) =>
      state.state.data?.weeks.some((w) => w.photos.some((p) => p.state === "processing"))
        ? 5000
        : false,
  });
  const m = useMutation({
    mutationFn: (
      data: { brand: SiteBrand } & (
        | { action: "run" }
        | { action: "enabled"; enabled: boolean }
        | { action: "retry"; id: string }
      ),
    ) => act({ data }),
    onSuccess: (r) => {
      toast.success(r.message);
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const button = "rounded-lg border px-3 py-2 text-sm disabled:opacity-50";
  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <h3 className="font-semibold">Cinco destaques da semana · fotos com tratamento fiel</h3>
      <p className="text-sm text-muted-foreground">
        A IA orienta ajustes suaves de luz, cor e nitidez na capa e nas duas fotos seguintes. Os
        imóveis e as fotos originais são preservados. Preparo a partir de sexta às 18h; renovação
        segunda às 6h, no horário de São Paulo, quando o conjunto estiver pronto.
      </p>
      {q.isPending ? (
        <p role="status">Carregando tratamentos…</p>
      ) : q.error ? (
        <p role="alert">Não foi possível carregar os tratamentos.</p>
      ) : (
        <>
          <p className="text-sm">
            {q.data?.enabled ? "Renovação semanal ligada" : "Renovação semanal pausada"}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              className={button}
              disabled={m.isPending}
              onClick={() => m.mutate({ brand, action: "enabled", enabled: !q.data?.enabled })}
            >
              {q.data?.enabled ? "Pausar novos tratamentos" : "Ativar tratamento fiel semanal"}
            </button>
            <button
              className={button}
              disabled={m.isPending || !q.data?.enabled}
              onClick={() => m.mutate({ brand, action: "run" })}
            >
              Preparar próxima foto agora
            </button>
          </div>
          <ul className="space-y-3 text-sm">
            {q.data?.weeks.map((w) => (
              <li key={w.id}>
                <strong>
                  Semana de {w.week_start.split("-").reverse().join("/")} ·{" "}
                  {w.state === "active" ? "No ar" : "Em preparação"}
                </strong>
                <p>
                  {w.photos.filter((p) => p.state === "ready").length} de {w.photos.length} fotos
                  prontas · {w.expected_items} imóveis
                </p>
                {w.photos
                  .filter((p) => ["failed", "uncertain", "invalid"].includes(p.state))
                  .map((p) => (
                    <div key={p.id} className="mt-1">
                      <span>{p.error ?? "Foto pendente de revisão."}</span>
                      {p.canRetry && (
                        <button
                          className={button}
                          disabled={m.isPending}
                          onClick={() => m.mutate({ brand, action: "retry", id: p.id })}
                        >
                          Tentar processamento novamente
                        </button>
                      )}
                    </div>
                  ))}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
