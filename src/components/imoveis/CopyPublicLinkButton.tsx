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

/**
 * Copia o link público canônico devolvido pela API do site.
 * Sem link verificado não há botão ativo: nunca montamos URL "adivinhando" o slug.
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
