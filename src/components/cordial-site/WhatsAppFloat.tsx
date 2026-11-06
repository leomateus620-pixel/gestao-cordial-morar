import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { WhatsAppIcon } from "./SocialIcons";
import { floatWhatsappLink } from "@/lib/cordial-site/whatsapp-float";

const KEY = "ms-wa-bubble-closed";

export function WhatsAppFloat({
  number,
  brandName,
  shortName,
  isProperty,
}: {
  number: string;
  brandName: string;
  shortName: string;
  isProperty: boolean;
}) {
  const [bubble, setBubble] = useState(false);
  useEffect(() => {
    if (sessionStorage.getItem(KEY)) return;
    const t = window.setTimeout(() => setBubble(true), 6000);
    return () => window.clearTimeout(t);
  }, []);
  const close = () => {
    setBubble(false);
    sessionStorage.setItem(KEY, "1");
  };
  const open = () => {
    const url = floatWhatsappLink(number, brandName, isProperty ? window.location.href : null);
    window.open(url, "_blank", "noopener,noreferrer");
    close();
  };
  return (
    <div className="ms-wa-float">
      {bubble && (
        <div className="ms-wa-bubble" role="status">
          <span>Olá! Posso ajudar a encontrar seu imóvel?</span>
          <button type="button" aria-label="Fechar mensagem" onClick={close}>
            <X size={14} />
          </button>
        </div>
      )}
      <button
        type="button"
        className="ms-wa-button"
        aria-label={`Conversar com a ${shortName} no WhatsApp`}
        onClick={open}
      >
        <WhatsAppIcon width={26} height={26} />
        <span className="ms-wa-label">Fale com a {shortName}</span>
      </button>
    </div>
  );
}
