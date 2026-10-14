import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Expand, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Galeria independente de um card. Índice local (cada card guarda o seu),
 * setas no desktop, deslizar no celular (vertical continua rolando), sem autoplay.
 */
export const CardGallery = memo(function CardGallery({
  photos,
  alt,
  onTap,
  onExpand,
  className,
  overlay,
}: {
  photos: string[];
  alt: string;
  /** Toque simples sobre a foto (sem arrastar). */
  onTap?: () => void;
  onExpand?: (index: number) => void;
  className?: string;
  overlay?: ReactNode;
}) {
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState<Record<number, boolean>>({});
  const start = useRef<{ x: number; y: number } | null>(null);
  const dragged = useRef(false);
  const total = photos.length;
  const safe = total ? Math.min(index, total - 1) : 0;

  useEffect(() => {
    if (total < 2) return;
    // Pré-carrega só a próxima foto.
    const next = new Image();
    next.decoding = "async";
    next.src = photos[(safe + 1) % total]!;
    return () => {
      next.src = "";
    };
  }, [photos, safe, total]);

  const go = (delta: number) => setIndex((i) => (((i + delta) % total) + total) % total);

  const stop = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      className={cn("relative size-full select-none overflow-hidden", className)}
      style={{ touchAction: "pan-y" }}
      onPointerDown={(e) => {
        start.current = { x: e.clientX, y: e.clientY };
        dragged.current = false;
      }}
      onPointerUp={(e) => {
        const s = start.current;
        start.current = null;
        if (!s || total < 2) return;
        const dx = e.clientX - s.x;
        const dy = e.clientY - s.y;
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.3) {
          dragged.current = true;
          go(dx < 0 ? 1 : -1);
        }
      }}
      onClick={(e) => {
        if (dragged.current) {
          stop(e);
          dragged.current = false;
          return;
        }
        if (onTap) {
          stop(e);
          onTap();
        }
      }}
    >
      {total && !failed[safe] ? (
        <img
          key={photos[safe]}
          src={photos[safe]}
          alt={total > 1 ? `${alt} — foto ${safe + 1} de ${total}` : alt}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed((f) => ({ ...f, [safe]: true }))}
          className="size-full object-cover"
        />
      ) : (
        <div className="grid size-full place-items-center bg-[linear-gradient(135deg,rgba(30,100,125,0.10),rgba(217,120,45,0.08))] text-primary/35">
          <span className="flex flex-col items-center gap-1 text-[11px] font-medium text-foreground/45">
            <ImageIcon className="size-8" strokeWidth={1.2} />
            {total ? "Foto indisponível" : "Sem fotos"}
          </span>
        </div>
      )}

      {overlay}

      {total > 1 ? (
        <>
          <button
            type="button"
            aria-label="Foto anterior"
            onClick={(e) => {
              stop(e);
              go(-1);
            }}
            className="absolute left-2 top-1/2 z-10 hidden size-8 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white opacity-0 backdrop-blur-md transition focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-white group-hover:opacity-100 sm:grid"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Próxima foto"
            onClick={(e) => {
              stop(e);
              go(1);
            }}
            className="absolute right-2 top-1/2 z-10 hidden size-8 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white opacity-0 backdrop-blur-md transition focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-white group-hover:opacity-100 sm:grid"
          >
            <ChevronRight className="size-4" />
          </button>
        </>
      ) : null}

      <div className="absolute bottom-2 right-2 z-10 flex items-center gap-1.5">
        {total > 1 ? (
          <span
            aria-live="polite"
            className="rounded-full bg-black/50 px-2 py-0.5 text-[10.5px] font-semibold tabular-nums text-white backdrop-blur-md"
          >
            {safe + 1}/{total}
          </span>
        ) : null}
        {onExpand && total > 0 ? (
          <button
            type="button"
            aria-label="Ampliar fotos"
            onClick={(e) => {
              stop(e);
              onExpand(safe);
            }}
            className="grid size-7 place-items-center rounded-full bg-black/50 text-white backdrop-blur-md transition hover:bg-black/65 focus-visible:ring-2 focus-visible:ring-white"
          >
            <Expand className="size-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  );
});
