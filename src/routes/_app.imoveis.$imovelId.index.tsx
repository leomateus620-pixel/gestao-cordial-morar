import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bath,
  Bed,
  Car,
  ChevronDown,
  ExternalLink,
  Loader2,
  MapPin,
  Maximize2,
  Pencil,
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
  propertyLocalidade,
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

function money(value: number | null | undefined) {
  return value === null || value === undefined ? null : brl(value);
}

/** Renderiza apenas quando há dado — campos vazios não ocupam espaço. */
function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div>
      <p className="text-xs text-foreground/45">{label}</p>
      <p className="mt-0.5 text-sm font-medium">{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-white/60 bg-white/60 p-5 shadow-[0_10px_30px_-16px_rgba(23,27,33,0.15)] backdrop-blur-xl">
      <h2 className="mb-4 text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function DetalhePage() {
  const { imovelId } = Route.useParams();
  const session = useSession();
  const isAdmin = isAdminUser(session);
  const query = usePropertyDetail(imovelId);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);

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
  const address = imovel.localizacaoExibida ?? localidade;

  const facts = [
    imovel.dormitorios !== null ? { icon: Bed, text: `${imovel.dormitorios} dorm.` } : null,
    imovel.banheiros !== null ? { icon: Bath, text: `${imovel.banheiros} banh.` } : null,
    imovel.vagas !== null ? { icon: Car, text: `${imovel.vagas} vagas` } : null,
    formatArea(imovel.areaPrincipal)
      ? { icon: Maximize2, text: formatArea(imovel.areaPrincipal) }
      : null,
  ].filter(Boolean) as Array<{ icon: typeof Bed; text: string }>;

  const hasOwnerContact =
    imovel.proprietarioNome || imovel.proprietarioTelefone || imovel.proprietarioEmail;

  const hasLocationDetails =
    imovel.cep || imovel.logradouro || imovel.numero || imovel.zona || imovel.regiao;

  const hasAreas =
    imovel.areaTotal || imovel.areaUtil || imovel.areaConstruida || imovel.areaTerreno;

  const hasExtraCharacteristics = imovel.suites || imovel.salas || imovel.mobiliado;

  const hasValues =
    imovel.valorIptu ||
    imovel.valorCondominio ||
    imovel.aceitaFinanciamento ||
    imovel.permuta ||
    imovel.disponibilidade;

  const hasDocs =
    imovel.origemCaptacao ||
    imovel.exclusividade ||
    imovel.autorizacao ||
    imovel.escriturada ||
    imovel.averbada ||
    imovel.comPlaca;

  return (
    <div className="space-y-5 pb-10">
      {/* Ações no topo */}
      <div className="flex items-center gap-3">
        <Link
          to="/imoveis"
          className="glass-panel inline-flex size-10 items-center justify-center rounded-full"
          aria-label="Voltar para o catálogo"
        >
          <ArrowLeft className="size-4" />
        </Link>
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

      <DeletePropertyDialog imovel={imovel} open={deleteOpen} onOpenChange={setDeleteOpen} />

      {/* Hero: galeria + resumo */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <PropertyGallery
          images={imovel.images}
          alt={`Fotos do imóvel ${imovel.codigo ?? ""} em ${imovel.cidade ?? "catálogo"}`}
        />

        <div className="flex flex-col justify-center rounded-3xl border border-white/60 bg-white/60 p-6 shadow-[0_10px_30px_-16px_rgba(23,27,33,0.15)] backdrop-blur-xl">
          <p className="text-sm font-medium text-foreground/50">
            {imovel.operacao === "venda" ? "Venda" : "Aluguel"}
            {imovel.codigo ? (
              <span className="ml-2 font-mono text-xs text-foreground/40">{imovel.codigo}</span>
            ) : null}
          </p>
          <h1 className="mt-1 text-2xl font-bold leading-tight">{imovel.tipo ?? "Imóvel"}</h1>

          {address ? (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-foreground/60">
              <MapPin className="size-4 shrink-0" />
              <span className="truncate">{address}</span>
            </p>
          ) : null}

          <p className="mt-4 text-3xl font-bold text-primary">
            {imovel.valorModo === "consulte" || imovel.valor === null ? (
              <span className="text-xl">Consulte</span>
            ) : (
              <>
                {brl(imovel.valor)}
                {imovel.operacao === "aluguel" && (
                  <span className="text-sm font-medium text-foreground/55"> /mês</span>
                )}
              </>
            )}
          </p>

          {facts.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-medium text-foreground/70">
              {facts.map((f, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  <f.icon className="size-4" />
                  {f.text}
                </span>
              ))}
            </div>
          )}

          {imovel.descricaoImovel ? (
            <p className="mt-4 line-clamp-5 whitespace-pre-line text-sm leading-relaxed text-foreground/70">
              {imovel.descricaoImovel}
            </p>
          ) : null}

          {imovel.pontosFortes ? (
            <p className="mt-3 whitespace-pre-line text-sm text-foreground/60">
              <span className="font-semibold text-foreground/75">Pontos fortes: </span>
              {imovel.pontosFortes}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          {hasLocationDetails && (
            <Section title="Localização">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                <Field label="CEP" value={imovel.cep} />
                <Field label="Logradouro" value={imovel.logradouro} />
                <Field label="Número" value={imovel.numero} />
                <Field label="Bairro" value={imovel.bairro} />
                <Field label="Cidade" value={imovel.cidade} />
                <Field label="UF" value={imovel.uf} />
                <Field label="Zona" value={imovel.zona} />
                <Field label="Região" value={imovel.regiao} />
              </div>
            </Section>
          )}

          {(hasExtraCharacteristics || hasAreas) && (
            <Section title="Características e áreas">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                <Field label="Suítes" value={imovel.suites} />
                <Field label="Salas" value={imovel.salas} />
                <Field label="Mobiliado" value={imovel.mobiliado ? "Sim" : null} />
                <Field label="Área total" value={formatArea(imovel.areaTotal)} />
                <Field label="Área útil" value={formatArea(imovel.areaUtil)} />
                <Field label="Área construída" value={formatArea(imovel.areaConstruida)} />
                <Field label="Área do terreno" value={formatArea(imovel.areaTerreno)} />
              </div>
            </Section>
          )}

          {(imovel.nomeEmpreendimento || imovel.unidade) && (
            <Section title="Empreendimento">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Field label="Empreendimento" value={imovel.nomeEmpreendimento} />
                <Field label="Unidade" value={imovel.unidade} />
              </div>
            </Section>
          )}
        </div>

        <div className="space-y-5">
          {hasValues && (
            <Section title="Valores e condições">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Field label="IPTU" value={money(imovel.valorIptu)} />
                <Field label="Condomínio" value={money(imovel.valorCondominio)} />
                <Field
                  label="Financiamento"
                  value={imovel.aceitaFinanciamento ? "Aceita" : null}
                />
                <Field label="Permuta" value={imovel.permuta ? "Aceita" : null} />
                <Field label="Disponibilidade" value={imovel.disponibilidade} />
              </div>
            </Section>
          )}

          {hasDocs && (
            <Section title="Documentação e captação">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Field label="Origem da captação" value={imovel.origemCaptacao} />
                <Field label="Exclusividade" value={imovel.exclusividade ? "Sim" : null} />
                <Field label="Autorização" value={imovel.autorizacao ? "Sim" : null} />
                <Field label="Escriturada" value={imovel.escriturada ? "Sim" : null} />
                <Field label="Averbada" value={imovel.averbada ? "Sim" : null} />
                <Field label="Com placa" value={imovel.comPlaca ? "Sim" : null} />
              </div>
            </Section>
          )}

          {hasOwnerContact && (
            <section className="rounded-3xl border border-white/60 bg-white/60 shadow-[0_10px_30px_-16px_rgba(23,27,33,0.15)] backdrop-blur-xl">
              <button
                type="button"
                onClick={() => setContactOpen((v) => !v)}
                className="flex w-full items-center justify-between p-5 text-left"
                aria-expanded={contactOpen}
              >
                <span className="text-base font-semibold">Contato interno</span>
                <ChevronDown
                  className={`size-4 text-foreground/45 transition-transform ${contactOpen ? "rotate-180" : ""}`}
                />
              </button>
              {contactOpen && (
                <div className="grid grid-cols-1 gap-x-4 gap-y-3 px-5 pb-5 sm:grid-cols-3">
                  <Field label="Proprietário" value={imovel.proprietarioNome} />
                  <Field label="Telefone" value={imovel.proprietarioTelefone} />
                  <Field label="E-mail" value={imovel.proprietarioEmail} />
                </div>
              )}
            </section>
          )}

          <PropertyPublishPanel propertyId={imovel.id} canPublish={true} isAdmin={isAdmin} />

          {isAdmin && (
            <details className="rounded-2xl px-2 text-xs text-foreground/40">
              <summary className="cursor-pointer select-none font-medium">
                Detalhes técnicos
              </summary>
              <div className="mt-2 space-y-1.5 pb-2">
                <p>
                  Fonte: {imovel.source}
                  {imovel.sourceCatalogPage ? ` · página ${imovel.sourceCatalogPage}` : ""} ·
                  revisão v{imovel.revision}
                  {imovel.updatedAt
                    ? ` · atualizado em ${new Date(imovel.updatedAt).toLocaleString("pt-BR")}`
                    : ""}
                </p>
                <p className="break-all font-mono text-[11px]">{imovel.sourcePropertyId}</p>
                {imovel.sourcePropertyUrl && (
                  <a
                    href={imovel.sourcePropertyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-primary/70 hover:text-primary"
                  >
                    Anúncio original <ExternalLink className="size-3" />
                  </a>
                )}
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
