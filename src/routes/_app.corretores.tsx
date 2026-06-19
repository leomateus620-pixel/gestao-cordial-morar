import { createFileRoute } from "@tanstack/react-router";
import { LockKeyhole, UserCog } from "lucide-react";
import { useCallback, useState } from "react";
import { CorretorCard } from "@/components/corretores/CorretorCard";
import { CorretorDetailDrawer } from "@/components/corretores/CorretorDetailDrawer";
import { CorretoresFilters } from "@/components/corretores/CorretoresFilters";
import { CorretoresRanking } from "@/components/corretores/CorretoresRanking";
import { CorretoresSummaryCards } from "@/components/corretores/CorretoresSummaryCards";
import { EmptyState } from "@/components/shared/empty-state";
import { useCorretores } from "@/hooks/useCorretores";
import { useSession } from "@/lib/auth-mock";
import { hasPermission } from "@/lib/mock/permissions";
import type { AgencyFilter } from "@/services/corretores";
import type { Corretor } from "@/types/corretor";

export const Route = createFileRoute("/_app/corretores")({
  head: () => ({ meta: [{ title: "Corretores — Gestão Cordial" }] }),
  component: Page,
});

function Page() {
  const session = useSession();
  const [selectedCorretor, setSelectedCorretor] = useState<Corretor | null>(null);
  const {
    agency,
    setAgency,
    filters,
    setFilters,
    resetFilters,
    agencyCorretores,
    corretores,
    ranking,
    summary,
  } = useCorretores();

  const canAccess =
    session?.perfil === "admin_owner" && hasPermission(session.perfil, "corretores:read");

  const handleAgencyChange = useCallback(
    (nextAgency: AgencyFilter) => {
      setAgency(nextAgency);
    },
    [setAgency],
  );

  const handleSelect = useCallback((corretor: Corretor) => {
    setSelectedCorretor(corretor);
  }, []);

  if (!canAccess) {
    return (
      <section className="premium-card mx-auto mt-8 max-w-xl p-6 text-center">
        <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
          <LockKeyhole className="size-6" />
        </div>
        <h1 className="text-xl font-bold tracking-tight">Acesso restrito</h1>
        <p className="mt-2 text-sm leading-relaxed text-foreground/58">
          A visão completa de corretores é estratégica e está disponível apenas para administradores
          da Gestão Cordial/Morar.
        </p>
      </section>
    );
  }

  return (
    <>
      <div className="space-y-5">
        <section
          className="relative overflow-hidden rounded-[1.85rem] p-5 text-white shadow-[0_24px_70px_-30px_rgba(23,27,33,0.5)] sm:p-6 lg:p-7"
          style={{
            background: "linear-gradient(135deg, #174d61 0%, #1e647d 48%, #25323a 100%)",
          }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute -right-14 -top-16 size-48 rounded-full bg-cyan-200/12 blur-3xl"
          />
          <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-50/78 ring-1 ring-white/12">
                <UserCog className="size-3.5" />
                Central administrativa
              </div>
              <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Corretores</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/68">
                Acompanhe desempenho, conversões, agenciamentos e comissões da equipe.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:w-fit">
              <HeroPill label="Ativos" value={String(summary.ativos).padStart(2, "0")} />
              <HeroPill
                label="Fechados"
                value={String(summary.contratosFechados).padStart(2, "0")}
              />
              <HeroPill label="Conversão" value={`${summary.taxaMediaConversao}%`} accent />
            </div>
          </div>
        </section>

        <CorretoresSummaryCards summary={summary} />

        <CorretoresFilters
          agency={agency}
          filters={filters}
          corretores={agencyCorretores}
          onAgencyChange={handleAgencyChange}
          onFiltersChange={setFilters}
          onReset={resetFilters}
        />

        {ranking.length > 0 && <CorretoresRanking ranking={ranking} onSelect={handleSelect} />}

        <section className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {corretores.map((corretor) => (
            <CorretorCard key={corretor.id} corretor={corretor} onSelect={handleSelect} />
          ))}
        </section>

        {corretores.length === 0 && (
          <EmptyState
            title="Nenhum corretor encontrado"
            description="Ajuste os filtros para rever a equipe do período."
          />
        )}
      </div>

      <CorretorDetailDrawer
        corretor={selectedCorretor}
        periodo={filters.periodo}
        open={selectedCorretor !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedCorretor(null);
        }}
      />
    </>
  );
}

function HeroPill({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className="min-w-0 rounded-2xl px-3 py-2.5 ring-1 ring-white/14"
      style={{
        background: accent ? "rgba(240,168,109,0.18)" : "rgba(255,255,255,0.09)",
      }}
    >
      <p className="truncate text-[9px] font-bold uppercase tracking-[0.16em] text-white/50">
        {label}
      </p>
      <p className="mt-1 truncate font-mono text-base font-black text-white sm:text-lg">
        {value}
      </p>
    </div>
  );
}
