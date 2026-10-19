import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Rotate3D } from "lucide-react";
import type { PublicTour } from "@/lib/cordial-site/contract";
import { loadTours } from "@/lib/cordial-site/data";
import { useSiteBrand } from "@/lib/cordial-site/context";
const PanoramaViewer = lazy(() => import("./PanoramaViewer"));

/** Public metadata and the renderer are both requested only by this explicit action. */
export function PropertyTour({ publicId, available }: { publicId: string; available?: boolean }) {
  const brand = useSiteBrand();
  const [tour, setTour] = useState<PublicTour | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  if (brand !== "cordial" || !available) return null;
  return (
    <section className="cs-detail-section cs-property-tour">
      <h2>Explore em 360°</h2>
      {tour ? (
        <Suspense fallback={<p role="status">Preparando a visualização do panorama…</p>}>
          <PanoramaViewer tour={tour} />
        </Suspense>
      ) : (
        <>
          <p>Panorama do imóvel revisado pela equipe. Explore ao arrastar ou usar os controles.</p>
          <button
            type="button"
            className="cs-button cs-button-light"
            disabled={pending}
            onClick={async () => {
              controller.current?.abort();
              const current = new AbortController();
              controller.current = current;
              setPending(true);
              setError("");
              try {
                const items = await loadTours(publicId, current.signal, brand);
                if (current.signal.aborted) return;
                if (items[0]) setTour(items[0]);
                else
                  setError(
                    "Este tour não está disponível. Você pode continuar pelas fotos do imóvel.",
                  );
              } catch {
                if (!current.signal.aborted)
                  setError(
                    "Não foi possível carregar o tour. Tente novamente ou continue pelas fotos.",
                  );
              } finally {
                if (!current.signal.aborted) setPending(false);
              }
            }}
          >
            <Rotate3D size={18} />
            {pending
              ? "Carregando tour…"
              : error
                ? "Tentar carregar o tour novamente"
                : "Carregar tour 360°"}
          </button>
          {error && <p role="status">{error}</p>}
        </>
      )}
    </section>
  );
}
