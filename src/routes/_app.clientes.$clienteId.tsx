import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, FileText, Home, Mail, Phone, UserRound } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { useApp } from "@/store/app-store";
import { brl } from "@/lib/format";
import { atendimentoStatusLabel } from "@/types/atendimento";
import { CLIENTS_QUERY_KEY } from "@/hooks/useClients";
import { listClients } from "@/lib/clients/clients.functions";
import { useSession } from "@/lib/auth-mock";
import {
  clientTypeLabel,
  contactPreferenceLabel,
  leadOriginLabel,
  realEstateBrandLabel,
} from "@/types/client";
import { formatBudgetRange, getClientInitials } from "@/services/clients";

export const Route = createFileRoute("/_app/clientes/$clienteId")({
  head: () => ({ meta: [{ title: "Detalhe do cliente — Gestão Cordial" }] }),
  component: Page,
});

const tabs = ["Resumo", "Atendimentos", "Imóveis", "Contratos", "Documentos"] as const;

function Page() {
  const { clienteId } = Route.useParams();
  const user = useSession();
  const clientsQuery = useQuery({
    queryKey: CLIENTS_QUERY_KEY,
    queryFn: () => listClients(),
    enabled: Boolean(user),
    staleTime: 15_000,
  });
  const cliente = clientsQuery.data?.find((c) => c.id === clienteId);
  const atendimentos = useApp((s) => s.atendimentos.filter((a) => a.clienteId === clienteId));
  const imoveis = useApp((s) => s.imoveis);
  const contratos = useApp((s) => s.contratos.filter((c) => c.clienteId === clienteId));

  if (clientsQuery.isLoading) return <Empty message="Carregando cliente..." />;
  if (!cliente) return <Empty message="Cliente não encontrado." />;

  return (
    <div className="space-y-4">
      <Link
        to="/clientes"
        className="inline-flex items-center gap-2 text-xs font-semibold text-foreground/55"
      >
        <ArrowLeft className="size-4" /> Clientes
      </Link>
      <section className="grid gap-4 md:grid-cols-[280px_1fr]">
        <aside className="glass-panel rounded-3xl p-4 md:sticky md:top-32 md:self-start">
          <div className="grid size-16 place-items-center rounded-2xl bg-primary/12 text-lg font-bold text-primary">
            {getClientInitials(cliente.fullName)}
          </div>
          <h2 className="mt-3 text-xl font-semibold">{cliente.fullName}</h2>
          <p className="text-xs text-foreground/55">
            {clientTypeLabel(cliente.clientType)} · origem {leadOriginLabel(cliente.leadOrigin)}
          </p>
          <div className="mt-4 space-y-2 text-xs text-foreground/65">
            <p className="flex items-center gap-2">
              <Phone className="size-3.5" /> {cliente.phone || "Telefone não informado"}
            </p>
            <p className="flex items-center gap-2">
              <Mail className="size-3.5" /> {cliente.email || "E-mail não informado"}
            </p>
            <p className="flex items-center gap-2">
              <UserRound className="size-3.5" /> {cliente.document ?? "CPF/CNPJ pendente"}
            </p>
          </div>
          <div className="mt-4 rounded-2xl bg-white/45 p-3">
            <p className="text-[10px] uppercase tracking-wider text-foreground/45">Orçamento</p>
            <p className="font-mono text-lg font-bold text-primary">
              {formatBudgetRange(cliente)}
            </p>
          </div>
        </aside>

        <div className="space-y-4">
          <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 md:hidden">
            {tabs.map((tab) => (
              <span
                key={tab}
                className="shrink-0 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary"
              >
                {tab}
              </span>
            ))}
          </div>
          <Card title="Resumo comercial" icon={UserRound}>
            <p className="text-sm text-foreground/70">
              {cliente.notes ?? "Sem observações cadastradas."}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
              <Metric
                label="Preferência"
                value={contactPreferenceLabel(cliente.contactPreference)}
              />
              <Metric
                label="Renda"
                value={cliente.approximateIncome ? brl(cliente.approximateIncome) : "Não informada"}
              />
              <Metric
                label="Criado em"
                value={new Date(cliente.createdAt).toLocaleDateString("pt-BR")}
              />
              <Metric label="Imobiliária" value={realEstateBrandLabel(cliente.brand)} />
            </div>
          </Card>
          <Card title="Atendimentos" icon={CalendarDays}>
            {atendimentos.length ? (
              <div className="space-y-2">
                {atendimentos.map((a) => (
                  <div key={a.id} className="rounded-2xl bg-white/45 p-3">
                    <StatusBadge status={atendimentoStatusLabel(a.status)} />
                    <p className="mt-2 text-xs text-foreground/65">{a.observacoes}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-foreground/55">Sem atendimentos vinculados.</p>
            )}
          </Card>
          <Card title="Imóveis de interesse" icon={Home}>
            <div className="grid gap-2 md:grid-cols-2">
              {atendimentos
                .map((a) => imoveis.find((i) => i.id === a.imovelId))
                .filter(Boolean)
                .map((im) => (
                  <Link
                    key={im!.id}
                    to="/imoveis/$imovelId"
                    params={{ imovelId: im!.id }}
                    className="rounded-2xl bg-white/45 p-3 text-sm font-semibold"
                  >
                    {im!.titulo}
                    <span className="block text-xs font-normal text-foreground/55">
                      {brl(im!.valor)}
                    </span>
                  </Link>
                ))}
            </div>
          </Card>
          <Card title="Contratos e documentos" icon={FileText}>
            {contratos.length ? (
              contratos.map((c) => (
                <Link
                  key={c.id}
                  to="/contratos/$contratoId"
                  params={{ contratoId: c.id }}
                  className="block rounded-2xl bg-white/45 p-3 text-sm font-semibold"
                >
                  {c.numero}
                  <span className="block text-xs font-normal text-foreground/55">
                    {c.tipo} · {brl(c.valor)}
                  </span>
                </Link>
              ))
            ) : (
              <p className="text-sm text-foreground/55">Sem contratos vinculados.</p>
            )}
          </Card>
        </div>
      </section>
    </div>
  );
}

function Card({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof UserRound;
  children: React.ReactNode;
}) {
  return (
    <section className="glass-panel rounded-3xl p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold">
        <Icon className="size-4 text-primary" />
        {title}
      </h3>
      {children}
    </section>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/45 p-3">
      <p className="text-[10px] uppercase tracking-wider text-foreground/45">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}
function Empty({ message }: { message: string }) {
  return (
    <p className="glass-panel rounded-2xl p-6 text-center text-sm text-foreground/55">{message}</p>
  );
}
