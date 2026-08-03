import { useCallback, useState } from "react";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { buildHandoffMessage } from "@/lib/atendimentos/handoff-message";
import type { Atendimento } from "@/types/atendimento";

export function AtendimentoHandoffDialog({
  atendimento,
  autorNome,
  onClose,
}: {
  atendimento: Atendimento | null;
  autorNome?: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const message = atendimento ? buildHandoffMessage(atendimento, autorNome) : "";


  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message);
    } catch {
      const area = document.createElement("textarea");
      area.value = message;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand("copy");
      } catch {
        toast.error("Não foi possível copiar. Selecione o texto manualmente.");
        document.body.removeChild(area);
        return;
      }
      document.body.removeChild(area);
    }
    setCopied(true);
    toast.success("Mensagem copiada.");
    window.setTimeout(() => setCopied(false), 2000);
  }, [message]);

  return (
    <Dialog
      open={Boolean(atendimento)}
      onOpenChange={(open) => {
        if (!open) {
          setCopied(false);
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Mensagem para o corretor</DialogTitle>
          <DialogDescription>
            Copie e envie para o corretor responsável.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-80 space-y-3 overflow-auto rounded-lg border bg-muted/30 p-4 text-sm leading-relaxed whitespace-pre-wrap text-foreground">
          {message}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
          <Button onClick={copy}>
            {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
            {copied ? "Copiado" : "Copiar mensagem"}
          </Button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}
