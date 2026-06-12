import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Bed, CalendarDays, FileText, Maximize2, UsersRound } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { useApp } from "@/store/app-store";
import { brl } from "@/lib/format";

export const Route = createFileRoute("/_app/imoveis/$imovelId")({ component: Page });

function Page() {
  const { imovelId } = Route.useParams();
  const imovel = useApp((s) => s.imoveis.find((i) => i.id === imovelId));
  const clientes = useApp((s) => s.clientes);
  const atendimentos = useApp((s) => s.atendimentos.filter((a) => a.imovelId === imovelId));
  const visitas = useApp((s) => s.agenda.filter((a) => a.imovelId === imovelId));
  const contratos = useApp((s) => s.contratos.filter((c) => c.imovelId === imovelId));
  if (!imovel)
    return (
      <p className="glass-panel rounded-2xl p-6 text-center text-sm text-foreground/55">
        Imóvel não encontrado.
      </p>
    );
  const fotos = imovel.fotos?.length ? imovel.fotos : [imovel.foto, imovel.foto, imovel.foto];
  return (
    <div className="space-y-4">
      <Link
        to="/imoveis"
        className="inline-flex items-center gap-2 text-xs font-semibold text-foreground/55"
      >
        <ArrowLeft className="size-4" /> Imóveis
      </Link>
      <section className="glass-panel overflow-hidden rounded-3xl">
        <img src={fotos[0]} alt={imovel.titulo} className="aspect-[16/9] w-full object-cover" />
        <div className="grid grid-cols-3 gap-1 p-1">
          {fotos.slice(0, 3).map((f, idx) => (
            <img
              key={idx}
              src={f}
              alt="Foto do imóvel"
              className="aspect-[4/3] rounded-2xl object-cover"
            />
          ))}
        </div>
        <div className="p-4">
          <StatusBadge status={imovel.status} />
          <h2 className="mt-2 text-2xl font-bold">{imovel.titulo}</h2>
          <p className="text-sm text-foreground/55">
            {imovel.endereco} · {imovel.bairro}, {imovel.cidade}
          </p>
          <p className="mt-3 font-mono text-xl font-bold text-primary">
            {brl(imovel.valor)}
            {imovel.finalidade === "Aluguel" && (
              <span className="text-xs text-foreground/55">/mês</span>
            )}
          </p>
        </div>
      </section>
      <Grid title="Dados do imóvel" icon={Maximize2}>
        <Metric icon={Bed} label="Quartos" value={`${imovel.quartos}`} />
        <Metric label="Área" value={`${imovel.area} m²`} />
        <Metric label="Suítes" value={`${imovel.suites ?? 1}`} />
        <Metric label="Vagas" value={`${imovel.vagas ?? 2}`} />
        <Metric label="Condomínio" value={brl(imovel.condominio ?? 1200)} />
        <Metric label="IPTU" value={brl(imovel.iptu ?? 420)} />
      </Grid>
      <Section title="Clientes interessados" icon={UsersRound}>
        {atendimentos.map((a) => (
          <Row
            key={a.id}
            title={clientes.find((c) => c.id === a.clienteId)?.nome ?? "Cliente"}
            meta={a.status}
            to="/clientes/$clienteId"
            params={{ clienteId: a.clienteId }}
          />
        ))}
      </Section>
      <Section title="Visitas" icon={CalendarDays}>
        {visitas.map((v) => (
          <div key={v.id} className="rounded-2xl bg-white/45 p-3 text-sm font-semibold">
            {v.titulo}
            <span className="block text-xs font-normal text-foreground/55">
              {new Date(v.data).toLocaleString("pt-BR")}
            </span>
          </div>
        ))}
      </Section>
      <Section title="Contratos" icon={FileText}>
        {contratos.map((c) => (
          <Row
            key={c.id}
            title={c.numero}
            meta={`${c.tipo} · ${brl(c.valor)}`}
            to="/contratos/$contratoId"
            params={{ contratoId: c.id }}
          />
        ))}
      </Section>
      <Section title="Documentos" icon={FileText}>
        {(imovel.documentos && imovel.documentos.length > 0
          ? imovel.documentos.map((d) => ({ id: d.id, nome: d.nome }))
          : [
              { id: "fallback-1", nome: "Matrícula atualizada" },
              { id: "fallback-2", nome: "IPTU" },
              { id: "fallback-3", nome: "Laudo de vistoria" },
              { id: "fallback-4", nome: "Fotos profissionais" },
            ]
        ).map((d) => (
          <div key={d.id} className="rounded-2xl bg-white/45 p-3 text-sm font-semibold">
            {d.nome}
          </div>
        ))}
      </Section>
    </div>
  );
}
function Grid({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Maximize2;
  children: React.ReactNode;
}) {
  return (
    <section className="glass-panel rounded-3xl p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold">
        <Icon className="size-4 text-primary" />
        {title}
      </h3>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">{children}</div>
    </section>
  );
}
function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof FileText;
  children: React.ReactNode;
}) {
  return (
    <section className="glass-panel rounded-3xl p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold">
        <Icon className="size-4 text-primary" />
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}
function Metric({ label, value, icon: Icon }: { label: string; value: string; icon?: typeof Bed }) {
  return (
    <div className="rounded-2xl bg-white/45 p-3">
      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-foreground/45">
        {Icon && <Icon className="size-3" />}
        {label}
      </p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}
function Row(props: { title: string; meta: string; to: string; params: Record<string, string> }) {
  return (
    <Link
      to={props.to as never}
      params={props.params as never}
      className="block rounded-2xl bg-white/45 p-3 text-sm font-semibold"
    >
      {props.title}
      <span className="block text-xs font-normal text-foreground/55">{props.meta}</span>
    </Link>
  );
}
