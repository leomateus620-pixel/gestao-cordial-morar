import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, HardDrive, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getDriveConnectionStatus } from "@/lib/google-drive/google-drive.functions";

const QK = ["google-drive", "workspace-connection"] as const;

export function GoogleDriveCard() {
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: QK,
    queryFn: () => getDriveConnectionStatus(),
    staleTime: 30_000,
  });

  const data = status.data;
  const connected = !!data?.connected;

  return (
    <div className="glass-panel rounded-3xl p-4">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-white shadow-sm ring-1 ring-black/5">
          <HardDrive className="size-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">Google Drive (workspace)</p>
            {connected && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                <CheckCircle2 className="size-3" /> Conectado
              </span>
            )}
            {!connected && !status.isLoading && (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-800">
                Desconectado
              </span>
            )}
          </div>

          {status.isLoading ? (
            <p className="mt-1 text-[11px] text-foreground/55">Verificando conexão…</p>
          ) : connected ? (
            <>
              <p className="mt-0.5 text-[11px] text-foreground/60">
                Conta compartilhada do workspace:{" "}
                <span className="font-medium text-foreground/80">{data?.account}</span>
              </p>
              <p className="mt-2 inline-flex items-center gap-1 text-[11px] text-foreground/70">
                <ShieldCheck className="size-3 text-emerald-700" />
                Acesso limitado à pasta raiz{" "}
                <span className="font-semibold text-foreground/85">
                  {data?.rootFolderName ?? "Gestão Cordial — Aluguéis"}
                </span>{" "}
                e suas subpastas por contrato.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {data?.rootFolderUrl && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={data.rootFolderUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="size-3" /> Abrir pasta raiz
                    </a>
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    qc.invalidateQueries({ queryKey: QK });
                  }}
                  disabled={status.isFetching}
                >
                  {status.isFetching ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <RefreshCw className="size-3" />
                  )}
                  Testar conexão
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="mt-0.5 text-[11px] text-foreground/60">
                Todos os anexos do menu Aluguéis são espelhados na conta Google Drive
                compartilhada do workspace, dentro da pasta{" "}
                <span className="font-semibold">Gestão Cordial — Aluguéis</span>. Se você
                está vendo este aviso, o conector <em>Google Drive</em> não está vinculado
                ao projeto.
              </p>
              {data?.lastError && (
                <p className="mt-2 rounded-md bg-rose-500/10 px-2 py-1 text-[11px] text-rose-800">
                  {data.lastError}
                </p>
              )}
              <p className="mt-2 text-[11px] text-foreground/55">
                Peça a um administrador do workspace para conectar o Google Drive em
                <em> Connectors</em>.
              </p>
              <div className="mt-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => qc.invalidateQueries({ queryKey: QK })}
                  disabled={status.isFetching}
                >
                  <RefreshCw className="size-3" /> Verificar novamente
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
