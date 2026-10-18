import { useEffect, useState } from "react";
import { Trash2, X } from "lucide-react";
import { loadSummaries } from "@/lib/cordial-site/data";
import type { PublicProperty } from "@/lib/cordial-site/contract";
import { useSiteBrand } from "@/lib/cordial-site/context";
import {
  readRecentProperties,
  removeRecentProperty,
  RECENT_PROPERTIES_EVENT,
} from "@/lib/selecoes/recent-store";
import { PropertyCard } from "./PropertyCard";
import "./visitor-selection.css";

/** Local, bounded IDs only. Nothing here is included in a shared selection link. */
export function RecentProperties() {
  const brand = useSiteBrand();
  const [items, setItems] = useState<PublicProperty[]>([]);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active: AbortController | null = null;
    let disposed = false;
    async function refresh() {
      active?.abort();
      const abort = new AbortController();
      active = abort;
      const ids = readRecentProperties(brand);
      if (!ids.length) {
        setItems([]);
        return;
      }
      setFailed(false);
      try {
        const result = await loadSummaries(ids, abort.signal, brand);
        if (!disposed && !abort.signal.aborted) setItems(result.items);
      } catch {
        if (!disposed && !abort.signal.aborted) setFailed(true);
      }
    }
    void refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener(RECENT_PROPERTIES_EVENT, refresh);
    window.addEventListener(`${brand}:availability-refresh`, refresh);
    return () => {
      disposed = true;
      active?.abort();
      window.removeEventListener("storage", refresh);
      window.removeEventListener(RECENT_PROPERTIES_EVENT, refresh);
      window.removeEventListener(`${brand}:availability-refresh`, refresh);
    };
  }, [brand, retry]);
  if (!items.length && !failed) return null;
  return (
    <section className="cs-section cs-container" aria-labelledby="cs-recent-heading">
      <div className="cs-recent-head">
        <div>
          <p className="cs-eyebrow">Continue de onde parou</p>
          <h2 id="cs-recent-heading">Vistos recentemente</h2>
        </div>
        <button
          type="button"
          className="cs-recent-remove"
          onClick={() => removeRecentProperty(null, brand)}
        >
          <Trash2 size={17} /> Limpar histórico
        </button>
      </div>
      <p>
        Somente neste navegador. A disponibilidade é conferida novamente; imóveis retirados não são
        exibidos.
      </p>
      {failed && (
        <p role="alert">
          Não foi possível atualizar os imóveis vistos.{" "}
          <button type="button" onClick={() => setRetry((value) => value + 1)}>
            Tentar novamente
          </button>
        </p>
      )}
      <div className="cs-property-grid">
        {items.slice(0, 6).map((property) => (
          <div key={property.id} className="cs-selection-item">
            <PropertyCard property={property} />
            <button
              type="button"
              className="cs-recent-remove"
              onClick={() => removeRecentProperty(property.id, brand)}
            >
              <X size={16} /> Remover do histórico
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
