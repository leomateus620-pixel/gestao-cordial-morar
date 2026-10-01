import { Archive, CheckCircle2, Clock, Loader2, RotateCw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useArchiveProgress } from "@/hooks/useImoveis";
import { useEnqueuePropertySync } from "@/hooks/usePropertySync";

const LABEL: Record<string, string> = { cordial: "Cordial", morar: "Morar" };

export function ArchiveProgressBanner({
  propertyId,
  archived,
  archiving,
  canRetry,
}: {
  propertyId: string;
  archived: boolean;
  archiving: boolean;
  canRetry: boolean;
}) {
  const progress = useArchiveProgress(propertyId, archiving);
  const retry = useEnqueuePropertySync(propertyId);
  const destinations = progress.data?.destinations ?? [];
  const failed = destinations.some((d) => d.state === "falhou");

  const title = archived
    ? "Imóvel arquivado — fora dos sites, guardado no sistema."
    : failed
      ? "Arquivamento com falha em um destino — o imóvel ainda não foi arquivado."
      : destinations.length && destinations.every((d) => d.state === "pendente")
        ? "Solicitação registrada — aguardando os sites retirarem o anúncio."
        : "Arquivamento em andamento — aguardando os sites confirmarem a retirada.";

  async function handleRetry(provider: string) {
    try {
      await retry.mutateAsync({ propertyId, providers: [provider as never], action: "unpublish" });
      toast.success(`Nova tentativa de retirada em ${LABEL[provider] ?? provider}.`);
      progress.refetch();
    } catch (error) {
      toast.error((error as Error)?.message ?? "Não foi possível tentar de novo.");
    }
  }

  return (
    <div className="space-y-2 rounded-2xl border border-amber-300/60 bg-amber-50/70 px-4 py-2.5 text-xs text-amber-900">
      <p className="flex items-center gap-2 font-semibold">
        {archiving ? <Loader2 className="size-4 animate-spin" /> : <Archive className="size-4" />}
        {title}
      </p>
      {archiving && (
        <ul className="space-y-1">
          <li className="flex items-center gap-2">
            <CheckCircle2 className="size-3.5" /> Site próprio: fora do ar
          </li>
          {destinations.map((d) => (
            <li key={d.provider} className="flex flex-wrap items-center gap-2">
              {d.state === "retirado" ? (
                <CheckCircle2 className="size-3.5" />
              ) : d.state === "falhou" ? (
                <XCircle className="size-3.5 text-destructive" />
              ) : (
                <Clock className="size-3.5" />
              )}
              {LABEL[d.provider] ?? d.provider}:{" "}
              {d.state === "retirado" ? "retirado e conferido" : d.state === "falhou" ? "falhou" : "pendente"}
              {d.message && d.state !== "retirado" && (
                <span className="text-amber-900/70">— {d.message}</span>
              )}
              {d.state === "falhou" && canRetry && (
                <button
                  type="button"
                  disabled={retry.isPending}
                  onClick={() => handleRetry(d.provider)}
                  className="inline-flex items-center gap-1 rounded-full border border-amber-400/60 px-2 py-0.5 font-semibold disabled:opacity-40"
                >
                  <RotateCw className="size-3" /> Tentar de novo
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
