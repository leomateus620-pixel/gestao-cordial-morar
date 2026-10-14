import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

/** Galeria ampliada sobre os resultados. Esc fecha; o foco volta ao botão de origem. */
export function PhotoLightbox({
  photos,
  startIndex,
  title,
  open,
  onOpenChange,
}: {
  photos: string[];
  startIndex: number;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const origin = useRef<HTMLElement | null>(null);
  if (open && !origin.current && typeof document !== "undefined")
    origin.current = document.activeElement as HTMLElement | null;
  useEffect(() => {
    if (open) setIndex(startIndex);
  }, [open, startIndex]);
  const total = photos.length;
  const go = (d: number) => setIndex((i) => (((i + d) % total) + total) % total);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-5xl gap-3 border-none bg-[rgba(16,20,24,0.94)] p-3 text-white sm:p-4"
        onCloseAutoFocus={(e) => {
          // Devolve o foco ao botão do card de origem.
          const el = origin.current;
          origin.current = null;
          if (el && document.contains(el)) {
            e.preventDefault();
            el.focus();
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") go(1);
          if (e.key === "ArrowLeft") go(-1);
        }}
      >
        <DialogTitle className="pr-8 text-sm font-semibold text-white">{title}</DialogTitle>
        <DialogDescription className="sr-only">
          Use as setas do teclado para trocar de foto e Esc para fechar.
        </DialogDescription>
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-black sm:aspect-[16/10]">
          {total ? (
            <img
              key={photos[index]}
              src={photos[index]}
              alt={`${title} — foto ${index + 1} de ${total}`}
              decoding="async"
              className="size-full object-contain"
            />
          ) : null}
          {total > 1 ? (
            <>
              <button
                type="button"
                aria-label="Foto anterior"
                onClick={() => go(-1)}
                className="absolute left-2 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/15 backdrop-blur hover:bg-white/25 focus-visible:ring-2 focus-visible:ring-white"
              >
                <ChevronLeft className="size-5" />
              </button>
              <button
                type="button"
                aria-label="Próxima foto"
                onClick={() => go(1)}
                className="absolute right-2 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/15 backdrop-blur hover:bg-white/25 focus-visible:ring-2 focus-visible:ring-white"
              >
                <ChevronRight className="size-5" />
              </button>
            </>
          ) : null}
        </div>
        <p className="text-center text-xs tabular-nums text-white/70" aria-live="polite">
          {total ? `${index + 1} de ${total}` : "Sem fotos"}
        </p>
      </DialogContent>
    </Dialog>
  );
}
