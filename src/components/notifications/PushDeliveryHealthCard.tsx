import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPushDeliveryHealth } from "@/lib/push/push-health.functions";

function seconds(value: number | null | undefined): string {
  if (value == null) return "—";
  return value < 60 ? `${Math.round(value)} s` : `${Math.round(value / 60)} min`;
}

/** Cartão "Entrega de push" — só para administradores. */
export function PushDeliveryHealthCard() {
  const fetchHealth = useServerFn(getPushDeliveryHealth);
  const { data, isLoading, error } = useQuery({
    queryKey: ["push-delivery-health"],
    queryFn: () => fetchHealth(),
    refetchInterval: 30_000,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Entrega de push</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {isLoading && <p className="text-muted-foreground">Carregando…</p>}
        {error && <p className="text-destructive">Não foi possível carregar a situação da entrega.</p>}
        {data && (
          <>
            {data.stuck > 0 ? (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-destructive">
                {data.stuck} aviso(s) aguardando há mais de 2 minutos.
              </p>
            ) : (
              <p className="text-muted-foreground">Nenhum aviso atrasado.</p>
            )}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Metric label="Na fila" value={String(data.pending)} />
              <Metric label="Enviados (24 h)" value={String(data.sent_24h)} />
              <Metric label="Atraso médio" value={seconds(data.avg_delay_s)} />
              <Metric label="Atraso p95" value={seconds(data.p95_delay_s)} />
              <Metric label="Resumidos (24 h)" value={String(data.summarized_24h)} />
              <Metric label="Falhas finais (24 h)" value={String(data.failed_final_24h)} />
            </div>
            {data.recent_errors.length > 0 && (
              <ul className="space-y-1 text-xs text-muted-foreground">
                {data.recent_errors.map((item, index) => (
                  <li key={index}>
                    {item.last_error_at ? new Date(item.last_error_at).toLocaleString("pt-BR") : ""} ·{" "}
                    {item.tipo ?? "aviso"} · {item.last_error}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-base font-semibold">{value}</div>
    </div>
  );
}
