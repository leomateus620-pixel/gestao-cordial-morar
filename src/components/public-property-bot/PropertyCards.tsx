import { Bath, BedDouble, ArrowUpRight, MessageCircle } from "lucide-react";
import type { BotBrand, BotCard } from "@/lib/public-property-bot/contracts";
import { getSiteBrand } from "@/lib/cordial-site/brand";
export function safeCardUrls(card: BotCard, brand: BotBrand) {
  const { basePath, apiBase } = getSiteBrand(brand);
  const uuid = "[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}";
  const detail =
    new RegExp(`^${basePath}/imovel/[a-z0-9-]*${uuid}$`, "i").test(card.detailPath) &&
    card.detailPath.endsWith(card.id)
      ? card.detailPath
      : null;
  const image =
    card.imagePath &&
    new RegExp(
      `^${apiBase}/media/${uuid}/[a-f0-9]{32}/(?:thumb|card|full)(?:\\?enhancement=[a-f0-9]{64})?$`,
    ).test(card.imagePath)
      ? card.imagePath
      : null;
  const contact =
    /^https:\/\/wa\.me\/55\d{10,11}\?text=/.test(card.whatsappUrl) ||
    card.whatsappUrl === `${basePath}/contato`
      ? card.whatsappUrl
      : `${basePath}/contato`;
  return { detail, image, contact };
}
export function PropertyCards({
  cards,
  brand,
  onAction,
}: {
  cards: BotCard[];
  brand: BotBrand;
  onAction?(kind: "open" | "whatsapp"): void;
}) {
  return (
    <div className="ppb-cards">
      {cards.map((card, index) => {
        const href = safeCardUrls(card, brand);
        if (!href.detail) return null;
        return (
          <article
            className="ppb-card"
            key={`${card.id}-${card.version}`}
            aria-label={`Opção ${index + 1}: ${card.title}, referência ${card.reference}`}
          >
            {href.image && (
              <a
                href={href.detail}
                target="_blank"
                rel="noopener noreferrer"
                tabIndex={-1}
                aria-hidden="true"
                className="ppb-card-photo"
                onClick={() => onAction?.("open")}
              >
                <img src={href.image} alt="" loading="lazy" width={600} height={375} />
              </a>
            )}
            <div className="ppb-card-content">
              {card.alternative.length > 0 && (
                <span className="ppb-alternative">Alternativa próxima</span>
              )}
              <p className="ppb-card-price">{card.price}</p>
              <h3>
                <a
                  href={href.detail}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => onAction?.("open")}
                >
                  {card.title}
                  <span className="ppb-sr-only"> (abre em nova aba)</span>
                </a>
              </h3>
              {card.location && <p className="ppb-card-location">{card.location}</p>}
              <div className="ppb-card-counts">
                {card.bedrooms != null && (
                  <span>
                    <BedDouble size={16} aria-hidden="true" />
                    {card.bedrooms} quarto{card.bedrooms === 1 ? "" : "s"}
                  </span>
                )}
                {card.bathrooms != null && (
                  <span>
                    <Bath size={16} aria-hidden="true" />
                    {card.bathrooms} banheiro{card.bathrooms === 1 ? "" : "s"}
                  </span>
                )}
              </div>
              {card.features.length > 0 && (
                <p className="ppb-card-features">{card.features.join(" · ")}</p>
              )}
              {card.alternative.map((difference) => (
                <p key={difference} className="ppb-card-difference">
                  {difference}
                </p>
              ))}
              <p className="ppb-card-reference">REF {card.reference}</p>
              <div className="ppb-card-actions">
                <a
                  href={href.detail}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => onAction?.("open")}
                >
                  Ver imóvel <ArrowUpRight size={15} aria-hidden="true" />
                </a>
                <a
                  href={href.contact}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    if (href.contact.startsWith("https:")) onAction?.("whatsapp");
                  }}
                >
                  <MessageCircle size={16} aria-hidden="true" />
                  {href.contact.startsWith("https:") ? "WhatsApp" : "Contato"}
                </a>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
