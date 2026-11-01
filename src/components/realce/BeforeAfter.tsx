import { useCallback, useRef, useState } from "react";
import { ChevronsLeftRight } from "lucide-react";

/** Comparador Original × Realçada com controle deslizante (toque, mouse e teclado). */
export function BeforeAfter({
  before,
  after,
  ratio,
  afterLabel,
}: {
  before: string;
  after: string;
  ratio: number;
  afterLabel: string;
}) {
  const [pos, setPos] = useState(50);
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const move = useCallback((clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    setPos(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)));
  }, []);
  return (
    <div
      ref={box}
      className="relative mx-auto w-full max-h-[70vh] touch-none select-none overflow-hidden rounded-xl bg-muted"
      style={{ aspectRatio: String(ratio), maxWidth: `calc(70vh * ${ratio})` }}
      onPointerDown={(e) => {
        dragging.current = true;
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        move(e.clientX);
      }}
      onPointerMove={(e) => dragging.current && move(e.clientX)}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
    >
      <img src={after} alt="Foto realçada" className="absolute inset-0 h-full w-full object-contain" draggable={false} />
      <img
        src={before}
        alt="Foto original"
        className="absolute inset-0 h-full w-full object-contain"
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
        draggable={false}
      />
      <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-background/85 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-foreground backdrop-blur">
        Original
      </span>
      <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-primary/90 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary-foreground backdrop-blur">
        {afterLabel}
      </span>
      <div className="pointer-events-none absolute inset-y-0" style={{ left: `${pos}%` }}>
        <div className="absolute inset-y-0 -ml-px w-0.5 bg-background shadow-[0_0_0_1px_hsl(0_0%_0%/0.15)]" />
      </div>
      <button
        type="button"
        role="slider"
        aria-label="Mover comparação"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pos)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setPos((p) => Math.max(0, p - 5));
          if (e.key === "ArrowRight") setPos((p) => Math.min(100, p + 5));
        }}
        className="absolute top-1/2 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-background text-foreground shadow-lg ring-1 ring-border"
        style={{ left: `${pos}%` }}
      >
        <ChevronsLeftRight className="h-5 w-5" />
      </button>
    </div>
  );
}
