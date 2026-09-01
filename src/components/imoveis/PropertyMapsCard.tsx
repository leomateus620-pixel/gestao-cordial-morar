import { Copy, Map as MapIcon, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { mapsEmbedUrl, parseCoords } from "@/lib/imoveis/maps-link";

type Props = {
  /** Link colado pelo corretor no cadastro (uso interno). */
  mapsUrl: string | null;
  /** Coordenada já resolvida no salvamento, quando existir. */
  mapsCoords: string | null;
  /** Fallback: link montado a partir do endereço digitado. */
  fallbackUrl: string | null;
};

/**
 * Card interno de localização: mostra a prévia do ponto exato quando há link
 * salvo e, na ausência dele, mantém o atalho pelo endereço do cadastro.
 */
export function PropertyMapsCard({ mapsUrl, mapsCoords, fallbackUrl }: Props) {
  const coords = parseCoords(mapsCoords);
  const link = mapsUrl || fallbackUrl;
  if (!link) return null;

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link da localização copiado.");
    } catch {
      toast.error("Não foi possível copiar o link.");
    }
  }

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-amber-300/50 bg-background/60">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800/70">
          <MapIcon className="size-3.5" /> Localização Google Maps
        </p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={copy}
            className="inline-flex items-center gap-1.5 rounded-full bg-foreground/[0.06] px-2.5 py-1 text-[11px] font-semibold"
          >
            <Copy className="size-3" /> Copiar link
          </button>
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full bg-foreground/[0.06] px-2.5 py-1 text-[11px] font-semibold"
          >
            <ExternalLink className="size-3" /> Abrir no Google Maps
          </a>
        </div>
      </div>

      {coords ? (
        <iframe
          title="Prévia da localização no Google Maps"
          src={mapsEmbedUrl(coords)}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          className="h-56 w-full border-0"
          allowFullScreen
        />
      ) : (
        <p className="px-3 pb-3 text-xs text-foreground/50">
          {mapsUrl
            ? "Prévia indisponível para este link — abra no Google Maps pelo botão acima."
            : "Localização aproximada pelo endereço do cadastro. Cole o link do Google Maps na Etapa 2 para fixar o ponto exato."}
        </p>
      )}
    </div>
  );
}
