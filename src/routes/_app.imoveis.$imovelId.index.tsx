import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bath,
  Bed,
  Car,
  ExternalLink,
  Loader2,
  MapPin,
  Pencil,
  Ruler,
  Trash2,
} from "lucide-react";
import { RequireModuleAccess } from "@/components/auth/RequireModuleAccess";
import { CopyPublicLinkIcon } from "@/components/imoveis/CopyPublicLinkButton";
import { DeletePropertyDialog } from "@/components/imoveis/DeletePropertyDialog";
import { PropertyGallery } from "@/components/imoveis/PropertyGallery";
import { PropertyPublishPanel } from "@/components/imoveis/PropertyPublishPanel";
import { EmptyState } from "@/components/shared/empty-state";
import { usePropertyDetail } from "@/hooks/useImoveis";
import { useSession } from "@/lib/auth-mock";
import { isAdminUser } from "@/lib/access-control";
import { brl } from "@/lib/format";
import {
  formatArea,
  NAO_INFORMADO,
  propertyLocalidade,
  PUBLICATION_STATUS_LABEL,
  type PropertyDetail,
} from "@/types/property";

export const Route = createFileRoute("/_app/imoveis/$imovelId/")({
  head: () => ({
    meta: [
      { title: "Ficha do imóvel — Gestão Cordial" },
      {
        name: "description",
        content: "Ficha completa do imóvel com fotos, dados, valores e status de publicação.",
      },
      { property: "og:title", content: "Ficha do imóvel — Gestão Cordial" },
      {
        property: "og:description",
        content: "Ficha completa do imóvel com fotos, dados, valores e status de publicação.",
      },
    ],
  }),
  component: () => (
    <RequireModuleAccess module="imoveis">
      <DetalhePage />
    </RequireModuleAccess>
  ),
});

const PROVIDER_LABEL: Record<string, string> = { cordial: "Cordial", morar: "Morar" };

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  const empty = value === null || value === undefined || value === "" || value === false;
  return (
    <div className="rounded-2xl bg-white/45 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground/45">{label}</p>
      <p className={"mt-0.5 text-sm font-semibold " + (empty ? "italic text-foreground/35" : "")}>
        {empty ? NAO_INFORMADO : value === true ? "Sim" : value}
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="glass-panel rounded-3xl p-4">
      <h2 className="mb-3 text-sm font-bold">{title}</h2>
      {children}
    </section>
  );
}

function money(value: number | null) {
  return value === null || value === undefined ? null : brl(value);
}

