import { lazy, Suspense, useId, useRef, useState } from "react";
import type { BotBrand } from "@/lib/public-property-bot/contracts";
import { botBrand } from "@/lib/public-property-bot/brand-config";
import { Mascot } from "./Mascot";
import { BotBoundary, BotFailureDialog } from "./BotBoundary";
import "./launcher.css";

const BotPanel = lazy(() => import("./Panel"));
export function PublicPropertyBotLauncher({
  brand,
  whatsapp,
}: {
  brand: BotBrand;
  whatsapp: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();
  const config = botBrand(brand);
  return (
    <>
      <button
        ref={button}
        type="button"
        className="ppb-launcher"
        data-brand={brand}
        aria-label={`Abrir ${config.name}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          setMounted(true);
          setOpen(true);
        }}
      >
        <Mascot brand={brand} size={36} />
        <span className="ppb-launcher-full">{config.name}</span>
        <span className="ppb-launcher-short" aria-hidden="true">
          Bot
        </span>
      </button>
      {mounted && (
        <BotBoundary
          fallback={
            <BotFailureDialog
              brand={brand}
              whatsapp={whatsapp}
              open={open}
              onOpenChange={setOpen}
              triggerRef={button}
              id={id}
            />
          }
        >
          <Suspense
            fallback={
              open ? (
                <span className="ppb-opening" role="status">
                  Abrindo assistente…
                </span>
              ) : null
            }
          >
            <BotPanel
              brand={brand}
              whatsapp={whatsapp}
              open={open}
              onOpenChange={setOpen}
              triggerRef={button}
              id={id}
            />
          </Suspense>
        </BotBoundary>
      )}
    </>
  );
}
