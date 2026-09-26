import { useEffect, useState } from "react";
import { Bath, BedDouble, CarFront, Heart, ArrowUpRight, ImageOff } from "lucide-react";
import type { PublicProperty, PublicMedia } from "@/lib/cordial-site/contract";
import {
  propertyPath,
  mediaPath,
  priceLabel,
  locationLabel,
  areaLabel,
  areaLabels,
} from "@/lib/cordial-site/presentation";
import { SiteLink } from "./SiteShell";
import { KEY, readFavorites } from "@/lib/cordial-site/favorites";
export function FavoriteButton({ id }: { id: string }) {
  const [active, setActive] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const sync = () => setActive(readFavorites().includes(id));
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("cordial-favorites", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("cordial-favorites", sync);
    };
  }, [id]);
  return (
    <>
      <button
        className={`cs-favorite ${active ? "is-active" : ""}`}
        aria-label={active ? "Remover dos favoritos" : "Salvar nos favoritos"}
        aria-pressed={active}
        onClick={() => {
          const old = readFavorites();
          const next = old.includes(id) ? old.filter((x) => x !== id) : [...old, id].slice(-100);
          try {
            localStorage.setItem(KEY, JSON.stringify(next));
            setActive(next.includes(id));
            window.dispatchEvent(new Event("cordial-favorites"));
          } catch {
            setMessage("Seu navegador não permitiu salvar o favorito.");
          }
        }}
      >
        <Heart size={19} fill={active ? "currentColor" : "none"} />
      </button>
      <span className="cs-sr-only" role="status">
        {message}
      </span>
    </>
  );
}
export function PropertyImage({
  media,
  alt,
  priority = false,
  size = "card",
  className = "",
}: {
  media: PublicMedia | null;
  alt: string;
  priority?: boolean;
  size?: "thumb" | "card" | "full";
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [media?.id, media?.version]);
  if (!media || failed)
    return (
      <div className={`cs-photo-fallback ${className}`}>
        <ImageOff size={28} />
        <span>{failed ? "Foto temporariamente indisponível" : "Fotos ainda não disponíveis"}</span>
      </div>
    );
  return (
    <img
      className={className}
      src={mediaPath(media, size)}
      srcSet={
        size === "thumb"
          ? undefined
          : `${mediaPath(media, "thumb")} 480w, ${mediaPath(media, "card")} 960w, ${mediaPath(media, "full")} 1920w`
      }
      sizes={
        size === "full"
          ? "(max-width: 768px) 100vw, 80vw"
          : "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
      }
      width={media.width ?? 960}
      height={media.height ?? 640}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      decoding="async"
      alt={alt}
      onError={() => setFailed(true)}
    />
  );
}
export function PropertyCard({
  property: p,
  priority = false,
}: {
  property: PublicProperty;
  priority?: boolean;
}) {
  const area = (["construida", "util", "terreno", "total"] as const).find(
    (k) => p.areas[k] != null,
  );
  return (
    <article className="cs-property-card">
      <div className="cs-card-photo">
        <SiteLink
          to={propertyPath(p)}
          aria-label={`Ver ${p.type ?? "imóvel"}, referência ${p.reference}`}
        >
          <PropertyImage
            media={p.cover}
            alt={`${p.type ?? "Imóvel"} — referência ${p.reference}`}
            priority={priority}
          />
        </SiteLink>
        <span className="cs-operation">{p.operation === "venda" ? "À venda" : "Para alugar"}</span>
        <FavoriteButton id={p.id} />
      </div>
      <div className="cs-card-content">
        <div className="cs-card-reference">
          REF. {p.reference}
          {p.featured && <span>Seleção Cordial</span>}
        </div>
        <h3>
          <SiteLink to={propertyPath(p)}>
            {p.type ?? "Imóvel"}
            {p.district ? ` em ${p.district}` : ""}
          </SiteLink>
        </h3>
        <p className="cs-card-location">
          {locationLabel({ ...p, district: null }) || "Localização sob consulta"}
        </p>
        <div className="cs-card-attributes">
          {p.bedrooms != null && (
            <span>
              <BedDouble size={17} />
              {p.bedrooms} <span className="cs-sr-only">dormitórios</span>
            </span>
          )}
          {p.bathrooms != null && (
            <span>
              <Bath size={17} />
              {p.bathrooms}
              <span className="cs-sr-only">banheiros</span>
            </span>
          )}
          {p.parking != null && (
            <span>
              <CarFront size={17} />
              {p.parking}
              <span className="cs-sr-only">vagas</span>
            </span>
          )}
          {area && (
            <span className="cs-card-area">
              {areaLabel(p.areas[area]!)}
              <small>{areaLabels[area]}</small>
            </span>
          )}
        </div>
        <div className="cs-card-bottom">
          <strong>{priceLabel(p)}</strong>
          <SiteLink
            className="cs-card-arrow"
            to={propertyPath(p)}
            aria-label={`Conhecer imóvel ${p.reference}`}
          >
            <ArrowUpRight size={23} />
          </SiteLink>
        </div>
      </div>
    </article>
  );
}