function DetalhePage() {
  const { imovelId } = Route.useParams();
  const session = useSession();
  const isAdmin = isAdminUser(session);
  const query = usePropertyDetail(imovelId);

  if (query.isPending) {
    return (
      <div className="grid place-items-center py-20 text-foreground/45">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <EmptyState
        title="Imóvel indisponível"
        description={
          (query.error as Error)?.message ??
          "Este imóvel não existe mais no catálogo ou você não tem permissão para vê-lo."
        }
      />
    );
  }

  const imovel: PropertyDetail = query.data;
  const localidade = propertyLocalidade(imovel);

  return (
    <div className="space-y-4 pb-10">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to="/imoveis"
          className="glass-panel inline-flex size-9 items-center justify-center rounded-full"
          aria-label="Voltar para o catálogo"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold">
            {imovel.tipo ?? "Imóvel"}
            {imovel.codigo ? <span className="text-foreground/45"> · Cód. {imovel.codigo}</span> : null}
          </h1>
          <p className="text-[12px] text-foreground/55">
            {imovel.operacao === "venda" ? "Venda" : "Aluguel"} ·{" "}
            {imovel.localizacaoExibida ?? localidade ?? NAO_INFORMADO}
          </p>
        </div>
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {imovel.publications
            .filter((p) => p.status === "published" && p.publicUrl)
            .map((p) => (
              <CopyPublicLinkIcon key={p.provider} provider={p.provider} url={p.publicUrl} />
            ))}
          <Link
            to="/imoveis/$imovelId/editar"
            params={{ imovelId }}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-md shadow-primary/25"
          >
            <Pencil className="size-3.5" /> Editar
          </Link>
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            aria-label="Excluir imóvel"
            title="Excluir imóvel"
            className="inline-flex size-9 items-center justify-center rounded-full border border-destructive/25 bg-destructive/10 text-destructive transition hover:bg-destructive/20"
          >
            <Trash2 className="size-4" />
          </button>
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <PropertyGallery
            images={imovel.images}
            alt={`Fotos do imóvel ${imovel.codigo ?? ""} em ${imovel.cidade ?? "catálogo"}`}
          />

          <Section title="Visão geral">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {imovel.publications.map((p) => (
                <span
                  key={p.provider}
                  className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-primary"
                >
                  {PROVIDER_LABEL[p.provider] ?? p.provider} ·{" "}
                  {PUBLICATION_STATUS_LABEL[p.status] ?? p.status}
                </span>
              ))}
            </div>
            <p className="font-mono text-2xl font-bold text-primary">
              {imovel.valorModo === "consulte" || imovel.valor === null ? (
                <span className="text-lg">Consulte</span>
              ) : (
                <>
                  {brl(imovel.valor)}
                  {imovel.operacao === "aluguel" && (
                    <span className="text-xs font-medium text-foreground/55">/mês</span>
                  )}
                </>
              )}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Fact icon={Bed} label="Dorm." value={imovel.dormitorios} />
              <Fact icon={Bath} label="Banh." value={imovel.banheiros} />
              <Fact icon={Car} label="Vagas" value={imovel.vagas} />
              <Fact icon={Ruler} label="Área" value={formatArea(imovel.areaPrincipal)} />
            </div>
            {imovel.descricaoImovel ? (
              <p className="mt-3 whitespace-pre-line text-[13px] leading-relaxed text-foreground/70">
                {imovel.descricaoImovel}
              </p>
            ) : null}
            {imovel.pontosFortes ? (
              <p className="mt-2 whitespace-pre-line text-[12px] text-foreground/60">
                <span className="font-semibold text-foreground/75">Pontos fortes: </span>
                {imovel.pontosFortes}
              </p>
            ) : null}
          </Section>

          <Section title="Localização">
            <div className="mb-2 flex items-start gap-1.5 text-sm text-foreground/65">
              <MapPin className="mt-0.5 size-4 shrink-0" />
              {imovel.localizacaoExibida ?? localidade ?? NAO_INFORMADO}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Info label="CEP" value={imovel.cep} />
              <Info label="Logradouro" value={imovel.logradouro} />
              <Info label="Número" value={imovel.numero} />
              <Info label="Bairro" value={imovel.bairro} />
              <Info label="Cidade" value={imovel.cidade} />
              <Info label="UF" value={imovel.uf} />
              <Info label="Zona" value={imovel.zona} />
              <Info label="Região" value={imovel.regiao} />
            </div>
          </Section>

          <Section title="Características">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Info label="Dormitórios" value={imovel.dormitorios} />
              <Info label="Suítes" value={imovel.suites} />
              <Info label="Banheiros" value={imovel.banheiros} />
              <Info label="Vagas" value={imovel.vagas} />
              <Info label="Salas" value={imovel.salas} />
              <Info label="Mobiliado" value={imovel.mobiliado ? "Sim" : "Não"} />
            </div>
          </Section>

          <Section title="Áreas e terreno">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Info
                label={imovel.areaTipo ? `Área (${imovel.areaTipo})` : "Área principal"}
                value={formatArea(imovel.areaPrincipal)}
              />
              <Info label="Área total" value={formatArea(imovel.areaTotal)} />
              <Info label="Área útil" value={formatArea(imovel.areaUtil)} />
              <Info label="Área construída" value={formatArea(imovel.areaConstruida)} />
              <Info label="Área do terreno" value={formatArea(imovel.areaTerreno)} />
            </div>
          </Section>
        </div>

        <div className="space-y-4">
          <Section title="Valores e condições">
            <div className="grid grid-cols-2 gap-2">
              <Info label="Valor" value={imovel.valorModo === "consulte" ? "Consulte" : money(imovel.valor)} />
              <Info label="IPTU" value={money(imovel.valorIptu)} />
              <Info label="Condomínio" value={money(imovel.valorCondominio)} />
              <Info label="Financiamento" value={imovel.aceitaFinanciamento ? "Aceita" : "Não aceita"} />
              <Info label="Permuta" value={imovel.permuta ? "Aceita" : "Não aceita"} />
              <Info label="Disponibilidade" value={imovel.disponibilidade} />
            </div>
          </Section>

          <Section title="Documentação e captação">
            <div className="grid grid-cols-2 gap-2">
              <Info label="Proprietário" value={imovel.proprietarioNome} />
              <Info label="Telefone do proprietário" value={imovel.proprietarioTelefone} />
              <Info label="E-mail do proprietário" value={imovel.proprietarioEmail} />
              <Info label="Origem da captação" value={imovel.origemCaptacao} />
              <Info label="Exclusividade" value={imovel.exclusividade ? "Sim" : "Não"} />
              <Info label="Autorização" value={imovel.autorizacao ? "Sim" : "Não"} />
              <Info label="Escriturada" value={imovel.escriturada ? "Sim" : "Não"} />
              <Info label="Averbada" value={imovel.averbada ? "Sim" : "Não"} />
              <Info label="Com placa" value={imovel.comPlaca ? "Sim" : "Não"} />
            </div>
          </Section>

          {(imovel.nomeEmpreendimento || imovel.unidade) && (
            <Section title="Empreendimento">
              <div className="grid grid-cols-2 gap-2">
                <Info label="Empreendimento" value={imovel.nomeEmpreendimento} />
                <Info label="Unidade" value={imovel.unidade} />
              </div>
            </Section>
          )}

          <Section title="Divulgação">
            <div className="grid grid-cols-2 gap-2">
              <Info label="Exibir no site" value={imovel.exibirImovel ? "Sim" : "Não"} />
              <Info label="Destaque na home" value={imovel.destaqueInicial ? "Sim" : "Não"} />
              <Info label="Revisão" value={`v${imovel.revision}`} />
              <Info
                label="Última atualização"
                value={imovel.updatedAt ? new Date(imovel.updatedAt).toLocaleString("pt-BR") : null}
              />
            </div>
          </Section>

          <PropertyPublishPanel propertyId={imovel.id} canPublish={true} isAdmin={isAdmin} />

          <Section title="Origem do registro">
            <div className="space-y-2 text-[12px] text-foreground/60">
              <p>
                Fonte: <span className="font-semibold text-foreground/80">{imovel.source}</span>
                {imovel.sourceCatalogPage ? ` · página ${imovel.sourceCatalogPage} do catálogo` : ""}
              </p>
              <p className="break-all font-mono text-[11px]">ID de origem: {imovel.sourcePropertyId}</p>
              {imovel.sourcePropertyUrl && (
                <a
                  href={imovel.sourcePropertyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-primary/10 px-3 py-1.5 text-[11px] font-semibold text-primary"
                >
                  Abrir anúncio original
                  <ExternalLink className="size-3" />
                </a>
              )}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Bed;
  label: string;
  value: string | number | null;
}) {
  const empty = value === null || value === undefined || value === "";
  return (
    <div className="rounded-2xl bg-white/45 px-3 py-2">
      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-foreground/45">
        <Icon className="size-3" />
        {label}
      </p>
      <p className={"mt-0.5 text-sm font-bold " + (empty ? "italic text-foreground/35" : "")}>
        {empty ? "—" : value}
      </p>
    </div>
  );
}
