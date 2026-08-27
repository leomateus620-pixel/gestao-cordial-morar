import { Building2, Check, Home } from "lucide-react";
import type { PropertyCarteira } from "@/types/property";

export const PROVIDER_LABEL: Record<PropertyCarteira, string> = {
  cordial: "Cordial Imóveis",
  morar: "Morar Imóveis",
};

const PROVIDER_DESCRIPTION: Record<PropertyCarteira, string> = {
  cordial: "Publicar no site da Cordial",
  morar: "Publicar no site da Morar",
};

const PROVIDER_ICON: Record<PropertyCarteira, typeof Building2> = {
  cordial: Building2,
  morar: Home,
};

/**
 * Seletor de destino da publicação.
 * Cada imobiliária mantém sua própria identidade visual; nada aqui altera
 * reservas, geração de códigos ou payloads das APIs.
 */
export function PublishTargetSelector({
  value,
  onChange,
  lockedProviders = [],
  onBlockedRemove,
}: {
  value: PropertyCarteira[];
  onChange: (providers: PropertyCarteira[]) => void;
  /** Provedores já publicados: remover exige confirmação. */
  lockedProviders?: PropertyCarteira[];
  onBlockedRemove?: (provider: PropertyCarteira) => boolean;
}) {
  const both = value.includes("cordial") && value.includes("morar");

  function toggle(provider: PropertyCarteira) {
    const active = value.includes(provider);
    if (active) {
      if (lockedProviders.includes(provider)) {
        const allowed = onBlockedRemove?.(provider) ?? false;
        if (!allowed) return;
      }
      onChange(value.filter((p) => p !== provider));
      return;
    }
    onChange([...value, provider]);
  }

  return (
    <div className={"p-1.5 " + (both ? "brand-target-combined" : "")}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {(["cordial", "morar"] as PropertyCarteira[]).map((provider) => {
          const active = value.includes(provider);
          const Icon = PROVIDER_ICON[provider];
          return (
            <button
              key={provider}
              type="button"
              aria-pressed={active}
              onClick={() => toggle(provider)}
              className={
                "brand-target flex w-full items-center gap-3 px-3.5 py-3 text-left " +
                (active
                  ? provider === "cordial"
                    ? "brand-target-cordial"
                    : "brand-target-morar"
                  : "text-foreground/60")
              }
            >
              <span
                className={
                  "grid size-9 shrink-0 place-items-center rounded-xl " +
                  (active ? "bg-white/70" : "bg-foreground/[0.06]")
                }
              >
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-bold">{PROVIDER_LABEL[provider]}</span>
                <span className="block truncate text-[11px] opacity-75">
                  {PROVIDER_DESCRIPTION[provider]}
                </span>
              </span>
              <span
                className={
                  "grid size-5 shrink-0 place-items-center rounded-full border transition-all duration-200 " +
                  (active
                    ? "scale-100 border-transparent [background:currentColor] opacity-100"
                    : "scale-90 border-foreground/20 opacity-60")
                }
              >
                {active ? <Check className="size-3 text-white [color:white]" /> : null}
              </span>
            </button>
          );
        })}
      </div>
      {both ? (
        <p className="mt-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-foreground/45">
          Publicação nos dois sites
        </p>
      ) : null}
    </div>
  );
}
