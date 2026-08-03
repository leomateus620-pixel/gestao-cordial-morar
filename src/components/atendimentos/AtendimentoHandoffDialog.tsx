import { useCallback, useState } from "react";
import { Copy, Check, MessageCircle } from "lucide-react";
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
import { whatsappHref } from "@/lib/attendances/whatsapp";
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
  const waHref = atendimento ? whatsappHref(atendimento.telefone) : null;

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
          <DialogTitle>Mensagem de repasse</DialogTitle>
          <DialogDescription>
            Pronta para enviar ao corretor responsável — copie e cole.
          </DialogDescription>
        </DialogHeader>
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed text-foreground">
          {message}
        </pre>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
          <div className="flex gap-2">
            {waHref ? (
              <Button variant="outline" asChild>
                <a
                  href={`${waHref}?text=${encodeURIComponent(message)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle className="mr-2 h-4 w-4" />
                  WhatsApp
                </a>
              </Button>
            ) : null}
            <Button onClick={copy}>
              {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
              {copied ? "Copiado" : "Copiar mensagem"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
