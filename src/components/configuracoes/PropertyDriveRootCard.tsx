import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, ExternalLink, FolderTree, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  getPropertyDriveRoot,
  setPropertyDriveRoot,
} from "@/lib/imoveis/drive/property-drive.functions";

const QK = ["property-drive-root"] as const;

const STATUS_LABEL: Record<string, string> = {
  connected: "Conectado",
  not_found: "Pasta não encontrada",
  no_permission: "Sem permissão",
  disconnected: "Reconectar Drive",
};

export function PropertyDriveRootCard() {
  const qc = useQueryClient();
  const loadFn = useServerFn(getPropertyDriveRoot);
  const saveFn = useServerFn(setPropertyDriveRoot);
  const [link, setLink] = useState("");

  const root = useQuery({ queryKey: QK, queryFn: () => loadFn(), staleTime: 30_000 });
  const save = useMutation({
    mutationFn: (value: string) => saveFn({ data: { link: value } }),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success("Pasta raiz dos imóveis validada e salva.");
        setLink("");
        qc.invalidateQueries({ queryKey: QK });
      } else {
        toast.error(result.message ?? "Não foi possível validar a pasta.");
      }
    },
    onError: (err) => toast.error((err as Error)?.message ?? "Falha ao validar a pasta."),
  });

  const data = root.data;
  const connected = data?.status === "connected";

  return (
    <div className="glass-panel rounded-3xl p-4">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-white shadow-sm ring-1 ring-black/5">
          <FolderTree className="size-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">Pasta raiz dos imóveis no Google Drive</p>
            {data ? (
              <span
                className={
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider " +
                  (connected
                    ? "bg-emerald-600/12 text-emerald-800"
                    : "bg-amber-500/14 text-amber-900")
                }
              >
                {connected ? (
                  <CheckCircle2 className="size-3" />
                ) : (
                  <AlertTriangle className="size-3" />
                )}
                {STATUS_LABEL[data.status] ?? "Verificando"}
              </span>
            ) : null}
          </div>

          <p className="mt-0.5 text-[11px] text-foreground/60">
            Cada imóvel finalizado ganha uma pasta própria aqui dentro, com as subpastas de fotos
            horizontais, verticais e vídeos.
          </p>

          {root.isLoading ? (
            <p className="mt-2 text-[11px] text-foreground/55">Verificando acesso…</p>
          ) : (
            <>
              {data?.folderName ? (
                <p className="mt-2 text-[11px] text-foreground/70">
                  Pasta atual: <span className="font-semibold">{data.folderName}</span>
                </p>
              ) : null}
              {data?.message ? (
                <p className="mt-2 rounded-md bg-amber-500/10 px-2 py-1 text-[11px] text-amber-900">
                  {data.message}
                </p>
              ) : null}
              {data?.folderUrl ? (
                <Button size="sm" variant="outline" className="mt-3" asChild>
                  <a href={data.folderUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="size-3" /> Abrir pasta raiz
                  </a>
                </Button>
              ) : null}
            </>
          )}

          {data?.canManage ? (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="Colar link da pasta do Google Drive"
                className="min-h-11 w-full rounded-2xl border border-white/60 bg-white/70 px-3 text-sm outline-none focus:border-primary/50"
              />
              <Button
                size="sm"
                onClick={() => save.mutate(link)}
                disabled={!link.trim() || save.isPending}
                className="min-h-11 shrink-0"
              >
                {save.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null} Validar
                acesso
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
