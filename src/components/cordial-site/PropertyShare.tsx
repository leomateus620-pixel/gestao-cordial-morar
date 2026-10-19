import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Copy, Share2, X } from "lucide-react";

export function PropertyShare({ url }: { url: string }) {
  const [message, setMessage] = useState("");
  return (
    <Popover.Root>
      <Popover.Trigger className="cs-text-link">
        <Share2 size={17} /> Compartilhar
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="cordial-site cs-property-share"
          aria-label="Compartilhar imóvel"
          align="end"
          sideOffset={10}
        >
          <p>Compartilhar imóvel</p>
          <Popover.Close className="cs-icon-button" aria-label="Fechar compartilhamento">
            <X size={18} />
          </Popover.Close>
          <button
            className="cs-text-link"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url);
                setMessage("Link copiado.");
              } catch {
                setMessage("Selecione e copie o endereço abaixo.");
              }
            }}
          >
            <Copy size={17} /> Copiar link
          </button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(url)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Compartilhar no WhatsApp
          </a>
          <a
            href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Compartilhar no Facebook
          </a>
          {message && (
            <>
              <span role="status">{message}</span>
              <input
                aria-label="Link público do imóvel"
                readOnly
                value={url}
                onFocus={(e) => e.currentTarget.select()}
              />
            </>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
