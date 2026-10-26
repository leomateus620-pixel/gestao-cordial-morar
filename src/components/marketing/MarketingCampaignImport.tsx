import { useState } from "react";
import { Link2, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { useAds } from "@/hooks/useAds";
import type { ExternalCampaign } from "@/lib/ads/types";
import type { MarketingAgencyId } from "@/types/marketing";

type Props = {
  ads: ReturnType<typeof useAds>;
  agency: MarketingAgencyId | "todas";
  range: { since: string; until: string };
  canConfigure: boolean;
};
export function MarketingCampaignImport({ ads, agency, range, canConfigure }: Props) {
  const [connectionId, setConnectionId] = useState(""),
    [url, setUrl] = useState(""),
    [available, setAvailable] = useState<ExternalCampaign[] | null>(null),
    [discovering, setDiscovering] = useState(false);
  const connections = ads.connections.filter(
    (c) => c.id && c.accountId && c.imobiliaria && (agency === "todas" || c.imobiliaria === agency),
  );
  const connection = connections.find((c) => c.id === connectionId);
  async function discover() {
    if (!connection?.id || !connection.accountId) return;
    setDiscovering(true);
    try {
      setAvailable(
        await ads.discoverCampaigns({
          connectionId: connection.id,
          accountId: connection.accountId,
        }),
      );
    } catch {
      toast.error(
        "Não foi possível consultar as campanhas. Revise a capacidade de leitura em Integrações.",
      );
    } finally {
      setDiscovering(false);
    }
  }
  async function importOne(campaign: ExternalCampaign) {
    if (!connection?.id || !connection.accountId || !connection.imobiliaria) return;
    const r = await ads
      .importDiscoveredCampaign({
        connectionId: connection.id,
        accountId: connection.accountId,
        campaignId: campaign.id,
        imobiliaria: connection.imobiliaria as MarketingAgencyId,
        range,
      })
      .catch(() => null);
    if (r?.ok) toast.success("Campanha importada. A sincronização está na fila do servidor.");
    else toast.error(r && !r.ok ? r.message : "Não foi possível importar a campanha.");
  }
  if (!canConfigure)
    return (
      <p className="rounded-2xl bg-card p-4 text-xs leading-relaxed text-foreground/65 ring-1 ring-border/60">
        A importação e a configuração das contas são realizadas pelo administrador. As campanhas já
        vinculadas continuam disponíveis para acompanhamento e sincronização.
      </p>
    );
  return (
    <details className="rounded-3xl bg-card p-4 ring-1 ring-border/60">
      <summary className="min-h-7 cursor-pointer text-sm font-semibold">
        Importar campanhas da conta
      </summary>
      <p className="mt-2 text-xs leading-relaxed text-foreground/65">
        Escolha a conexão da marca e consulte suas campanhas. A importação não altera anúncios nem
        orçamento.
      </p>
      {!connections.length ? (
        <p className="mt-3 rounded-2xl bg-muted p-3 text-sm text-foreground/70">
          Nenhuma conta vinculada neste escopo.{" "}
          {canConfigure ? (
            <a className="font-semibold text-primary underline" href="/integracoes">
              Configurar em Integrações
            </a>
          ) : (
            "Solicite ao administrador a configuração da integração."
          )}
        </p>
      ) : (
        <>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <select
              aria-label="Conexão e conta de anúncios"
              className="h-11 min-w-0 flex-1 rounded-2xl border bg-background px-3 text-sm"
              value={connectionId}
              onChange={(e) => {
                setConnectionId(e.target.value);
                setAvailable(null);
              }}
            >
              <option value="">Selecione marca / conta</option>
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.imobiliaria} · {c.platform === "meta" ? "Meta Ads" : "Google Ads"} ·{" "}
                  {c.accountLabel ?? c.accountId}
                </option>
              ))}
            </select>
            {connection?.platform === "meta" && (
              <Button
                variant="outline"
                className="h-11 rounded-2xl"
                disabled={discovering}
                onClick={discover}
              >
                {discovering ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Search className="size-4" />
                )}
                Buscar campanhas
              </Button>
            )}
          </div>
          {available && (
            <div className="mt-3 max-h-72 divide-y overflow-y-auto rounded-2xl border">
              {available.length ? (
                available.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-semibold">{c.name}</p>
                      <p className="mt-1 text-xs text-foreground/60">
                        {c.status} · ID {c.id}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      className="h-11 shrink-0 rounded-xl"
                      onClick={() => void importOne(c)}
                      disabled={ads.importing}
                    >
                      Importar
                    </Button>
                  </div>
                ))
              ) : (
                <p className="p-4 text-sm text-foreground/65">
                  Sem campanhas disponíveis nesta conta.
                </p>
              )}
            </div>
          )}
          <form
            className="mt-4 flex flex-col gap-2 sm:flex-row"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!connection?.id || !connection.imobiliaria) return;
              const r = await ads
                .importCampaign({
                  url,
                  connectionId: connection.id,
                  accountId: connection.accountId ?? undefined,
                  imobiliaria: connection.imobiliaria as MarketingAgencyId,
                  range,
                })
                .catch(() => null);
              if (r?.ok) {
                setUrl("");
                toast.success("Campanha importada; sincronização agendada.");
              } else toast.error(r && !r.ok ? r.message : "Falha ao importar.");
            }}
          >
            <label className="flex min-w-0 flex-1 items-center gap-2">
              <Link2 className="size-4 shrink-0 text-foreground/55" />
              <Input
                className="h-11 rounded-2xl"
                aria-label="Link da campanha para importação alternativa"
                placeholder="Ou cole o link da campanha"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </label>
            <Button
              type="submit"
              className="h-11 rounded-2xl"
              disabled={!connection || !url.trim() || ads.importing}
            >
              Importar por link
            </Button>
          </form>
        </>
      )}
    </details>
  );
}
