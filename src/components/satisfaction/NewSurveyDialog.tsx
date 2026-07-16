import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, MessageCircle, QrCode, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listCorretores } from "@/lib/corretores/corretores.functions";
import { useCreateSatisfactionSurvey } from "@/hooks/useSatisfaction";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function NewSurveyDialog({ open, onOpenChange }: Props) {
  const listFn = useServerFn(listCorretores);
  const corretoresQuery = useQuery({
    queryKey: ["corretores", "list-basic"],
    queryFn: () => listFn(),
    staleTime: 60_000,
    enabled: open,
  });

  const [corretorId, setCorretorId] = useState("");
  const [clientNome, setClientNome] = useState("");
  const [clientContato, setClientContato] = useState("");
  const [contexto, setContexto] = useState("");
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);

  const create = useCreateSatisfactionSurvey();

  const canSubmit = corretorId && clientNome.trim().length > 0 && !create.isPending;

  const publicUrl = useMemo(() => generatedUrl, [generatedUrl]);

  const reset = () => {
    setCorretorId("");
    setClientNome("");
    setClientContato("");
    setContexto("");
    setGeneratedUrl(null);
    create.reset();
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };

  const handleSubmit = async () => {
    try {
      const res = await create.mutateAsync({
        corretor_id: corretorId,
        client_nome: clientNome.trim(),
        client_contato: clientContato.trim() || null,
        contexto: contexto.trim() || null,
      });
      const url = `${window.location.origin}/avaliar/${res.token}`;
      setGeneratedUrl(url);
      toast.success("Link de avaliação gerado");
    } catch (err) {
      toast.error((err as Error).message || "Erro ao gerar link");
    }
  };

  const copyLink = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success("Link copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const shareWhatsapp = () => {
    if (!publicUrl) return;
    const msg = `Olá! Como foi seu atendimento? Deixe sua avaliação: ${publicUrl}`;
    const raw = clientContato.replace(/\D/g, "");
    const base = raw
      ? `https://wa.me/${raw}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(base, "_blank", "noopener");
  };

  const openQr = () => {
    if (!publicUrl) return;
    const qr = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(publicUrl)}`;
    window.open(qr, "_blank", "noopener");
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova pesquisa de satisfação</DialogTitle>
          <DialogDescription>
            Gere um link único para o cliente avaliar o atendimento do corretor.
          </DialogDescription>
        </DialogHeader>

        {!publicUrl ? (
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="corretor">Corretor avaliado</Label>
              <Select value={corretorId} onValueChange={setCorretorId}>
                <SelectTrigger id="corretor">
                  <SelectValue placeholder="Selecione o corretor" />
                </SelectTrigger>
                <SelectContent>
                  {(corretoresQuery.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="cliente">Nome do cliente</Label>
              <Input
                id="cliente"
                value={clientNome}
                onChange={(e) => setClientNome(e.target.value)}
                placeholder="Ex.: João Silva"
                maxLength={160}
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="contato">
                Contato (WhatsApp com DDD) <span className="text-muted-foreground">— opcional</span>
              </Label>
              <Input
                id="contato"
                value={clientContato}
                onChange={(e) => setClientContato(e.target.value)}
                placeholder="Ex.: 5581999998888"
                maxLength={40}
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="contexto">
                Contexto <span className="text-muted-foreground">— opcional</span>
              </Label>
              <Textarea
                id="contexto"
                value={contexto}
                onChange={(e) => setContexto(e.target.value)}
                placeholder="Ex.: Visita ao imóvel do Bairro X"
                rows={2}
                maxLength={240}
              />
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => handleClose(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSubmit} disabled={!canSubmit}>
                {create.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                Gerar link
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="rounded-2xl border border-border/60 bg-muted/40 p-3 text-sm break-all">
              {publicUrl}
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Button variant="secondary" onClick={copyLink}>
                <Copy className="mr-2 size-4" /> Copiar
              </Button>
              <Button variant="secondary" onClick={shareWhatsapp}>
                <MessageCircle className="mr-2 size-4" /> WhatsApp
              </Button>
              <Button variant="secondary" onClick={openQr}>
                <QrCode className="mr-2 size-4" /> QR Code
              </Button>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={reset}>
                Gerar outro
              </Button>
              <Button onClick={() => handleClose(false)}>Concluir</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
