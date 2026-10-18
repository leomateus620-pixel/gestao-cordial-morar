import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bath,
  BedDouble,
  CarFront,
  Heart,
  ArrowUpRight,
  ImageOff,
  ChevronLeft,
  ChevronRight,
  ScanEye,
} from "lucide-react";
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
import { getSiteBrand } from "@/lib/cordial-site/brand";
import { useSite, useSiteBrand } from "@/lib/cordial-site/context";
import { readFavorites } from "@/lib/cordial-site/favorites";
import { requestCardGallery } from "@/lib/cordial-site/card-gallery";
import { propertyUrl, propertyWhatsapp, trackSiteEvent } from "@/lib/cordial-site/experience";
import { QuickView } from "./QuickView";
import { VisitorSelectionButton } from "./VisitorSelectionButton";
import { WhatsAppIcon } from "./SocialIcons";
export function FavoriteButton({ id }: { id: string }) {
  const brand = useSiteBrand();
  const config = getSiteBrand(brand);
  const [active, setActive] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const sync = () => setActive(readFavorites(brand).includes(id));
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(config.favoritesEvent, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(config.favoritesEvent, sync);
    };
  }, [id, brand, config.favoritesEvent]);
  return (
    <>
      <button
        className={`cs-favorite ${active ? "is-active" : ""}`}
        aria-label={active ? "Remover dos favoritos" : "Salvar nos favoritos"}
        aria-pressed={active}
        onClick={() => {
          const old = readFavorites(brand);
          const next = old.includes(id) ? old.filter((x) => x !== id) : [...old, id].slice(-100);
          try {
            localStorage.setItem(config.favoritesKey, JSON.stringify(next));
            setActive(next.includes(id));
            window.dispatchEvent(new Event(config.favoritesEvent));
            if (brand === "cordial")
              trackSiteEvent("favorite_changed", { propertyId: id, active: next.includes(id) });
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
  const brand = useSiteBrand();
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [media?.id, media?.version]);
  if (!media || failed)
    return (
      <div className={`cs-photo-fallback ${className}`}>
        <ImageOff size={28} />
        <span>{failed ? "Foto temporariamente indisponível" : "Fotos ainda não disponíveis"}</span>
      </div>
    );
  return (
    <img
      className={`${className} ${loaded ? "is-photo-ready" : "is-photo-loading"}`}
      src={mediaPath(media, size, brand)}
      srcSet={
        size === "thumb"
          ? undefined
          : `${mediaPath(media, "thumb", brand)} 480w, ${mediaPath(media, "card", brand)} 960w, ${mediaPath(media, "full", brand)} 1920w`
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
      onLoad={() => setLoaded(true)}
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
  const brand = useSiteBrand();
  const config = getSiteBrand(brand);
  const site = useSite();
  const [images, setImages] = useState<PublicMedia[]>(p.cover ? [p.cover] : []);
  const [index, setIndex] = useState(0);
  const [galleryState, setGalleryState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [quick, setQuick] = useState(false);
  const [resuming, setResuming] = useState(false);
  const openedHere = useRef(false);
  const quickOriginScroll = useRef(0);
  const quickPhoto = useRef(0);
  const [origin, setOrigin] = useState(site.canonicalOrigin ?? "");
  const touch = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const alive = useRef(true);
  const quickTrigger = useRef<HTMLButtonElement | null>(null);
  const request = useRef<{ key: string; promise: Promise<PublicMedia[]> } | null>(null);
  const galleryKey = `${brand}:${p.id}:${p.cover?.id ?? "no-cover"}:${p.cover?.version ?? ""}`;
  const currentGalleryKey = useRef(galleryKey);
  const resetGalleryKey = useRef<string | null>(null);
  currentGalleryKey.current = galleryKey;
  const closeQuick = useCallback(() => setQuick(false), []);
  useEffect(() => {
    alive.current = true;
    setOrigin(site.canonicalOrigin ?? location.origin);
    return () => {
      alive.current = false;
    };
  }, [site.canonicalOrigin]);
  useEffect(() => {
    if (resetGalleryKey.current === galleryKey) return;
    resetGalleryKey.current = galleryKey;
    setImages(p.cover ? [p.cover] : []);
    setIndex(0);
    setGalleryState("idle");
  }, [galleryKey, p.cover]);
  const ensurePhotos = useCallback(async () => {
    if (request.current?.key === galleryKey) return request.current.promise;
    if (galleryState === "ready") return images;
    setGalleryState("loading");
    const capturedKey = galleryKey;
    const promise = (async () => {
      try {
        const photos = await requestCardGallery(p.id, brand);
        if (alive.current && currentGalleryKey.current === capturedKey) {
          setImages(photos);
          setGalleryState("ready");
        }
        return photos;
      } catch {
        if (alive.current && currentGalleryKey.current === capturedKey) setGalleryState("error");
        return images;
      } finally {
        if (request.current?.key === capturedKey) request.current = null;
      }
    })();
    request.current = { key: capturedKey, promise };
    return promise;
  }, [brand, p.id, galleryKey, galleryState, images]);
  useEffect(() => {
    if (brand !== "cordial") return;
    const resume = () => {
      if (
        !quick &&
        openedHere.current &&
        history.state?.cordialSurface === p.id &&
        typeof history.state?.cordialSurfaceKey === "string" &&
        [`#previa-${p.id}`, `#galeria-${p.id}`].includes(location.hash)
      ) {
        setResuming(true);
        setQuick(true);
        void ensurePhotos();
      }
    };
    window.addEventListener("popstate", resume);
    return () => window.removeEventListener("popstate", resume);
  }, [brand, p.id, quick, ensurePhotos]);
  const move = async (delta: number) => {
    const capturedKey = galleryKey;
    const photos = await ensurePhotos();
    if (alive.current && currentGalleryKey.current === capturedKey && photos.length)
      setIndex((i) => (i + delta + photos.length) % photos.length);
  };
  const whatsapp = propertyWhatsapp(p, site.settings.whatsapp, propertyUrl(p, origin, brand));
  const area = (["construida", "util", "terreno", "total"] as const).find(
    (k) => p.areas[k] != null,
  );
  return (
    <article className="cs-property-card">
      <div
        className="cs-card-photo"
        style={brand === "cordial" ? { touchAction: "pan-y" } : undefined}
        onClickCapture={(e) => {
          if (swiped.current) {
            if (e.detail !== 0) {
              e.preventDefault();
              e.stopPropagation();
            }
            swiped.current = false;
          }
        }}
        onPointerDown={(e) => {
          if (
            brand === "cordial" &&
            e.pointerType === "touch" &&
            !(e.target instanceof Element && e.target.closest("button"))
          ) {
            touch.current = { x: e.clientX, y: e.clientY };
            swiped.current = false;
          }
        }}
        onPointerUp={(e) => {
          const start = touch.current;
          touch.current = null;
          if (
            start &&
            Math.abs(e.clientX - start.x) > 45 &&
            Math.abs(e.clientX - start.x) > Math.abs(e.clientY - start.y) * 1.4
          ) {
            swiped.current = true;
            void move(e.clientX < start.x ? 1 : -1);
          }
        }}
        onPointerCancel={() => {
          touch.current = null;
        }}
      >
        <SiteLink
          to={propertyPath(p, brand)}
          aria-label={`Ver ${p.type ?? "imóvel"}, referência ${p.reference}`}
          onClick={(e) => {
            if (swiped.current) {
              e.preventDefault();
              swiped.current = false;
            }
          }}
        >
          <PropertyImage
            media={images[index] ?? p.cover}
            alt={`${p.type ?? "Imóvel"} — referência ${p.reference}`}
            priority={priority}
          />
        </SiteLink>
        <span className="cs-operation">{p.operation === "venda" ? "À venda" : "Para alugar"}</span>
        <FavoriteButton id={p.id} />
        {brand === "cordial" && p.photoCount > 1 && (
          <>
            <button
              className="cs-card-photo-prev cs-icon-button"
              aria-label={`Foto anterior do imóvel ${p.reference}`}
              onClick={() => void move(-1)}
            >
              <ChevronLeft size={19} />
            </button>
            <button
              className="cs-card-photo-next cs-icon-button"
              aria-label={`Próxima foto do imóvel ${p.reference}`}
              onClick={() => void move(1)}
            >
              <ChevronRight size={19} />
            </button>
            <span className="cs-card-photo-count" role="status">
              {galleryState === "loading"
                ? "Carregando fotos…"
                : galleryState === "error"
                  ? "Tentar novamente nas setas"
                  : `${index + 1} / ${p.photoCount}`}
            </span>
          </>
        )}
      </div>
      <div className="cs-card-content">
        <div className="cs-card-reference">
          REF. {p.reference}
          {p.featured && (
            <span>
              {brand === "cordial" ? "Destaque" : "Seleção"} {config.shortName}
            </span>
          )}
        </div>
        {brand === "cordial" && <strong className="cs-card-price">{priceLabel(p)}</strong>}
        <h3>
          <SiteLink to={propertyPath(p, brand)}>
            {p.type ?? "Imóvel"}
            {p.district ? ` em ${p.district}` : ""}
          </SiteLink>
        </h3>
        <p className="cs-card-location">
          {locationLabel({ ...p, district: null }) || "Localização sob consulta"}
        </p>
        <div className="cs-card-attributes">
          {p.bedrooms != null && (brand === "morar" || p.bedrooms > 0) && (
            <span>
              <BedDouble size={17} />
              {p.bedrooms}{" "}
              <span className="cs-sr-only">{p.bedrooms === 1 ? "dormitório" : "dormitórios"}</span>
            </span>
          )}
          {p.bathrooms != null && (brand === "morar" || p.bathrooms > 0) && (
            <span>
              <Bath size={17} />
              {p.bathrooms}
              <span className="cs-sr-only">{p.bathrooms === 1 ? "banheiro" : "banheiros"}</span>
            </span>
          )}
          {p.parking != null && (brand === "morar" || p.parking > 0) && (
            <span>
              <CarFront size={17} />
              {p.parking}
              <span className="cs-sr-only">{p.parking === 1 ? "vaga" : "vagas"}</span>
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
          {brand === "morar" && <strong>{priceLabel(p)}</strong>}
          <SiteLink
            className="cs-card-arrow"
            to={propertyPath(p, brand)}
            aria-label={`Conhecer imóvel ${p.reference}`}
          >
            {brand === "cordial" && <span>Ver detalhes</span>}
            <ArrowUpRight size={19} />
          </SiteLink>
        </div>
        {brand === "cordial" && (
          <div className="cs-card-actions">
            <button
              className="cs-card-preview"
              onClick={(e) => {
                quickTrigger.current = e.currentTarget;
                openedHere.current = true;
                quickOriginScroll.current = window.scrollY;
                quickPhoto.current = index;
                setResuming(false);
                setQuick(true);
                void ensurePhotos();
              }}
            >
              <ScanEye size={17} /> Visualização rápida
            </button>
            <VisitorSelectionButton id={p.id} />
            {whatsapp && (
              <a
                className="cs-card-whatsapp"
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() =>
                  trackSiteEvent("whatsapp_click", {
                    propertyId: p.id,
                    reference: p.reference,
                    source: "card",
                  })
                }
              >
                <WhatsAppIcon width={16} height={16} /> WhatsApp
              </a>
            )}
          </div>
        )}
      </div>
      {quick && (
        <QuickView
          property={p}
          images={images}
          initialIndex={resuming ? quickPhoto.current : index}
          resume={resuming}
          originScrollTop={quickOriginScroll.current}
          onIndexChange={(value) => {
            quickPhoto.current = value;
          }}
          onClose={closeQuick}
          returnFocus={quickTrigger.current}
          loading={galleryState === "loading"}
          failed={galleryState === "error"}
          onRetry={() => {
            void ensurePhotos();
          }}
        />
      )}
    </article>
  );
}
