import { useEffect, useState } from "react";
import { Loader2, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { Agenciamento } from "@/types/agenciamento";

type AgenciamentoRejectDialogProps = {
  agenciamento: Agenciamento | null;
  open: boolean;
  isSubmitting?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (motivo: string) => void | Promise<void>;
};

const MAX = 500;

export function AgenciamentoRejectDialog({
  agenciamento,
  open,
  isSubmitting = false,
  onOpenChange,
  onConfirm,
}: AgenciamentoRejectDialogProps) {
  const [motivo, setMotivo] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setMotivo("");
      setTouched(false);
    }
  }, [open, agenciamento?.id]);

  const trimmed = motivo.trim();
  const invalid = trimmed.length < 3;

  return (
    <Dialog open={open} onOpenChange={(next) => (!isSubmitting ? onOpenChange(next) : undefined)}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
            <ShieldX aria-hidden="true" className="size-5 text-destructive" />
            Reprovar agenciamento
          </DialogTitle>
          <DialogDescription className="leading-relaxed">
            {agenciamento
              ? `Descreva o motivo da reprovação de "${agenciamento.endereco}". O corretor responsável verá esta mensagem no menu Agenciamentos.`
              : "Descreva o motivo da reprovação."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <label
            htmlFor="agenciamento-reprovacao-motivo"
            className="text-[11px] font-semibold uppercase tracking-wider text-foreground/50"
          >
            Motivo da reprovação
          </label>
          <Textarea
            id="agenciamento-reprovacao-motivo"
            value={motivo}
            maxLength={MAX}
            rows={4}
            autoFocus
            onBlur={() => setTouched(true)}
            onChange={(event) => setMotivo(event.target.value)}
            placeholder="Ex.: as fotos verticais não estão no padrão e falta o cadastro na Cordial."
          />
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span className={touched && invalid ? "text-destructive" : undefined}>
              {touched && invalid ? "Descreva o motivo com pelo menos 3 caracteres." : "Seja específico para agilizar a correção."}
            </span>
            <span>
              {trimmed.length}/{MAX}
            </span>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-xl"
            disabled={isSubmitting}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="h-10 rounded-xl"
            disabled={isSubmitting || invalid}
            onClick={() => {
              setTouched(true);
              if (!invalid) void onConfirm(trimmed);
            }}
          >
            {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <ShieldX className="size-4" />}
            Reprovar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
