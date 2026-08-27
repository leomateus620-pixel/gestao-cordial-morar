import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ImageOff, X } from "lucide-react";
import type { PropertyImage } from "@/types/property";

export function PropertyGallery({ images, alt }: { images: PropertyImage[]; alt: string }) {
  const [index, setIndex] = useState(0);
  const [lightbox, setLightbox] = useState(false);

  const count = images.length;
  const go = (delta: number) => setIndex((i) => (count ? (i + delta + count) % count : 0));

  useEffect(() => {
    if (!lightbox) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setLightbox(false);
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightbox, count]);

  if (!count) {
    return (
      <div className="grid aspect-[16/10] w-full place-items-center rounded-3xl bg-foreground/[0.05] text-foreground/35">
        <div className="flex flex-col items-center gap-2">
          <ImageOff className="size-7" />
          <span className="text-xs">Nenhuma foto disponível</span>
        </div>
      </div>
    );
  }

  const current = images[Math.min(index, count - 1)]!;

  return (
    <>
      <div className="space-y-2">
        <div className="relative overflow-hidden rounded-3xl bg-foreground/5">
          <button
            type="button"
            onClick={() => setLightbox(true)}
            className="block w-full"
            aria-label="Ampliar foto"
          >
            <img
              src={current.url}
              alt={alt}
              className="aspect-[16/10] w-full object-cover transition-transform duration-300 hover:scale-[1.02]"
            />
          </button>
          {count > 1 && (
            <>
              <NavButton side="left" onClick={() => go(-1)} />
              <NavButton side="right" onClick={() => go(1)} />
              <span className="absolute bottom-3 right-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white">
                {index + 1}/{count}
              </span>
            </>
          )}
        </div>

        {count > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {images.map((img, i) => (
              <button
                key={img.id}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Foto ${i + 1}`}
                className={
                  "size-16 shrink-0 overflow-hidden rounded-xl border-2 transition " +
                  (i === index ? "border-primary" : "border-transparent opacity-70 hover:opacity-100")
                }
              >
                <img src={img.url} alt="" className="size-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setLightbox(false)}
        >
          <img
            src={current.url}
            alt={alt}
            className="max-h-[88vh] max-w-full rounded-2xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setLightbox(false)}
            aria-label="Fechar"
            className="absolute right-5 top-5 grid size-10 place-items-center rounded-full bg-white/15 text-white"
          >
            <X className="size-5" />
          </button>
          {count > 1 && (
            <>
              <NavButton side="left" onClick={(e) => { e.stopPropagation(); go(-1); }} />
              <NavButton side="right" onClick={(e) => { e.stopPropagation(); go(1); }} />
            </>
          )}
        </div>
      )}
    </>
  );
}

function NavButton({
  side,
  onClick,
}: {
  side: "left" | "right";
  onClick: (e: React.MouseEvent) => void;
}) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Foto anterior" : "Próxima foto"}
      className={
        "absolute top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white backdrop-blur transition hover:bg-black/65 " +
        (side === "left" ? "left-3" : "right-3")
      }
    >
      <Icon className="size-5" />
    </button>
  );
}
