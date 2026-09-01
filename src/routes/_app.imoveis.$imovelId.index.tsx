import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Bath,
  Bed,
  Car,
  Lock,
  Copy,
  ExternalLink,
  Map as MapIcon,
  Loader2,
  MapPin,
  Maximize2,
  Pencil,
  Trash2,
} from "lucide-react";
import { RequireModuleAccess } from "@/components/auth/RequireModuleAccess";
import { ArchivePropertyDialog } from "@/components/imoveis/ArchivePropertyDialog";
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

/** Campo interno: sempre visível, mostra "Não informado" quando vazio. */
function InternalField({ label, value }: { label: string; value: React.ReactNode }) {
  const empty = value === null || value === undefined || value === "";
  return (
    <div>
      <p className="text-xs text-foreground/45">{label}</p>
      <p className={`mt-0.5 text-sm ${empty ? "text-foreground/35" : "font-medium"}`}>
        {empty ? "Não informado" : value}
      </p>
    </div>
  );
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
  

  /** Link interno da ficha no Gestão (não é o link público dos sites). */
  async function copyInternalLink() {
    const url = `${window.location.origin}/imoveis/${imovelId}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link interno da ficha copiado.");
    } catch {
      toast.error("Não foi possível copiar o link.");
    }
  }

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
    imovel.dormitorios ? { icon: Bed, text: `${imovel.dormitorios} dorm.` } : null,
    imovel.banheiros ? { icon: Bath, text: `${imovel.banheiros} banh.` } : null,
    imovel.vagas ? { icon: Car, text: `${imovel.vagas} vagas` } : null,
    formatArea(imovel.areaPrincipal)
      ? { icon: Maximize2, text: formatArea(imovel.areaPrincipal) }
      : null,
  ].filter(Boolean) as Array<{ icon: typeof Bed; text: string }>;

  const boolLabel = (v: boolean | null | undefined) =>
    v === null || v === undefined ? null : v ? "Sim" : "Não";


  const enderecoCompleto = [
    [imovel.logradouro, imovel.numero].filter(Boolean).join(", "),
    imovel.bairro,
    imovel.cidade,
    imovel.uf,
  ]
    .filter(Boolean)
    .join(" - ");
  const mapsUrl = enderecoCompleto
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(enderecoCompleto)}`
    : null;

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
          <button
            type="button"
            onClick={copyInternalLink}
            aria-label="Copiar link interno da ficha"
            title="Copiar link interno da ficha"
            className="inline-flex size-9 items-center justify-center rounded-full border border-white/60 bg-white/70 text-foreground/60 transition hover:text-foreground"
          >
            <Copy className="size-4" />
          </button>
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

      <div className="flex items-center gap-2 pt-1">
        <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-primary">
          Publicado nos sites
        </span>
        <span className="text-xs text-foreground/45">
          Estes dados são enviados para Cordial e Morar.
        </span>
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

          {(imovel.nomeEmpreendimento || imovel.unidade) && (
            <Section title="Empreendimento">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Field label="Empreendimento" value={imovel.nomeEmpreendimento} />
                <Field label="Unidade" value={imovel.unidade} />
              </div>
            </Section>
          )}
        </div>
      </div>

      {/* Bloco interno — nunca publicado nos sites */}
      <section className="rounded-3xl border border-amber-300/60 bg-amber-50/60 p-5 shadow-[0_10px_30px_-16px_rgba(23,27,33,0.15)]">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Lock className="size-4 text-amber-700" />
          <h2 className="text-base font-semibold text-amber-900">Uso interno</h2>
          <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-700">
            Não vai para o site
          </span>
          <Link
            to="/imoveis/$imovelId/editar"
            params={{ imovelId }}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-amber-400/60 bg-white/70 px-3 py-1.5 text-xs font-semibold text-amber-800"
          >
            <Pencil className="size-3.5" /> Completar no cadastro
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-3">
          <InternalField label="Proprietário" value={imovel.proprietarioNome} />
          <InternalField label="Telefone do proprietário" value={imovel.proprietarioTelefone} />
          <InternalField label="E-mail do proprietário" value={imovel.proprietarioEmail} />
          <InternalField label="Quem agenciou" value={imovel.corretorNome} />
          <InternalField label="Origem da captação" value={imovel.origemCaptacao} />
          <InternalField label="Carteira de origem" value={imovel.carteira === "cordial" ? "Cordial" : "Morar"} />
          <InternalField label="Exclusividade" value={boolLabel(imovel.exclusividade)} />
          <InternalField label="Autorização" value={boolLabel(imovel.autorizacao)} />
          <InternalField label="Escriturada" value={boolLabel(imovel.escriturada)} />
          <InternalField label="Averbada" value={boolLabel(imovel.averbada)} />
          <InternalField label="Com placa" value={boolLabel(imovel.comPlaca)} />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800/70">
              Informações internas
            </p>
            <p className="mt-1 whitespace-pre-line text-sm text-foreground/80">
              {imovel.observacaoImovel || (
                <span className="text-foreground/35">Não informado</span>
              )}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800/70">
              Outras informações
            </p>
            <p className="mt-1 whitespace-pre-line text-sm text-foreground/80">
              {imovel.outrasInformacoes || (
                <span className="text-foreground/35">Não informado</span>
              )}
            </p>
          </div>
        </div>

        {mapsUrl ? (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-foreground/[0.06] px-3 py-1.5 text-xs font-semibold"
          >
            <MapIcon className="size-3.5" /> Abrir endereço no Google Maps
          </a>
        ) : null}
      </section>

      <div className="space-y-5">
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
  );
}
