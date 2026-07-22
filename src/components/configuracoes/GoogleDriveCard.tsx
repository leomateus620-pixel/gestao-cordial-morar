import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { toast } from "sonner";
import { CheckCircle2, ExternalLink, HardDrive, Loader2, Unlink2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  disconnectGoogleDrive,
  getMyDriveConnection,
  startGoogleDriveOAuth,
} from "@/lib/google-drive/google-drive.functions";

const QK = ["google-drive", "connection"] as const;

export function GoogleDriveCard() {
  const qc = useQueryClient();
  const search = useSearch({ strict: false }) as { gdrive?: string; detail?: string };

  const connection = useQuery({
    queryKey: QK,
    queryFn: () => getMyDriveConnection(),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (search.gdrive === "connected") {
      toast.success("Google Drive conectado com sucesso");
      qc.invalidateQueries({ queryKey: QK });
      window.history.replaceState({}, "", "/configuracoes");
    } else if (search.gdrive === "error") {
      toast.error(`Falha ao conectar com Google Drive: ${search.detail ?? "tente novamente"}`);
      window.history.replaceState({}, "", "/configuracoes");
    }
  }, [search.gdrive, search.detail, qc]);

  const connectMut = useMutation({
    mutationFn: async () => {
      const { url } = await startGoogleDriveOAuth();
      window.location.href = url;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disconnectMut = useMutation({
    mutationFn: () => disconnectGoogleDrive(),
    onSuccess: () => {
      toast.success("Conta Google Drive desconectada");
      qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const conn = connection.data;

  return (
    <div className="glass-panel rounded-3xl p-4">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-white shadow-sm ring-1 ring-black/5">
          <HardDrive className="size-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold">Google Drive</p>
            {conn && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                <CheckCircle2 className="size-3" /> Conectado
              </span>
            )}
          </div>
          {connection.isLoading ? (
            <p className="mt-1 text-[11px] text-foreground/55">Carregando…</p>
          ) : conn ? (
            <>
              <p className="mt-0.5 text-[11px] text-foreground/55">
                {conn.google_email} · escopo <code>drive.file</code>
              </p>
              {conn.last_error && (
                <p className="mt-1 rounded-md bg-rose-500/10 px-2 py-1 text-[11px] text-rose-800">
                  {conn.last_error}
                </p>
              )}
              <p className="mt-2 text-[11px] text-foreground/60">
                Ative a sincronização em cada contrato de aluguel para criar automaticamente
                uma pasta dedicada e espelhar os anexos no seu Drive.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => disconnectMut.mutate()}
                  disabled={disconnectMut.isPending}
                >
                  {disconnectMut.isPending ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Unlink2 className="size-3" />
                  )}
                  Desconectar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => connectMut.mutate()}
                  disabled={connectMut.isPending}
                >
                  Reconectar / trocar conta
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="mt-0.5 text-[11px] text-foreground/60">
                Conecte sua conta Google Drive para espelhar automaticamente os anexos
                dos contratos de aluguel em pastas dedicadas (uma por contrato). Escopo
                mínimo <code>drive.file</code> — só vemos arquivos que este sistema cria.
              </p>
              <div className="mt-3">
                <Button
                  size="sm"
                  onClick={() => connectMut.mutate()}
                  disabled={connectMut.isPending}
                >
                  {connectMut.isPending ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <ExternalLink className="size-3" />
                  )}
                  Conectar Google Drive
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
