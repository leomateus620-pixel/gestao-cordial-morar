import { createFileRoute, Link } from "@tanstack/react-router";
import { RequireModuleAccess } from "@/components/auth/RequireModuleAccess";
import { useState } from "react";
import { ArrowRight, Building2, Cable, Search, SlidersHorizontal, UsersRound } from "lucide-react";
import { KpiCard } from "@/components/kpi-card";
import { SectionHeader } from "@/components/section-header";
import { StatusBadge } from "@/components/status-badge";
import { GoogleCalendarCard } from "@/components/configuracoes/GoogleCalendarCard";
import { GoogleDriveCard } from "@/components/configuracoes/GoogleDriveCard";
import { PropertyDriveRootCard } from "@/components/configuracoes/PropertyDriveRootCard";
import { PushDiagnosticsCard } from "@/components/notifications/PushDiagnosticsCard";
import { PushDeliveryHealthCard } from "@/components/notifications/PushDeliveryHealthCard";
import { useSession } from "@/lib/auth-mock";
import { isAdminUser } from "@/lib/access-control";
import { agencies } from "@/lib/mock/data";
import { useApp, useFiltered } from "@/store/app-store";

const filters = ["Todos", "Equipe", "Comercial", "Financeiro", "Sistema"] as const;

export const Route = createFileRoute("/_app/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações — Gestão Cordial" },
      { name: "description", content: "Preferências, busca global e integrações administrativas do Gestão Cordial." },
      { property: "og:title", content: "Configurações — Gestão Cordial" },
      { property: "og:description", content: "Preferências, busca global e integrações administrativas do Gestão Cordial." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GuardedPage,
});

function GuardedPage() {
  return (
    <RequireModuleAccess module="configuracoes">
      <Page />
    </RequireModuleAccess>
  );
}

function Page() {
  const [filter, setFilter] = useState<(typeof filters)[number]>("Todos");
  const isAdmin = isAdminUser(useSession());
  const configuracoes = useFiltered(useApp((s) => s.configuracoes));
  const corretores = useFiltered(useApp((s) => s.corretores));
  const list = configuracoes.filter((c) => filter === "Todos" || c.grupo === filter);
  const revisar = configuracoes.filter((c) => c.status === "Revisar").length;

  return (
    <>
      <section className="mb-5">
        <SectionHeader title="Ferramentas administrativas" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            to="/busca"
            className="group flex items-center gap-4 rounded-xl border bg-card p-4 transition hover:border-primary/35 hover:bg-primary/5"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <Search className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Busca global</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">Encontre registros em todo o sistema</span>
            </span>
            <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
          </Link>

          <Link
            to="/integracoes"
            className="group flex items-center gap-4 rounded-xl border bg-card p-4 transition hover:border-primary/35 hover:bg-primary/5"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <Cable className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Integrações</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">Conectores, sincronizações e NFS-e</span>
            </span>
            <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
          </Link>
        </div>
      </section>

      <section className="mb-5 rounded-xl border bg-card p-5">
        <h2 className="font-semibold">Site público Cordial</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Gerencie publicações, conteúdo e contatos do site próprio.
        </p>
        <Link
          to="/site-administracao"
          className="mt-3 inline-flex rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground"
        >
          Administrar site
        </Link>
      </section>
      <section className="mb-5 rounded-xl border bg-card p-5">
        <h2 className="font-semibold">Site público Morar</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Identidade, publicações próprias, conteúdo e contatos da Morar Imóveis.
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <Link to="/site-morar" className="inline-flex rounded-lg border px-4 py-2 text-sm">
            Ver site
          </Link>
          {isAdmin && (
            <Link
              to="/site-morar-administracao"
              className="inline-flex rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground"
            >
              Administrar site
            </Link>
          )}
        </div>
      </section>
      <section className="mb-5 grid grid-cols-3 gap-3">
        <KpiCard
          label="Parâmetros"
          value={configuracoes.length.toString()}
          tone="primary"
          delta="ativos"
        />
        <KpiCard label="Equipe" value={corretores.length.toString()} delta="corretores" />
        <KpiCard label="Revisar" value={revisar.toString()} delta="pendências" accent="down" />
      </section>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {filters.map((item) => (
          <button
            key={item}
            onClick={() => setFilter(item)}
            className={
              "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition " +
              (filter === item
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                : "glass-panel text-foreground/65")
            }
          >
            {item}
          </button>
        ))}
      </div>

      <section className="mb-5">
        <SectionHeader title="Integrações" />
        <div className="space-y-3">
          <GoogleCalendarCard />
          <GoogleDriveCard />
          <PropertyDriveRootCard />
          <PushDiagnosticsCard />
          {isAdmin && <PushDeliveryHealthCard />}
        </div>
      </section>

      <section className="mb-5">
        <SectionHeader title="Imobiliárias" />
        <div className="glass-panel rounded-3xl p-4">
          {agencies.map((agency) => (
            <div
              key={agency.id}
              className="flex items-center gap-3 border-b border-white/40 py-3 last:border-0 last:pb-0 first:pt-0"
            >
              <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <Building2 className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{agency.nome}</p>
                <p className="text-[11px] text-foreground/55">Operação habilitada</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionHeader title="Preferências operacionais" />
        <div className="space-y-2">
          {list.map((configuracao) => (
            <article key={configuracao.id} className="glass-panel rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    {configuracao.grupo === "Equipe" ? (
                      <UsersRound className="size-5" />
                    ) : (
                      <SlidersHorizontal className="size-5" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{configuracao.nome}</p>
                    <p className="text-[11px] text-foreground/55">
                      {configuracao.grupo} · {configuracao.valor}
                    </p>
                  </div>
                </div>
                <StatusBadge status={configuracao.status} />
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
