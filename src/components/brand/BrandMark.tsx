import { cn } from "@/lib/utils";

type BrandMarkProps = {
  className?: string;
  title?: string;
};

/**
 * Logomark oficial da Gestão Cordial & Morar — somente o símbolo,
 * extraído de public/logo-gestao-cordial-morar.svg (sem fundo, sem wordmark).
 * Pensado para chips/avatares pequenos no header do sidebar.
 */
export function BrandMark({ className, title = "Gestão Cordial & Morar" }: BrandMarkProps) {
  return (
    <svg
      viewBox="40 50 200 190"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
      className={cn("block", className)}
    >
      <title>{title}</title>
      <defs>
        <linearGradient id="bm-teal" x1="49" y1="56" x2="222" y2="235" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7CC7DE" />
          <stop offset="0.48" stopColor="#1E647D" />
          <stop offset="1" stopColor="#174D61" />
        </linearGradient>
        <linearGradient id="bm-copper" x1="123" y1="149" x2="210" y2="224" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F0A86D" />
          <stop offset="0.45" stopColor="#D9782D" />
          <stop offset="1" stopColor="#B95F20" />
        </linearGradient>
        <linearGradient id="bm-top" x1="143" y1="56" x2="143" y2="207" gradientUnits="userSpaceOnUse">
          <stop stopColor="white" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M143 56L236 110V151L208 135V126L143 88L78 126V198L104 213V141L143 119L182 141V173L143 151L128 160V119L143 110L198 141V230L143 198L88 230L49 207V110L143 56Z"
        fill="url(#bm-teal)"
      />
      <path d="M84 136L115 154V223L84 205V136Z" fill="#1F2933" />
      <path
        d="M124 160L143 149L204 184V231L174 214V199L143 181L124 192V160Z"
        fill="url(#bm-copper)"
      />
      <path
        d="M143 56L236 110V151L208 135V126L143 88L78 126V198L49 207V110L143 56Z"
        fill="url(#bm-top)"
        fillOpacity="0.22"
      />
    </svg>
  );
}
