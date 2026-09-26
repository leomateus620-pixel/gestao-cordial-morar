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
  MessageCircle,
} from "lucide-react";
import type { PublicDetail, SiteCatalog } from "@/lib/cordial-site/contract";
import {
  areaLabels,
  areaLabel,
  locationLabel,
  priceLabel,
  propertyPath,
  sitePath,
} from "@/lib/cordial-site/presentation";
import { SiteLink } from "./SiteShell";
import { useSite } from "@/lib/cordial-site/context";
import { FavoriteButton, PropertyCard, PropertyImage } from "./PropertyCard";
import { externalSitePath } from "@/lib/cordial-site/routing";
import { ContactForm } from "./ContactForm";
export function DetailPage({
  property: p,
  related,
}: {
  property: PublicDetail;
  related: SiteCatalog | null;
}) {
  const { settings, canonicalOrigin } = useSite();
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const galleryTrigger = useRef<HTMLButtonElement | null>(null);
  const touch = useRef<number | null>(null);
  const shareRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setIndex((i) => (i < p.images.length ? i : 0));
    if (!p.images.length) setOpen(false);
  }, [p.images.length]);
  const move = (n: number) =>
    setIndex((i) => (p.images.length ? (i + n + p.images.length) % p.images.length : 0));
  const url = canonicalOrigin
    ? canonicalOrigin + externalSitePath(propertyPath(p))
    : typeof location !== "undefined"
      ? location.origin + externalSitePath(propertyPath(p))
      : propertyPath(p);
  const whatsapp = settings.whatsapp
    ? `https://wa.me/${settings.whatsapp}?text=${encodeURIComponent(`Olá! Tenho interesse no imóvel ${p.reference}. ${url}`)}`
    : null;
  return (
    <>
      <div className="cs-container cs-detail-page">
        <nav className="cs-breadcrumb" aria-label="Caminho">
          <SiteLink to={sitePath("/")}>Início</SiteLink>
          <span>/</span>
          <SiteLink to={sitePath("/buscar")}>Imóveis</SiteLink>
          <span>/</span>
          <span>Ref. {p.reference}</span>
        </nav>
        <div className="cs-detail-top">
          <button
            className="cs-text-link"
            onClick={() => {
              if (history.length > 1) history.back();
              else location.assign(sitePath("/buscar"));
            }}
          >
            <ArrowLeft size={17} />
            Voltar à busca
          </button>
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
            <button
              className="cs-text-link"
              onClick={async () => {
                try {
                  if (navigator.share)
                    await navigator.share({
                      title: `${p.type ?? "Imóvel"} · Cordial ${p.reference}`,
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
            <FavoriteButton id={p.id} />
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
        <div className="cs-gallery">
          {p.images.length ? (
            p.images.slice(0, 3).map((m, i) => (
              <button
                key={m.id}
                className={`cs-gallery-tile cs-gallery-tile-${i}`}
                onClick={(e) => {
                  galleryTrigger.current = e.currentTarget;
                  setIndex(i);
                  setOpen(true);
                }}
                aria-label={`Ampliar foto ${i + 1} de ${p.images.length}`}
              >
                <PropertyImage
                  media={m}
                  alt={`Foto ${i + 1} do imóvel ${p.reference}`}
                  size={i === 0 ? "full" : "card"}
                  priority={i === 0}
                />
                {i === 0 && (
                  <span className="cs-gallery-count">
                    <Expand size={16} />
                    Ver {p.images.length} fotos
                  </span>
                )}
              </button>
            ))
          ) : (
            <PropertyImage media={null} alt="" />
          )}
        </div>
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className="cordial-site cs-dialog-overlay" />
            <Dialog.Content
              className="cordial-site cs-lightbox"
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
                {p.images.map((m, i) => (
                  <button
                    aria-label={`Ver foto ${i + 1}`}
                    aria-current={index === i ? "true" : undefined}
                    key={m.id}
                    onClick={() => setIndex(i)}
                  >
                    <PropertyImage media={m} alt="" size="thumb" />
                  </button>
                ))}
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
        <div className="cs-detail-layout">
          <div>
            <div className="cs-detail-title">
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
              {p.address && <p>{p.address}</p>}
              <strong className="cs-detail-price">{priceLabel(p)}</strong>
            </div>
            <div className="cs-detail-attributes">
              {[
                [BedDouble, p.bedrooms, "Dormitórios"],
                [Bath, p.bathrooms, "Banheiros"],
                [BedDouble, p.suites, "Suítes"],
                [CarFront, p.parking, "Vagas"],
              ].map(([Icon, value, label]) => {
                const I = Icon as typeof Bath;
                return value != null ? (
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
            <section className="cs-detail-section">
              <p className="cs-eyebrow">Conheça os detalhes</p>
              <h2>Um pouco mais sobre este imóvel.</h2>
              <div className="cs-prose">
                {p.description ||
                  "A descrição deste imóvel ainda não foi disponibilizada. Nossa equipe pode ajudar com mais informações."}
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
              <h2>Vamos conversar.</h2>
              <p>Peça mais informações ou manifeste seu interesse em uma visita.</p>
              {whatsapp && (
                <a className="cs-button" href={whatsapp} target="_blank" rel="noopener noreferrer">
                  <MessageCircle size={20} />
                  Conversar pelo WhatsApp
                </a>
              )}
              <ContactForm kind="interesse" property={p} />
            </div>
          </aside>
        </div>
        {related && related.items.filter((x) => x.id !== p.id).length > 0 && (
          <section className="cs-section">
            <div className="cs-section-heading">
              <div>
                <p className="cs-eyebrow">Continue explorando</p>
                <h2>Outros lugares, novas possibilidades.</h2>
              </div>
            </div>
            <div className="cs-property-grid">
              {related.items
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
        <a className="cs-button" href="#fale-sobre-imovel">
          Tenho interesse <ArrowRight size={18} />
        </a>
      </div>
    </>
  );
}
