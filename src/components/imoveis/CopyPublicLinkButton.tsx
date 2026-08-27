import { useState } from "react";
import { Check, Copy, ExternalLink, Link2Off } from "lucide-react";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const PROVIDER_LABEL: Record<string, string> = { cordial: "Cordial", morar: "Morar" };

function useCopyPublicUrl(provider: string, url: string | null) {
  const [copied, setCopied] = useState(false);
  const label = PROVIDER_LABEL[provider] ?? provider;

  async function copy(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success(`Link ${label} copiado.`);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Não foi possível copiar o link.");
    }
  }

  return { copied, label, copy };
}

/**
 * Copia o link público canônico ou a rota estável confirmada do anúncio.
 * Sem identificador externo verificado não há botão ativo.
 */
export function CopyPublicLinkButton({
  provider,
  url,
  compact = false,
}: {
  provider: string;
  url: string | null;
  compact?: boolean;
}) {
  const { copied, label, copy } = useCopyPublicUrl(provider, url);

  if (!url) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex cursor-default items-center gap-1 rounded-full bg-foreground/[0.05] px-2 py-0.5 text-[9px] font-semibold text-foreground/40">
              <Link2Off className="size-3" /> {label}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            Link público ainda não confirmado pelo site {label}. Publique ou sincronize o imóvel.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        onClick={copy}
        aria-label={`Copiar link público ${label}`}
        className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-semibold text-primary transition hover:bg-primary/20"
      >
        {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
        {compact ? label : `Copiar link ${label}`}
      </button>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        aria-label={`Abrir anúncio ${label} em nova aba`}
        className="grid size-5 place-items-center rounded-full bg-white/70 text-foreground/50 hover:text-primary"
      >
        <ExternalLink className="size-3" />
      </a>
    </span>
  );
}

/**
 * Variante só-ícone para o cabeçalho da ficha: um círculo por site publicado.
 * Sem URL resolvida, não renderiza nada.
 */
export function CopyPublicLinkIcon({
  provider,
  url,
}: {
  provider: string;
  url: string | null;
}) {
  const { copied, label, copy } = useCopyPublicUrl(provider, url);
  if (!url) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={copy}
            aria-label={`Copiar link ${label}`}
            className="glass-panel inline-flex size-9 items-center justify-center rounded-full text-primary transition hover:scale-105 hover:text-primary"
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <span className="flex items-center gap-2">
            {copied ? `Link ${label} copiado` : `Copiar link ${label}`}
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              aria-label={`Abrir anúncio ${label} em nova aba`}
              className="inline-flex items-center gap-0.5 underline"
            >
              Abrir <ExternalLink className="size-3" />
            </a>
          </span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
