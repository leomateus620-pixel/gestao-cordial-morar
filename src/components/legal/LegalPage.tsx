import type { ReactNode } from "react";
import { BrandMark } from "@/components/brand/BrandMark";

export const LEGAL_CONTACT_EMAIL = "atendimento@cordialgestao.com";
export const LEGAL_UPDATED_AT = "26 de outubro de 2026";

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
        <header className="mb-8 flex items-center gap-3">
          <BrandMark className="size-10" />
          <span className="text-sm font-semibold text-foreground/70">Gestão Cordial &amp; Morar</span>
        </header>
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-foreground/60">Atualizada em {LEGAL_UPDATED_AT}</p>
        <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-foreground/85 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-foreground [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_a]:font-medium [&_a]:text-primary [&_a]:underline">
          {children}
        </div>
      </div>
    </main>
  );
}
