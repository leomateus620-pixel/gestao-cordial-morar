import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, AlertCircle, Copy, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getMetaWebhookStatus, META_LEADGEN_CALLBACK } from "@/lib/ads/webhook-status.functions";

function Row({ label, value, detail }: { label: string; value: boolean | null; detail?: string }) {
  return (
    <div className="flex items-start gap-2 rounded-2xl bg-muted/50 p-3 text-xs">
      {value === true ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
      ) : (
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-foreground/55" />
      )}
      <div className="min-w-0">
        <p className="font-semibold">{label}</p>
        <p className="mt-0.5 text-foreground/65">
          {detail ?? (value === true ? "Confirmado agora" : value === false ? "Pendente" : "Não verificado")}
        </p>
      </div>
    </div>
  );
}

export function MetaWebhookStatusPanel() {
  const fetchStatus = useServerFn(getMetaWebhookStatus);
  const q = useQuery({
    queryKey: ["marketing", "meta-webhook-status"],
    queryFn: () => fetchStatus(),
    staleTime: 60_000,
    retry: false,
  });
  const s = q.data;
  return (
    <div className="mt-4 rounded-2xl border p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Webhook de leads (formulários de anúncio)</h3>
        <Button
          variant="ghost"
          size="sm"
          className="min-h-11 rounded-xl"
          onClick={() => void q.refetch()}
          disabled={q.isFetching}
        >
          {q.isFetching ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Atualizar
        </Button>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <code className="min-w-0 flex-1 break-all rounded-xl bg-muted/60 px-3 py-2 text-xs">
          {META_LEADGEN_CALLBACK}
        </code>
        <Button
          variant="outline"
          className="min-h-11 rounded-xl"
          onClick={() => {
            void navigator.clipboard.writeText(META_LEADGEN_CALLBACK);
            toast.success("URL copiada.");
          }}
        >
          <Copy className="size-4" /> Copiar URL
        </Button>
      </div>
      {q.isError && (
        <p className="mt-3 text-xs text-foreground/70">Não foi possível ler a situação agora.</p>
      )}
      {s && (
        <>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            <Row
              label="Backend"
              value={s.backend.ready}
              detail={s.backend.ready ? "Pronto" : `Faltando: ${s.backend.missing.join(", ") || "estrutura"}`}
            />
            <Row label="Verificação do webhook" value={s.verification} />
            <Row label="Assinatura leadgen do aplicativo" value={s.appSubscribed} />
            <Row label="Inscrição da Página" value={s.pageSubscribed} />
            <Row label="Processamento automático" value={s.workerActive} detail={s.workerActive ? "Ativo" : "Desligado"} />
            <Row
              label="Leads com falha recuperável"
              value={s.recoverableFailures === 0}
              detail={`${s.recoverableFailures} para revisar · ${s.queued} na fila`}
            />
          </div>
          <p className="mt-3 text-xs text-foreground/65">
            Último lead processado:{" "}
            {s.lastProcessedAt ? new Date(s.lastProcessedAt).toLocaleString("pt-BR") : "nenhum ainda"}
            {" · "}Verificado em {new Date(s.checkedAt).toLocaleString("pt-BR")}
          </p>
        </>
      )}
    </div>
  );
}
