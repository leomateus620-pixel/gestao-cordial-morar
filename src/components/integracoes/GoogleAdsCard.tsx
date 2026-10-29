import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAds } from "@/hooks/useAds";
import { useSession } from "@/lib/auth-mock";
import { isAdminUser } from "@/lib/access-control";
import {
  listGoogleAccounts,
  selectGoogleAccount,
  type AdConnectionPublic,
} from "@/lib/ads/ads.functions";
import type { MarketingAgencyId } from "@/types/marketing";

type GoogleAccount = {
  id: string;
  name: string;
  currency: string;
  timezone: string;
  manager: boolean;
  testAccount: boolean;
};

export function GoogleAdsCard({ enabled = true }: { enabled?: boolean }) {
  const session = useSession();
  if (!enabled || !isAdminUser(session)) return null;
  return <GoogleAdsAdmin />;
}

function GoogleAdsAdmin() {
  const ads = useAds([], "todas");
  const [authorizing, setAuthorizing] = useState<MarketingAgencyId | null>(null);
  const google = ads.connections.filter((connection) => connection.platform === "google");
  const configured = google.some((connection) => connection.configured);
  async function authorize(agency: MarketingAgencyId) {
    setAuthorizing(agency);
    try {
      const result = await ads.connect("google", agency);
      if (!result.ok) toast.error(result.message);
    } catch {
      toast.error(
        "Não foi possível iniciar a autorização Google. Confira a configuração no servidor.",
      );
    } finally {
      setAuthorizing(null);
    }
  }
  return (
    <section
      className="mb-5 rounded-3xl bg-card p-4 ring-1 ring-border/60 sm:p-6"
      aria-labelledby="google-ads-title"
    >
      <h2 id="google-ads-title" className="font-display text-lg font-semibold">
        Google Ads
      </h2>
      <p className="mt-1 text-sm text-foreground/70">
        Autorize cada imobiliária e escolha uma conta anunciante com acesso direto.
      </p>
      {ads.connectionsLoading ? (
        <p role="status" className="mt-4 text-sm text-foreground/70">
          Carregando conexões…
        </p>
      ) : ads.connectionsError ? (
        <div role="alert" className="mt-4 text-sm text-foreground/70">
          <p>Não foi possível consultar as conexões.</p>
          <Button
            variant="outline"
            className="mt-2 min-h-11"
            onClick={() => void ads.refetchConnections()}
          >
            Tentar novamente
          </Button>
        </div>
      ) : !configured ? (
        <p className="mt-4 text-sm text-foreground/70">
          Configuração do servidor pendente. Configure as credenciais OAuth e a versão da API antes
          de autorizar.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {(["cordial", "morar"] as const).map((agency) => {
            const rows = google.filter(
              (connection) => connection.id && connection.imobiliaria === agency,
            );
            return (
              <div key={agency} className="min-w-0 rounded-2xl border p-4">
                <h3 className="text-sm font-semibold capitalize">{agency}</h3>
                {rows.length ? (
                  rows.map((connection) => (
                    <GoogleConnection key={connection.id} connection={connection} />
                  ))
                ) : (
                  <p className="mt-2 text-sm text-foreground/70">Aguardando autorização.</p>
                )}
                {(!rows.length ||
                  rows.some(
                    (connection) =>
                      connection.status === "expired" || connection.status === "error",
                  )) && (
                  <Button
                    variant="outline"
                    className="mt-3 min-h-11"
                    disabled={Boolean(authorizing)}
                    onClick={() => void authorize(agency)}
                  >
                    {authorizing === agency
                      ? "Abrindo autorização…"
                      : rows.length
                        ? "Autorizar novamente"
                        : "Autorizar Google"}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-4 text-xs leading-relaxed text-foreground/70">
        A autorização OAuth, o acesso do projeto Cloud à API e a permissão da conta são verificações
        distintas. Contas administradoras não podem ser selecionadas nesta etapa.
      </p>
    </section>
  );
}

function GoogleConnection({ connection }: { connection: AdConnectionPublic }) {
  const list = useServerFn(listGoogleAccounts),
    select = useServerFn(selectGoogleAccount);
  const qc = useQueryClient();
  const [accounts, setAccounts] = useState<GoogleAccount[] | null>(null);
  const [chosen, setChosen] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function discover() {
    if (!connection.id) return;
    setPending(true);
    setError("");
    setAccounts(null);
    setChosen("");
    try {
      setAccounts(await list({ data: { connectionId: connection.id } }));
    } catch {
      setError(
        "Não foi possível consultar contas. Verifique autorização OAuth, acesso à API no Cloud e permissões da conta e tente novamente.",
      );
    } finally {
      setPending(false);
    }
  }
  async function save() {
    if (!connection.id || !chosen) return;
    setPending(true);
    setError("");
    try {
      await select({ data: { connectionId: connection.id, accountId: chosen } });
      setAccounts(null);
      void qc.invalidateQueries({ queryKey: ["marketing", "ad-connections"] });
      toast.success("Conta vinculada. A coleta de métricas ainda precisa ser validada.");
    } catch {
      setError("Não foi possível vincular a conta. Atualize a lista e verifique o acesso.");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="mt-2 space-y-3">
      {connection.accountId ? (
        <p className="text-sm text-foreground/70">
          Conta selecionada: {connection.accountLabel || connection.accountId} ·{" "}
          {connection.accountId}. A coleta de métricas ainda não foi comprovada.
          {(connection.status === "expired" || connection.status === "error") &&
            " A conexão precisa de atenção."}
        </p>
      ) : (
        <>
          <p className="text-sm text-foreground/70">
            Autorização registrada. Nenhuma conta selecionada.
          </p>
          <Button
            variant="outline"
            className="min-h-11"
            disabled={pending}
            onClick={() => void discover()}
          >
            {pending ? "Consultando…" : "Consultar contas acessíveis"}
          </Button>
          {accounts && accounts.length === 0 && (
            <p className="text-sm text-foreground/70">
              Nenhuma conta diretamente acessível foi encontrada.
            </p>
          )}
          {accounts && accounts.length > 0 && (
            <div className="space-y-2">
              <label className="flex flex-col gap-1 text-sm font-medium">
                Conta anunciante
                <select
                  className="min-h-11 w-full rounded-xl border bg-card px-3"
                  value={chosen}
                  onChange={(event) => setChosen(event.target.value)}
                  disabled={pending}
                >
                  <option value="">Selecione uma conta</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id} disabled={account.manager}>
                      {account.name} · {account.id}
                      {account.manager ? " · administradora (não selecionável)" : ""}
                      {account.testAccount ? " · teste" : ""} · {account.currency} ·{" "}
                      {account.timezone}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                className="min-h-11"
                disabled={!chosen || pending}
                onClick={() => void save()}
              >
                {pending ? "Salvando…" : "Vincular conta"}
              </Button>
            </div>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
