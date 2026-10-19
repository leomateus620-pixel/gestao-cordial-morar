import { useState } from "react";
import { Play } from "lucide-react";
import type { PublicVideo } from "@/lib/cordial-site/contract";
import { getSiteBrand } from "@/lib/cordial-site/brand";
import { useSiteBrand } from "@/lib/cordial-site/context";
import { mediaPath } from "@/lib/cordial-site/presentation";

export function PropertyVideo({ video }: { video: PublicVideo }) {
  const brand = useSiteBrand();
  const [requested, setRequested] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <section className="cs-detail-section cs-property-video">
      <h2>Conheça em vídeo</h2>
      {failed ? (
        <p role="status">
          O vídeo está temporariamente indisponível. As fotos e os detalhes continuam disponíveis.
        </p>
      ) : requested ? (
        <video
          controls
          playsInline
          preload="metadata"
          poster={video.poster ? mediaPath(video.poster, "card", brand) : undefined}
          width={video.width}
          height={video.height}
          onError={() => setFailed(true)}
        >
          <source
            src={`${getSiteBrand(brand).apiBase}/video/${video.id}/${video.version}`}
            type={video.mime}
          />
          <p>Seu navegador não suporta este vídeo.</p>
        </video>
      ) : (
        <button className="cs-button cs-button-light" onClick={() => setRequested(true)}>
          <Play size={18} /> Carregar vídeo · {Math.round(video.duration)} s
        </button>
      )}
    </section>
  );
}
