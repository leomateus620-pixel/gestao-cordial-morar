import { useState } from "react";
import { Loader2, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useDeleteImovel } from "@/hooks/useImoveis";
import type { PropertyDetail } from "@/types/property";

const PROVIDER_LABEL: Record<string, string> = { cordial: "Cordial", morar: "Morar" };

export function DeletePropertyDialog({
  imovel,
  open,
  onOpenChange,
}: {
  imovel: PropertyDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const remove = useDeleteImovel();
  const [confirmation, setConfirmation] = useState("");

  const expected = (imovel.codigo ?? "EXCLUIR").trim();
  const matches = confirmation.trim().toUpperCase() === expected.toUpperCase();

  const published = imovel.publications.filter((p) => p.externalPropertyId);

  async function handleDelete() {
    try {
      const result = await remove.mutateAsync(imovel.id);
      onOpenChange(false);
      if (result.status === "deleted") {
        toast.success("Imóvel excluído definitivamente.");
      } else {
        const names = result.providers.map((p) => PROVIDER_LABEL[p] ?? p).join(" e ");
        toast.success(
          `Remoção solicitada em ${names}. O cadastro será apagado assim que os sites confirmarem.`,
        );
      }
      navigate({ to: "/imoveis" });
    } catch (error) {
      toast.error((error as Error)?.message ?? "Não foi possível excluir o imóvel.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <TriangleAlert className="size-4" /> Excluir imóvel
          </DialogTitle>
          <DialogDescription className="text-left">
            {published.length ? (
              <>
                Este imóvel está publicado em{" "}
                <strong>
                  {published.map((p) => PROVIDER_LABEL[p.provider] ?? p.provider).join(" e ")}
                </strong>
                . O sistema vai pedir a remoção do anúncio nos sites e apagar o cadastro assim que
                cada site confirmar. Até lá ele fica marcado como remoção em andamento.
              </>
            ) : (
              <>
                A exclusão é imediata e definitiva. Fotos, vídeos, vínculos de publicação, pastas do
                Drive e trabalhos pendentes deste imóvel também serão removidos.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-foreground/70" htmlFor="confirm-delete">
            Para confirmar, digite <span className="font-mono text-destructive">{expected}</span>
          </label>
          <Input
            id="confirm-delete"
            value={confirmation}
            autoComplete="off"
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder={expected}
          />
        </div>

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
            disabled={!matches || remove.isPending}
            onClick={handleDelete}
            className="inline-flex items-center gap-1.5 rounded-full bg-destructive px-4 py-2 text-xs font-bold text-destructive-foreground shadow-md shadow-destructive/25 disabled:opacity-40"
          >
            {remove.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Trash2 className="size-3.5" />
            )}
            {published.length ? "Remover dos sites e excluir" : "Excluir definitivamente"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
