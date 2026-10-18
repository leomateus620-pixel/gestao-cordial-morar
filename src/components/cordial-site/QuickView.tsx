import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Expand, X } from "lucide-react";
import type { PublicMedia, PublicProperty } from "@/lib/cordial-site/contract";
import {
  areaLabel,
  areaLabels,
  locationLabel,
  priceLabel,
  propertyPath,
} from "@/lib/cordial-site/presentation";
import { useSite, useSiteBrand } from "@/lib/cordial-site/context";
import { getSiteBrand } from "@/lib/cordial-site/brand";
import { propertyUrl, propertyWhatsapp, trackSiteEvent } from "@/lib/cordial-site/experience";
import { PropertyImage } from "./PropertyCard";
import { SiteLink } from "./SiteShell";
import { WhatsAppIcon } from "./SocialIcons";

export function QuickView({
  property: p,
  images,
  initialIndex = 0,
  onClose,
  returnFocus,
  resume = false,
  originScrollTop,
  onIndexChange,
  loading = false,
  failed = false,
  onRetry,
}: {
  property: PublicProperty;
  images: PublicMedia[];
  initialIndex?: number;
  onClose: () => void;
  returnFocus?: HTMLElement | null;
  resume?: boolean;
  originScrollTop?: number;
  onIndexChange?: (index: number) => void;
  loading?: boolean;
  failed?: boolean;
  onRetry?: () => void;
}) {
  const site = useSite();
  const brand = useSiteBrand();
  const config = getSiteBrand(brand);
  const router = useRouter();
  const [surface, setSurface] = useState<"preview" | "gallery">(
    resume && location.hash === `#galeria-${p.id}` ? "gallery" : "preview",
  );
  const [index, setIndex] = useState(initialIndex);
  const expand = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const gesture = useRef<{ x: number; y: number } | null>(null);
  const [origin, setOrigin] = useState(site.canonicalOrigin ?? "");
  const [copyState, setCopyState] = useState("");
  const originalFocus = useRef<HTMLElement | null>(returnFocus ?? null);
  const previousUrl = useRef("");
  const historyDepth = useRef(resume ? (surface === "gallery" ? 2 : 1) : 0);
  const historyKey = useRef<string | null>(
    resume ? (history.state?.cordialSurfaceKey ?? null) : null,
  );
  useEffect(() => {
    setOrigin(site.canonicalOrigin ?? location.origin);
    previousUrl.current = location.pathname + location.search;
    // React's development effect replay must not create a second history entry.
    // A per-opening key also distinguishes a stale hash from this active surface.
    if (!historyKey.current) {
      historyKey.current = crypto.randomUUID();
      void router.navigate({
        search: true,
        hash: `previa-${p.id}`,
        state: (current) => ({
          ...current,
          cordialSurface: p.id,
          cordialSurfaceKey: historyKey.current,
        }),
        resetScroll: false,
        hashScrollIntoView: false,
      });
      historyDepth.current = 1;
    }
    const pop = () => {
      if (history.state?.cordialSurfaceKey !== historyKey.current) {
        historyDepth.current = 0;
        onClose();
        return;
      }
      if (location.hash === `#previa-${p.id}`) {
        historyDepth.current = 1;
        setSurface("preview");
        requestAnimationFrame(() => expand.current?.focus());
      } else if (location.hash === `#galeria-${p.id}`) {
        historyDepth.current = 2;
        setSurface("gallery");
        requestAnimationFrame(() => close.current?.focus());
      } else {
        historyDepth.current = 0;
        onClose();
      }
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, [p.id, site.canonicalOrigin, onClose, router]);
  const photos = images.length ? images : p.cover ? [p.cover] : [];
  const currentIndex = Math.min(index, Math.max(photos.length - 1, 0));
  const current = photos[currentIndex];
  useEffect(() => {
    onIndexChange?.(currentIndex);
  }, [currentIndex, onIndexChange]);
  const move = (delta: number) =>
    setIndex((i) =>
      photos.length ? (Math.min(i, photos.length - 1) + delta + photos.length) % photos.length : 0,
    );
  const leave = () => {
    if (surface === "gallery") {
      history.back();
      return;
    }
    if (historyDepth.current) history.back();
    else onClose();
  };
  const url = propertyUrl(p, origin, brand);
  const whatsapp = propertyWhatsapp(p, site.settings.whatsapp, url);
  const area = (["construida", "util", "terreno", "total"] as const).find(
    (key) => p.areas[key] != null,
  );
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) leave();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={`${config.themeClass} cs-dialog-overlay`} />
        <Dialog.Content
          className={`${config.themeClass} ${surface === "gallery" ? "cs-lightbox" : "cs-quick-view"}`}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            close.current?.focus();
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            if (originalFocus.current?.isConnected)
              originalFocus.current.focus({ preventScroll: true });
          }}
          onKeyDown={(e) => {
            if (e.target instanceof HTMLInputElement) return;
            if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
              e.preventDefault();
              move(e.key === "ArrowRight" ? 1 : -1);
            }
          }}
        >
          <Dialog.Title>
            {surface === "gallery" ? "Galeria" : "Visualização rápida"} · REF {p.reference}
          </Dialog.Title>
          <Dialog.Description>
            {surface === "gallery"
              ? "Setas para trocar fotos. Escape retorna à prévia."
              : "Examine as fotos e o resumo. A ficha completa tem todos os detalhes."}
          </Dialog.Description>
          <button
            ref={close}
            className="cs-icon-button cs-dialog-close"
            onClick={leave}
            aria-label={
              surface === "gallery" ? "Voltar à visualização rápida" : "Fechar visualização rápida"
            }
          >
            <X />
          </button>
          <div className="cs-quick-layout">
            <div
              className="cs-quick-media"
              style={{ touchAction: "pan-y" }}
              onPointerDown={(e) => {
                if (
                  e.pointerType === "touch" &&
                  !(e.target instanceof Element && e.target.closest("button"))
                )
                  gesture.current = { x: e.clientX, y: e.clientY };
              }}
              onPointerUp={(e) => {
                const start = gesture.current;
                gesture.current = null;
                if (
                  start &&
                  Math.abs(e.clientX - start.x) > 50 &&
                  Math.abs(e.clientX - start.x) > Math.abs(e.clientY - start.y) * 1.4
                )
                  move(e.clientX < start.x ? 1 : -1);
              }}
              onPointerCancel={() => {
                gesture.current = null;
              }}
            >
              <PropertyImage
                key={current?.id ?? "empty"}
                media={current ?? null}
                alt={`Foto ${currentIndex + 1} do imóvel ${p.reference}`}
                size={surface === "gallery" ? "full" : "card"}
                priority
              />
              {photos.length > 1 && (
                <div className="cs-photo-navigation">
                  <button
                    className="cs-icon-button"
                    onClick={() => move(-1)}
                    aria-label="Foto anterior"
                  >
                    <ArrowLeft />
                  </button>
                  <span aria-live="polite">
                    {currentIndex + 1} / {photos.length}
                  </span>
                  <button
                    className="cs-icon-button"
                    onClick={() => move(1)}
                    aria-label="Próxima foto"
                  >
                    <ArrowRight />
                  </button>
                </div>
              )}
              {loading && <p role="status">Carregando outras fotos…</p>}
              {failed && (
                <p role="status">
                  As outras fotos não puderam ser carregadas.{" "}
                  <button type="button" onClick={onRetry}>
                    Tentar novamente
                  </button>
                </p>
              )}
              {surface === "preview" && photos.length > 0 && (
                <button
                  ref={expand}
                  className="cs-expand-preview"
                  onClick={() => {
                    setSurface("gallery");
                    void router.navigate({
                      search: true,
                      hash: `galeria-${p.id}`,
                      state: (current) => ({
                        ...current,
                        cordialSurface: p.id,
                        cordialSurfaceKey: historyKey.current,
                      }),
                      resetScroll: false,
                      hashScrollIntoView: false,
                    });
                    historyDepth.current = 2;
                    trackSiteEvent("gallery_open", {
                      propertyId: p.id,
                      reference: p.reference,
                      source: "quick_view",
                    });
                    requestAnimationFrame(() => close.current?.focus());
                  }}
                >
                  <Expand size={17} /> Ampliar fotos
                </button>
              )}
            </div>
            {surface === "preview" && (
              <div className="cs-quick-summary">
                <p className="cs-eyebrow">
                  {p.operation === "venda" ? "À venda" : "Para alugar"} · REF {p.reference}
                </p>
                <strong className="cs-quick-price">{priceLabel(p)}</strong>
                <h2>
                  {p.type ?? "Imóvel"}
                  {p.district ? ` em ${p.district}` : ""}
                </h2>
                <p>{locationLabel({ ...p, district: null })}</p>
                <div className="cs-quick-facts">
                  {p.bedrooms != null && p.bedrooms > 0 && <span>{p.bedrooms} dormitórios</span>}
                  {area && (
                    <span>
                      {areaLabel(p.areas[area]!)} · {areaLabels[area]}
                    </span>
                  )}
                  {p.financing === true && <span>Aceita financiamento</span>}
                </div>
                {p.responsible?.photoUrl && (
                  <img
                    className="cs-responsible-photo"
                    src={p.responsible.photoUrl}
                    alt={p.responsible.name}
                    width={48}
                    height={48}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                )}
                <p className="cs-responsible-name">
                  {p.responsible?.name ?? `Equipe ${config.shortName}`}
                  {p.responsible?.role && <small>{p.responsible.role}</small>}
                </p>
                {whatsapp ? (
                  <a
                    className="cs-button"
                    href={whatsapp}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() =>
                      trackSiteEvent("whatsapp_click", {
                        propertyId: p.id,
                        reference: p.reference,
                        source: "quick_view",
                      })
                    }
                  >
                    <WhatsAppIcon width={18} height={18} /> Conversar pelo WhatsApp
                  </a>
                ) : (
                  <p className="cs-channel-status">Canal de atendimento ainda não publicado.</p>
                )}
                <SiteLink
                  className="cs-button cs-button-light"
                  to={`${propertyPath(p, brand)}#foto-${currentIndex + 1}`}
                  originScrollTop={originScrollTop}
                  onClick={(event) => {
                    if (
                      event.button === 0 &&
                      !event.ctrlKey &&
                      !event.metaKey &&
                      !event.shiftKey &&
                      !event.altKey
                    )
                      history.replaceState(
                        {
                          ...history.state,
                          cordialSurface: undefined,
                          cordialSurfaceKey: undefined,
                        },
                        "",
                        previousUrl.current,
                      );
                  }}
                >
                  Ver ficha completa <ArrowRight size={17} />
                </SiteLink>
                <button
                  className="cs-text-link"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(url);
                      setCopyState("Link copiado.");
                    } catch {
                      setCopyState(url);
                    }
                  }}
                >
                  Copiar link do imóvel
                </button>
                <span className={copyState ? "cs-share-feedback" : "cs-sr-only"} role="status">
                  {copyState}
                </span>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
