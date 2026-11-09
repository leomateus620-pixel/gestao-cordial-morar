import { ChevronLeft, ChevronRight } from "lucide-react";

/** Discrete arrows + counter shared by catalog and showcase cards. */
export function CardPhotoControls({
  reference,
  index,
  count,
  switching,
  failed,
  onMove,
  onPrepare,
}: {
  reference: string;
  index: number;
  count: number;
  switching: boolean;
  failed: boolean;
  onMove: (delta: number) => void;
  onPrepare: () => void;
}) {
  return (
    <>
      <button
        type="button"
        className="cs-card-photo-prev cs-icon-button"
        aria-label={`Foto anterior do imóvel ${reference}`}
        onFocus={onPrepare}
        onClick={() => onMove(-1)}
      >
        <ChevronLeft size={19} />
      </button>
      <button
        type="button"
        className="cs-card-photo-next cs-icon-button"
        aria-label={`Próxima foto do imóvel ${reference}`}
        onFocus={onPrepare}
        onClick={() => onMove(1)}
      >
        <ChevronRight size={19} />
      </button>
      <span
        className={`cs-card-photo-count ${switching ? "is-switching" : ""}`}
        role="status"
        aria-live="polite"
      >
        {failed ? "Falhou · toque na seta" : `${index + 1} / ${count}`}
      </span>
    </>
  );
}
