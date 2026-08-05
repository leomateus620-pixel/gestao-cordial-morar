import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { InternalDocument } from "@/types/internal-document";

type Props = {
  doc: InternalDocument | null;
  onOpenChange: (open: boolean) => void;
  onSave: (title: string, description: string) => Promise<void> | void;
  isSaving: boolean;
};

export function RenameDocumentDialog({ doc, onOpenChange, onSave, isSaving }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    setTitle(doc?.title ?? "");
    setDescription(doc?.description ?? "");
  }, [doc]);

  return (
    <Dialog open={!!doc} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar documento</DialogTitle>
          <DialogDescription className="text-xs">
            Ajuste o nome exibido e a descrição. O arquivo original é preservado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="block">
            <span className="text-[11px] font-medium uppercase tracking-wider text-foreground/55">
              Nome
            </span>
            <input
              value={title}
              maxLength={180}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/60 bg-white/70 px-3 py-2.5 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-medium uppercase tracking-wider text-foreground/55">
              Descrição (opcional)
            </span>
            <textarea
              value={description}
              maxLength={600}
              rows={3}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full resize-none rounded-xl border border-white/60 bg-white/70 px-3 py-2.5 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
            />
          </label>
        </div>

        <DialogFooter>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-foreground/65"
          >
            Cancelar
          </button>
          <button
            disabled={!title.trim() || isSaving}
            onClick={() => onSave(title.trim(), description.trim())}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 disabled:opacity-60"
          >
            {isSaving && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />}
            Salvar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
