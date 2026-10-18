import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowLeft,
  ArrowRight,
  Bath,
  BedDouble,
  CarFront,
  Check,
  Copy,
  Expand,
  MapPin,
  Share2,
  X,
} from "lucide-react";
import type { PublicDetail, PublicVideo, SiteCatalog } from "@/lib/cordial-site/contract";
import {
  areaLabels,
  areaLabel,
  locationLabel,
  priceLabel,
  propertyPath,
  sitePath,
} from "@/lib/cordial-site/presentation";
import { SiteLink } from "./SiteShell";
import { getSiteBrand } from "@/lib/cordial-site/brand";
import { WhatsAppIcon } from "./SocialIcons";
import { useSite, useSiteBrand } from "@/lib/cordial-site/context";
import { FavoriteButton, PropertyCard, PropertyImage } from "./PropertyCard";
import { ContactForm } from "./ContactForm";
import { loadCatalog, loadVideos } from "@/lib/cordial-site/data";
import {
  photoIndexFromHash,
  propertyUrl,
  propertyWhatsapp,
  readSearchOrigin,
  readSearchOriginContext,
  trackSiteEvent,
} from "@/lib/cordial-site/experience";
import { rememberPublicProperty } from "@/lib/selecoes/recent-store";
import { VisitorSelectionButton } from "./VisitorSelectionButton";
import { PropertyVideo } from "./PropertyVideo";
import { PropertyTour } from "./PropertyTour";
import { PropertyShare } from "./PropertyShare";
export function DetailPage({
  property: p,
  related,
}: {
  property: PublicDetail;
  related: SiteCatalog | null;
}) {
  const { settings, canonicalOrigin } = useSite();
  const brand = useSiteBrand();
  const config = getSiteBrand(brand);
  const [index, setIndex] = useState(0);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [recommendations, setRecommendations] = useState(related);
  const [returnTo, setReturnTo] = useState(sitePath("/buscar", brand));
  const [contactOpen, setContactOpen] = useState(false);
  const [videos, setVideos] = useState<PublicVideo[]>([]);
  const galleryTrigger = useRef<HTMLButtonElement | null>(null);
  const touch = useRef<number | null>(null);
  const shareRef = useRef<HTMLInputElement>(null);
  const [previewOrigin, setPreviewOrigin] = useState<string | null>(null);
  useEffect(() => {
    if (!canonicalOrigin) setPreviewOrigin(window.location.origin);
  }, [canonicalOrigin]);
  useEffect(() => {
    setReturnTo(readSearchOrigin(p.id, brand));
    if (brand !== "cordial") return;
    rememberPublicProperty(p.id, brand);
    trackSiteEvent("property_open", { propertyId: p.id, reference: p.reference, source: "detail" });
  }, [p.id, p.city, p.type, p.operation, p.reference, brand]);
  useEffect(() => {
    if (brand === "morar") setRecommendations(related);
  }, [brand, related]);
  useEffect(() => {
    if (brand !== "cordial") return;
    let abort: AbortController;
    const refresh = () => {
      abort?.abort();
      const current = new AbortController();
      abort = current;
      setRecommendations(null);
      setVideos([]);
      loadCatalog(
        { cidade: p.city ?? undefined, tipo: p.type ?? undefined, finalidade: p.operation },
        current.signal,
        brand,
      )
        .then((result) => {
          if (!current.signal.aborted) setRecommendations(result);
        })
        .catch(() => {});
      loadVideos(p.id, current.signal, brand)
        .then((result) => {
          if (!current.signal.aborted) setVideos(result);
        })
        .catch(() => {});
    };
    refresh();
    window.addEventListener(`${brand}:availability-refresh`, refresh);
    return () => {
      abort?.abort();
      window.removeEventListener(`${brand}:availability-refresh`, refresh);
    };
  }, [p.id, p.city, p.type, p.operation, brand]);
  useEffect(() => {
    setIndex((i) => (i < p.images.length ? i : 0));
    if (!p.images.length) setOpen(false);
  }, [p.images.length]);
  useEffect(() => {
    const initial = photoIndexFromHash(window.location.hash, p.images.length) ?? 0;
    setIndex(initial);
    setPreviewIndex(initial);
    const restorePhoto = () => {
      const requested = photoIndexFromHash(window.location.hash, p.images.length);
      if (requested !== null) {
        setIndex(requested);
        setPreviewIndex(requested);
      }
    };
    window.addEventListener("hashchange", restorePhoto);
    return () => window.removeEventListener("hashchange", restorePhoto);
  }, [p.id, p.images.length]);
  const move = (n: number) =>
    setIndex((i) => (p.images.length ? (i + n + p.images.length) % p.images.length : 0));
  const url = propertyUrl(p, canonicalOrigin ?? previewOrigin ?? "", brand);
  const whatsapp = propertyWhatsapp(p, settings.whatsapp, url);
  return (
    <>
      <div className="cs-container cs-detail-page">
        <nav className="cs-breadcrumb" aria-label="Caminho">
          <SiteLink to={sitePath("/", brand)}>Início</SiteLink>
          <span>/</span>
          <SiteLink to={sitePath("/buscar", brand)}>Imóveis</SiteLink>
          <span>/</span>
          <span>Ref. {p.reference}</span>
        </nav>
        <div className="cs-detail-top">
          <SiteLink
            className="cs-text-link"
            to={returnTo}
            onClick={(event) => {
              if (
                brand === "cordial" &&
                readSearchOriginContext(p.id, brand) &&
                event.button === 0 &&
                !event.ctrlKey &&
                !event.metaKey &&
                !event.shiftKey &&
                !event.altKey &&
                (!event.currentTarget.target || event.currentTarget.target === "_self")
              ) {
                event.preventDefault();
                window.history.back();
              }
            }}
          >
            <ArrowLeft size={17} />
            Voltar à busca
          </SiteLink>
          <div>
            <button
              className="cs-text-link"
              aria-label="Copiar link do imóvel"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(url);
                  setMessage("Link copiado.");
                } catch {
                  setMessage("Copie o endereço abaixo para compartilhar.");
                }
              }}
            >
              <Copy size={17} />
              <span>Copiar link</span>
            </button>
            {brand === "cordial" ? (
              <PropertyShare url={url} />
            ) : (
              <button
                className="cs-text-link"
                onClick={async () => {
                  try {
                    if (navigator.share)
                      await navigator.share({
                        title: `${p.type ?? "Imóvel"} · ${config.shortName} ${p.reference}`,
                        url,
                      });
                    else {
                      await navigator.clipboard.writeText(url);
                      setMessage("Link copiado.");
                    }
                  } catch (error) {
                    if (error instanceof Error && error.name === "AbortError") return;
                    setMessage("Copie o endereço abaixo para compartilhar.");
                  }
                }}
              >
                <Share2 size={17} />
                Compartilhar
              </button>
            )}
            <FavoriteButton id={p.id} />
            {brand === "cordial" && <VisitorSelectionButton id={p.id} />}
          </div>
        </div>
        {message && (
          <div className="cs-share-feedback" role="status">
            <span>{message}</span>
            {!message.includes("copiado") && (
              <input
                ref={shareRef}
                readOnly
                value={url}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="Link do imóvel"
              />
            )}
          </div>
        )}
        {brand === "cordial" && (
          <div className="cs-detail-essentials">
            <div>
              <p className="cs-eyebrow">
                {p.operation === "venda" ? "À venda" : "Para alugar"} · REF {p.reference}
              </p>
              <h1>
                {p.type ?? "Imóvel"}
                {p.district ? ` em ${p.district}` : ""}
              </h1>
              <p>{locationLabel({ ...p, district: null })}</p>
            </div>
            <div>
              <strong>{priceLabel(p)}</strong>
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
                      source: "detail_top",
                    })
                  }
                >
                  <WhatsAppIcon width={18} height={18} /> Conversar
                </a>
              ) : (
                <a className="cs-button cs-button-light" href="#fale-sobre-imovel">
                  Ver atendimento
                </a>
              )}
            </div>
          </div>
        )}
        <div className="cs-gallery">
          {p.images.length ? (
            Array.from({ length: Math.min(p.images.length, 3) }, (_, tile) => {
              // Keep the approved array order; an explicit #foto-N starts this window at N.
              const i = brand === "cordial" ? (previewIndex + tile) % p.images.length : tile;
              const m = p.images[i];
              return (
                <button
                  key={m.id}
                  className={`cs-gallery-tile cs-gallery-tile-${tile}`}
                  onClick={(e) => {
                    galleryTrigger.current = e.currentTarget;
                    setIndex(i);
                    setOpen(true);
                    if (brand === "cordial")
                      trackSiteEvent("gallery_open", {
                        propertyId: p.id,
                        reference: p.reference,
                        source: "detail",
                      });
                  }}
                  aria-label={`Ampliar foto ${i + 1} de ${p.images.length}`}
                >
                  <PropertyImage
                    media={m}
                    alt={`Foto ${i + 1} do imóvel ${p.reference}`}
                    size={tile === 0 ? "full" : "card"}
                    priority={tile === 0}
                  />
                  {tile === 0 && (
                    <span className="cs-gallery-count">
                      <Expand size={16} />
                      Ver {p.images.length} fotos
                    </span>
                  )}
                </button>
              );
            })
          ) : (
            <PropertyImage media={null} alt="" />
          )}
        </div>
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className={`${config.themeClass} cs-dialog-overlay`} />
            <Dialog.Content
              className={`${config.themeClass} cs-lightbox`}
              onCloseAutoFocus={(e) => {
                e.preventDefault();
                galleryTrigger.current?.focus();
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight") {
                  e.preventDefault();
                  move(1);
                }
                if (e.key === "ArrowLeft") {
                  e.preventDefault();
                  move(-1);
                }
              }}
              onPointerDown={(e) => {
                if (e.pointerType === "touch") touch.current = e.clientX;
              }}
              onPointerUp={(e) => {
                if (touch.current != null && Math.abs(e.clientX - touch.current) > 50)
                  move(e.clientX < touch.current ? 1 : -1);
                touch.current = null;
              }}
              onPointerCancel={() => {
                touch.current = null;
              }}
            >
              <Dialog.Title>Imóvel {p.reference} · Galeria</Dialog.Title>
              <Dialog.Description>
                Use as setas do teclado ou deslize para navegar. Escape fecha a galeria.
              </Dialog.Description>
              <Dialog.Close className="cs-icon-button cs-dialog-close" aria-label="Fechar galeria">
                <X />
              </Dialog.Close>
              <div className="cs-lightbox-stage">
                <button
                  className="cs-icon-button"
                  onClick={() => move(-1)}
                  aria-label="Foto anterior"
                >
                  <ArrowLeft />
                </button>
                {p.images[index] && (
                  <PropertyImage
                    key={p.images[index].id}
                    media={p.images[index]}
                    alt={`Foto ${index + 1} do imóvel ${p.reference}`}
                    size="full"
                    priority
                  />
                )}
                <button
                  className="cs-icon-button"
                  onClick={() => move(1)}
                  aria-label="Próxima foto"
                >
                  <ArrowRight />
                </button>
              </div>
              <p className="cs-photo-counter" aria-live="polite">
                {index + 1} / {p.images.length}
              </p>
              <div className="cs-thumbnails">
                {p.images.map((m, i) =>
                  Math.abs(i - index) <= 3 ? (
                    <button
                      aria-label={`Ver foto ${i + 1}`}
                      aria-current={index === i ? "true" : undefined}
                      key={m.id}
                      onClick={() => setIndex(i)}
                    >
                      <PropertyImage media={m} alt="" size="thumb" />
                    </button>
                  ) : null,
                )}
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
        <div className="cs-detail-layout">
          <div>
            <div
              className={`cs-detail-title ${brand === "cordial" ? "cs-detail-secondary-title" : ""}`}
            >
              <p className="cs-eyebrow">
                {p.operation === "venda" ? "À venda" : "Para alugar"} · Referência {p.reference}
              </p>
              <h1>
                {p.type ?? "Imóvel"}
                {p.district ? ` em ${p.district}` : ""}
              </h1>
              <p className="cs-detail-location">
                <MapPin size={18} />
                {locationLabel(p) || "Localização sob consulta"}
              </p>
              {brand === "morar" && p.address && <p>{p.address}</p>}
              <strong className="cs-detail-price">{priceLabel(p)}</strong>
            </div>
            <div className="cs-detail-attributes">
              {[
                [BedDouble, p.bedrooms, p.bedrooms === 1 ? "Dormitório" : "Dormitórios"],
                [Bath, p.bathrooms, p.bathrooms === 1 ? "Banheiro" : "Banheiros"],
                [BedDouble, p.suites, p.suites === 1 ? "Suíte" : "Suítes"],
                [CarFront, p.parking, p.parking === 1 ? "Vaga" : "Vagas"],
              ].map(([Icon, value, label]) => {
                const I = Icon as typeof Bath;
                return value != null && (brand === "morar" || Number(value) > 0) ? (
                  <div key={String(label)}>
                    <I size={26} strokeWidth={1.4} />
                    <strong>{String(value)}</strong>
                    <span>{String(label)}</span>
                  </div>
                ) : null;
              })}
            </div>
            {Object.values(p.areas).some((v) => v != null) && (
              <section className="cs-detail-section">
                <h2>Espaço para seus planos.</h2>
                <dl className="cs-area-grid">
                  {Object.entries(p.areas)
                    .filter(([, v]) => v != null)
                    .map(([k, v]) => (
                      <div key={k}>
                        <dt>{areaLabels[k as keyof typeof areaLabels]}</dt>
                        <dd>{areaLabel(v!)}</dd>
                      </div>
                    ))}
                </dl>
              </section>
            )}
            {brand === "cordial" &&
              videos.map((video) => <PropertyVideo key={video.id} video={video} />)}
            <PropertyTour key={p.id} publicId={p.id} available={p.hasTour} />
            <section className="cs-detail-section">
              <p className="cs-eyebrow">Conheça os detalhes</p>
              <h2>Um pouco mais sobre este imóvel.</h2>
              <div className="cs-prose">
                {(
                  p.description ||
                  "A descrição deste imóvel ainda não foi disponibilizada. Nossa equipe pode ajudar com mais informações."
                )
                  .split(/\n\s*\n|\n/)
                  .filter(Boolean)
                  .map((paragraph, i) => (
                    <p key={i}>{paragraph}</p>
                  ))}
              </div>
            </section>
            {(p.features.length > 0 ||
              p.furnished != null ||
              p.financing != null ||
              p.exchange != null) && (
              <section className="cs-detail-section">
                <h2>Características</h2>
                <ul className="cs-features">
                  {[
                    ...p.features,
                    ...(p.furnished === true ? ["Mobiliado"] : []),
                    ...(p.financing === true ? ["Aceita financiamento"] : []),
                    ...(p.exchange === true ? ["Aceita permuta"] : []),
                  ].map((f, i) => (
                    <li key={`${f}-${i}`}>
                      <Check size={17} />
                      {f}
                    </li>
                  ))}
                </ul>
                {p.stage && <p>Estágio: {p.stage}</p>}
              </section>
            )}
          </div>
          <aside id="fale-sobre-imovel" className="cs-detail-contact">
            <div className="cs-contact-panel">
              <p className="cs-eyebrow">Gostou deste lugar?</p>
              <h2>{p.responsible?.name ?? `Equipe ${config.shortName}`}</h2>
              {brand === "cordial" && p.responsible?.photoUrl && (
                <img
                  className="cs-responsible-photo"
                  src={p.responsible.photoUrl}
                  alt={p.responsible.name}
                  width={64}
                  height={64}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              )}
              {p.responsible?.role && <p>{p.responsible.role}</p>}
              <p>Peça mais informações ou manifeste seu interesse em uma visita.</p>
              {whatsapp && (
                <a
                  className="cs-button"
                  href={whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() =>
                    trackSiteEvent("whatsapp_click", {
                      propertyId: p.id,
                      reference: p.reference,
                      source: "detail_contact",
                    })
                  }
                >
                  <WhatsAppIcon width={20} height={20} />
                  Conversar pelo WhatsApp
                </a>
              )}
              {!whatsapp && (
                <p className="cs-channel-status">
                  O canal comercial deste imóvel ainda não foi publicado.
                </p>
              )}
              {brand === "morar" ? (
                <ContactForm kind="interesse" property={p} />
              ) : (
                <>
                  <Dialog.Root open={contactOpen} onOpenChange={setContactOpen}>
                    <Dialog.Trigger className="cs-button cs-button-light">
                      Prefiro enviar uma mensagem
                    </Dialog.Trigger>
                    <Dialog.Portal>
                      <Dialog.Overlay className={`${config.themeClass} cs-dialog-overlay`} />
                      <Dialog.Content
                        className={`${config.themeClass} cs-drawer cs-contact-drawer`}
                      >
                        <Dialog.Title>Mensagem sobre REF {p.reference}</Dialog.Title>
                        <Dialog.Description>
                          Recebida pela equipe para triagem e distribuição. Uma solicitação de
                          visita ainda precisa de confirmação.
                        </Dialog.Description>
                        <Dialog.Close
                          className="cs-icon-button cs-dialog-close"
                          aria-label="Fechar formulário"
                        >
                          <X />
                        </Dialog.Close>
                        <ContactForm kind="interesse" property={p} />
                      </Dialog.Content>
                    </Dialog.Portal>
                  </Dialog.Root>
                </>
              )}
            </div>
          </aside>
        </div>
        {recommendations && recommendations.items.filter((x) => x.id !== p.id).length > 0 && (
          <section className="cs-section">
            <div className="cs-section-heading">
              <div>
                <p className="cs-eyebrow">Continue explorando</p>
                <h2>Outros imóveis para conhecer.</h2>
                <p>Mesma finalidade, cidade e tipo, quando informados.</p>
              </div>
            </div>
            <div className="cs-property-grid">
              {recommendations.items
                .filter((x) => x.id !== p.id)
                .slice(0, 3)
                .map((x) => (
                  <PropertyCard key={x.id} property={x} />
                ))}
            </div>
          </section>
        )}
      </div>
      <div className="cs-mobile-contact">
        <strong>{priceLabel(p)}</strong>
        <a
          className="cs-button"
          href={whatsapp ?? "#fale-sobre-imovel"}
          target={whatsapp ? "_blank" : undefined}
          rel={whatsapp ? "noopener noreferrer" : undefined}
          onClick={() => {
            if (whatsapp)
              trackSiteEvent("whatsapp_click", {
                propertyId: p.id,
                reference: p.reference,
                source: "detail_mobile",
              });
          }}
        >
          {whatsapp ? "WhatsApp" : "Atendimento"} <ArrowRight size={18} />
        </a>
      </div>
    </>
  );
}
