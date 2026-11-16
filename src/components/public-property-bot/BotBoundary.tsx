import { Component, useRef, type ReactNode, type RefObject } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { BotBrand } from "@/lib/public-property-bot/contracts";
import { botBrand } from "@/lib/public-property-bot/brand-config";
import { centralContact } from "@/lib/public-property-bot/cards";
import { getSiteBrand } from "@/lib/cordial-site/brand";

/** Loading failures are local to the bot and never replace the public site. */
export class BotBoundary extends Component<
  {
    children: ReactNode;
    fallback: ReactNode;
    onError?(): void;
  },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError?.();
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function BotFailureDialog({
  brand,
  whatsapp,
  open,
  onOpenChange,
  triggerRef,
  id,
}: {
  brand: BotBrand;
  whatsapp: string;
  open: boolean;
  onOpenChange(open: boolean): void;
  triggerRef: RefObject<HTMLButtonElement | null>;
  id: string;
}) {
  const close = useRef<HTMLButtonElement>(null);
  const contact = centralContact(brand, whatsapp);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="ppb-failure-overlay" />
        <Dialog.Content
          id={id}
          className="ppb-failure"
          data-brand={brand}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            close.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            triggerRef.current?.focus();
          }}
        >
          <Dialog.Title>{botBrand(brand).name}</Dialog.Title>
          <Dialog.Close ref={close} className="ppb-failure-close" aria-label="Fechar conversa">
            <X size={22} />
          </Dialog.Close>
          <Dialog.Description>
            O assistente não carregou agora. Continue pela busca do site ou fale com a equipe.
          </Dialog.Description>
          <div className="ppb-failure-actions">
            <a href={`${getSiteBrand(brand).basePath}/buscar`}>Buscar imóveis</a>
            <a href={contact} target="_blank" rel="noopener noreferrer">
              {contact.startsWith("https:") ? "WhatsApp da equipe" : "Contato da equipe"}
            </a>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
