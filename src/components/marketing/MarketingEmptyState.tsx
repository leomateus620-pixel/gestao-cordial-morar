import { Megaphone } from "lucide-react";
import type { ReactNode } from "react";

export function MarketingEmptyState({
  title = "Nenhuma campanha cadastrada",
  description = "Cadastre campanhas do Instagram, Facebook, Google ou ações externas para acompanhar resultados e geração de leads.",
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <section className="premium-card grid min-h-72 place-items-center p-6 text-center">
      <div className="max-w-md">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary shadow-sm">
          <Megaphone className="size-6" />
        </div>
        <h2 className="mt-4 text-lg font-black tracking-tight text-foreground">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-foreground/58">{description}</p>
        {action && <div className="mt-5">{action}</div>}
      </div>
    </section>
  );
}
