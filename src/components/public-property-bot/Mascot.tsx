import type { BotBrand } from "@/lib/public-property-bot/contracts";
import "./mascot.css";

export type MascotState = "neutral" | "listening" | "searching" | "complete";

/** Original, code-native artwork. Decorative: the surrounding control/status supplies its name. */
export function Mascot({
  brand,
  state = "neutral",
  size = 40,
}: {
  brand: BotBrand;
  state?: MascotState;
  size?: number;
}) {
  const cordial = brand === "cordial";
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="ppb-mascot"
      data-brand={brand}
      data-state={state}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <ellipse
        cx="32"
        cy="59"
        rx="17"
        ry="2.5"
        fill={cordial ? "#145467" : "#30383F"}
        opacity=".12"
      />
      <g className="ppb-mascot-character">
        <path
          d={cordial ? "M18 55c0-10 6-15 14-15s14 5 14 15v2H18z" : "M20 56V46l12-6 12 6v10z"}
          fill={cordial ? "#238C8B" : "#30383F"}
        />
        <path d="M28 50h8v7h-8z" fill={cordial ? "#BAF0DB" : "#F5A35A"} />
        <g className="ppb-mascot-hand">
          <path
            d={cordial ? "M46 47c5 0 8-4 8-10" : "M45 48c6-1 9-5 9-11"}
            stroke={cordial ? "#238C8B" : "#30383F"}
            strokeWidth="7"
            strokeLinecap="round"
          />
          <circle cx="54" cy="34" r="4.5" fill={cordial ? "#70CEBC" : "#F5A35A"} />
        </g>
        <g className="ppb-mascot-head">
          {cordial ? (
            <>
              <rect x="8" y="27" width="7" height="13" rx="3.5" fill="#238C8B" />
              <rect x="49" y="27" width="7" height="13" rx="3.5" fill="#238C8B" />
              <rect
                x="12"
                y="14"
                width="40"
                height="35"
                rx="15"
                fill="#F6FFFA"
                stroke="#145467"
                strokeWidth="2.5"
              />
              <path
                d="m21 18 11-8 11 8"
                stroke="#238C8B"
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <rect x="17" y="24" width="30" height="18" rx="9" fill="#145467" />
            </>
          ) : (
            <>
              <path
                d="M13 25 32 11l19 14v16c0 6-7 10-19 10s-19-4-19-10z"
                fill="#FAF8F3"
                stroke="#30383F"
                strokeWidth="2.5"
                strokeLinejoin="round"
              />
              <path
                d="m12 23 20-14 20 14"
                stroke="#EF9141"
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <rect x="18" y="26" width="28" height="17" rx="6" fill="#30383F" />
              <path d="M43 12V8" stroke="#30383F" strokeWidth="4" strokeLinecap="round" />
            </>
          )}
          <g
            className="ppb-mascot-gaze"
            style={state === "searching" ? { transform: "translateX(1px)" } : undefined}
          >
            {state === "complete" ? (
              <g stroke={cordial ? "#A6EFDA" : "#FFBE7D"} strokeWidth="2.8" strokeLinecap="round">
                <path d="M23 33q3-4 6 0M35 33q3-4 6 0" />
              </g>
            ) : (
              <g className="ppb-mascot-eyes" fill={cordial ? "#A6EFDA" : "#FFBE7D"}>
                <rect x="23" y="29" width="5" height="7" rx="2.5" />
                <rect x="36" y="29" width="5" height="7" rx="2.5" />
              </g>
            )}
            <path
              d={state === "complete" ? "M29 38q3 3 6 0" : "M30 38q2 1.5 4 0"}
              stroke="#FFF"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </g>
          {state === "listening" && (
            <g
              className="ppb-mascot-audio"
              stroke={cordial ? "#238C8B" : "#D86D25"}
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M3 28v7" />
              <path d="M7 23v15" />
              <path d="M60 27v9" />
            </g>
          )}
        </g>
      </g>
    </svg>
  );
}
