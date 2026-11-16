import type { BotBrand } from "@/lib/public-property-bot/contracts";
import "./mascot.css";

export type MascotState = "neutral" | "listening" | "searching" | "complete";

const mascotAssets = {
  cordial: "/public-property-bot/cordial-mascot.webp",
  morar: "/public-property-bot/morar-mascot.webp",
} satisfies Record<BotBrand, string>;

/** Original ImageGen raster artwork. The surrounding control/status supplies its accessible name. */
export function Mascot({
  brand,
  state = "neutral",
  size = 40,
}: {
  brand: BotBrand;
  state?: MascotState;
  size?: number;
}) {
  return (
    <span
      className="ppb-mascot"
      data-brand={brand}
      data-state={state}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <img
        className="ppb-mascot-character"
        src={mascotAssets[brand]}
        width={size}
        height={size}
        alt=""
        draggable={false}
        decoding="async"
      />
      {state !== "neutral" && (
        <span className="ppb-mascot-signal">
          <i />
          <i />
          <i />
        </span>
      )}
    </span>
  );
}
