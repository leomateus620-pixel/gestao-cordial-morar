import type { PropsWithChildren } from "react";
import { Link } from "@tanstack/react-router";
import { LockKeyhole } from "lucide-react";
import { useSession } from "@/lib/auth-mock";
import { canUseAssistant } from "@/lib/access-control";

/** Bloqueia as páginas do CORDIAL bot para quem não pode usá-lo. */
export function RequireAssistantAccess({ children }: PropsWithChildren) {
  const session = useSession();
  if (!session) return null;
  if (canUseAssistant(session)) return <>{children}</>;
  return (
    <section className="premium-card mx-auto mt-8 max-w-xl p-6 text-center">
      <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
        <LockKeyhole className="size-6" />
      </div>
      <h1 className="text-xl font-bold tracking-tight">Acesso restrito</h1>
      <p className="mt-2 text-sm leading-relaxed text-foreground/58">
        O CORDIAL bot não está disponível para o seu perfil.
      </p>
      <Link
        to="/"
        className="mt-5 inline-flex items-center justify-center rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
      >
        Voltar para o início
      </Link>
    </section>
  );
}
