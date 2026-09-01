import { Archive, ArchiveRestore, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useArchiveImovel, useUnarchiveImovel } from "@/hooks/useImoveis";
import type { PropertyDetail } from "@/types/property";

const PROVIDER_LABEL: Record<string, string> = { cordial: "Cordial", morar: "Morar" };

export function ArchivePropertyDialog({
  imovel,
  open,
  onOpenChange,
}: {
  imovel: PropertyDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const archive = useArchiveImovel();
  const unarchive = useUnarchiveImovel();
  const isArchived = Boolean(imovel.archivedAt);
  const pending = archive.isPending || unarchive.isPending;

  const live = imovel.publications.filter(
    (p) => p.externalPropertyId && p.status !== "unpublished",
  );

  async function handleArchive() {
    try {
      const result = await archive.mutateAsync(imovel.id);
      onOpenChange(false);
      if (result.status === "archived") {
        toast.success("Imóvel arquivado. Ele continua guardado no sistema.");
      } else {
        const names = result.providers.map((p) => PROVIDER_LABEL[p] ?? p).join(" e ");
        toast.success(
          `Despublicação solicitada em ${names}. O imóvel será arquivado assim que os sites confirmarem.`,
        );
      }
    } catch (error) {
      toast.error((error as Error)?.message ?? "Não foi possível arquivar o imóvel.");
    }
  }

  async function handleUnarchive() {
    try {
      await unarchive.mutateAsync(imovel.id);
      onOpenChange(false);
      toast.success("Imóvel reativado. Publique novamente quando quiser voltar aos sites.");
    } catch (error) {
      toast.error((error as Error)?.message ?? "Não foi possível reativar o imóvel.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isArchived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
            {isArchived ? "Reativar imóvel" : "Arquivar imóvel"}
          </DialogTitle>
          <DialogDescription className="text-left">
            {isArchived ? (
              <>
                O imóvel volta para o catálogo do sistema. Ele <strong>não</strong> é republicado
                automaticamente nos sites — a publicação continua sendo uma ação separada.
              </>
            ) : live.length ? (
              <>
                O anúncio será retirado de{" "}
                <strong>
                  {live.map((p) => PROVIDER_LABEL[p.provider] ?? p.provider).join(" e ")}
                </strong>
                . Nada é apagado: cadastro, fotos, vídeos, códigos e histórico continuam guardados
                aqui e o imóvel passa a aparecer no filtro “Arquivados”.
              </>
            ) : (
              <>
                O imóvel sai do catálogo ativo e passa a aparecer no filtro “Arquivados”. Nada é
                apagado: cadastro, fotos, vídeos e histórico continuam guardados aqui.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="gap-2 sm:gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-full px-4 py-2 text-xs font-semibold text-foreground/60 hover:text-foreground"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={isArchived ? handleUnarchive : handleArchive}
            className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-xs font-bold text-background shadow-md disabled:opacity-40"
          >
            {pending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : isArchived ? (
              <ArchiveRestore className="size-3.5" />
            ) : (
              <Archive className="size-3.5" />
            )}
            {isArchived
              ? "Reativar imóvel"
              : live.length
                ? "Tirar dos sites e arquivar"
                : "Arquivar imóvel"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
