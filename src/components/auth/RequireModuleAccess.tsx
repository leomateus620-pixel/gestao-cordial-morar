import type { PropsWithChildren } from "react";
import { Link } from "@tanstack/react-router";
import { LockKeyhole } from "lucide-react";
import { useSession } from "@/lib/auth-mock";
import { canAccessModule } from "@/lib/access-control";
import type { AppModule } from "@/lib/mock/permissions";

type Props = PropsWithChildren<{
  module: AppModule;
}>;

/**
 * Client-side route guard that hides admin/executive modules from
 * corretor/secretaria. Does not redirect (avoids loops with the login guard
 * in AppShell); renders a clean "Acesso restrito" card instead.
 */
export function RequireModuleAccess({ module, children }: Props) {
  const session = useSession();

  if (!session) return null;
  if (canAccessModule(session, module)) return <>{children}</>;

  return (
    <section className="premium-card mx-auto mt-8 max-w-xl p-6 text-center">
      <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
        <LockKeyhole className="size-6" />
      </div>
      <h1 className="text-xl font-bold tracking-tight">Acesso restrito</h1>
      <p className="mt-2 text-sm leading-relaxed text-foreground/58">
        Este módulo é reservado ao seu administrador. Se precisa desses dados
        para trabalhar, peça liberação à direção.
      </p>
      <Link
        to="/"
        className="mt-5 inline-flex items-center justify-center rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/25 transition hover:bg-primary/90 active:scale-[0.98]"
      >
        Voltar para o início
      </Link>
    </section>
  );
}
