import { useEffect, useRef, useState } from "react";
import { ImagePlus, Signpost } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Campo obrigatório da foto da placa. Só confirma com uma imagem escolhida;
 * fechar/cancelar sem foto não marca a placa.
 */
export function PlacaPhotoDialog({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: (file: File) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Signpost className="size-4 text-primary" /> Foto da placa instalada
          </DialogTitle>
          <DialogDescription>
            Obrigatória: envie uma foto mostrando a placa no imóvel. Sem foto, o item continua pendente.
          </DialogDescription>
        </DialogHeader>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="grid aspect-[4/3] w-full place-items-center overflow-hidden rounded-2xl border border-dashed border-border bg-muted/40 text-sm text-muted-foreground transition hover:border-primary/40"
        >
          {preview ? (
            <img src={preview} alt="Prévia da foto da placa" className="size-full object-cover" />
          ) : (
            <span className="flex flex-col items-center gap-2">
              <ImagePlus className="size-6" /> Toque para escolher a foto
            </span>
          )}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          aria-label="Foto da placa"
          onChange={(e) => {
            const chosen = e.target.files?.[0] ?? null;
            e.target.value = "";
            if (chosen && !chosen.type.startsWith("image/")) {
              setError("Escolha um arquivo de imagem.");
              return;
            }
            setError(null);
            if (chosen) setFile(chosen);
          }}
        />
        {error && <p className="text-xs font-semibold text-destructive">{error}</p>}

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          {file && (
            <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>
              Trocar foto
            </Button>
          )}
          <Button type="button" disabled={!file} onClick={() => file && onConfirm(file)}>
            Confirmar placa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
