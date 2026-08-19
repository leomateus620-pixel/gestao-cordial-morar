import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Bath, Bed, Car, ExternalLink, ImageOff, MapPin, Maximize2 } from "lucide-react";
import { brl } from "@/lib/format";
import { useImovel } from "@/hooks/useImoveis";
import { useSession } from "@/lib/auth-mock";
import { isAdminUser } from "@/lib/access-control";
import { PropertyPublishPanel } from "@/components/imoveis/PropertyPublishPanel";
import { formatArea, propertyLocalidade, NAO_INFORMADO } from "@/types/property";

export const Route = createFileRoute("/_app/imoveis/$imovelId")({
  head: () => ({
    meta: [
      { title: "Detalhe do imóvel — Gestão Cordial" },
      { name: "description", content: "Ficha completa do imóvel no catálogo Cordial / Morar." },
    ],
  }),
  component: Page,
});

function Page() {
  const { imovelId } = Route.useParams();
  const { data: imovel, isPending, isError, error } = useImovel(imovelId);

  if (isPending) {
    return <div className="h-64 animate-pulse rounded-3xl bg-white/45" />;
  }

  if (isError) {
    return (
      <p className="glass-panel rounded-2xl p-6 text-center text-sm text-foreground/55">
        {(error as Error)?.message ?? "Erro ao carregar o imóvel."}
      </p>
    );
  }

  if (!imovel) {
    return (
      <p className="glass-panel rounded-2xl p-6 text-center text-sm text-foreground/55">
        Imóvel não encontrado.
      </p>
    );
  }

  const localidade = propertyLocalidade(imovel);

  return (
    <div className="space-y-4">
      <Link
        to="/imoveis"
        className="inline-flex items-center gap-2 text-xs font-semibold text-foreground/55"
      >
        <ArrowLeft className="size-4" /> Imóveis
      </Link>

      <section className="glass-panel overflow-hidden rounded-3xl">
        <div className="grid aspect-[16/7] w-full place-items-center bg-foreground/[0.05] text-foreground/30">
          <div className="flex flex-col items-center gap-2">
            <ImageOff className="size-7" />
            <span className="text-[11px]">Imagem não disponível no catálogo</span>
          </div>
        </div>
        <div className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
              {imovel.operacao === "venda" ? "Venda" : "Aluguel"}
            </span>
            <span className="rounded-full bg-foreground/8 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-foreground/60">
              Carteira {imovel.carteira}
            </span>
            {imovel.codigo && (
              <span className="rounded-full bg-foreground/8 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-foreground/60">
                Cód. {imovel.codigo}
              </span>
            )}
          </div>
          <h1 className="mt-2 text-2xl font-bold">{imovel.tipo ?? "Imóvel"}</h1>
          <p className="mt-1 flex items-start gap-1 text-sm text-foreground/55">
            <MapPin className="mt-1 size-3.5 shrink-0" />
            {imovel.localizacaoExibida ?? localidade ?? NAO_INFORMADO}
          </p>
          <p className="mt-3 font-mono text-xl font-bold text-primary">
            {imovel.valorModo === "consulte" || imovel.valor === null ? (
              <span className="text-base">Consulte</span>
            ) : (
              <>
                {brl(imovel.valor)}
                {imovel.operacao === "aluguel" && (
                  <span className="text-xs text-foreground/55">/mês</span>
                )}
              </>
            )}
          </p>
          {imovel.valorExibido && imovel.valorModo === "consulte" && (
            <p className="mt-1 text-[11px] italic text-foreground/45">
              Valor não informado no catálogo ({imovel.valorExibido})
            </p>
          )}
        </div>
      </section>

      <section className="glass-panel rounded-3xl p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
          <Maximize2 className="size-4 text-primary" />
          Dados do imóvel
        </h2>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          <Metric icon={Bed} label="Dormitórios" value={imovel.dormitorios} />
          <Metric label="Suítes" value={imovel.suites} />
          <Metric icon={Bath} label="Banheiros" value={imovel.banheiros} />
          <Metric icon={Car} label="Vagas" value={imovel.vagas} />
          <Metric
            label={imovel.areaTipo ? `Área (${imovel.areaTipo})` : "Área principal"}
            value={formatArea(imovel.areaPrincipal)}
          />
          <Metric label="Área total" value={formatArea(imovel.areaTotal)} />
          <Metric label="Área útil" value={formatArea(imovel.areaUtil)} />
          <Metric label="Área construída" value={formatArea(imovel.areaConstruida)} />
          <Metric label="Área do terreno" value={formatArea(imovel.areaTerreno)} />
        </div>
      </section>

      <section className="glass-panel rounded-3xl p-4">
        <h2 className="mb-3 text-sm font-bold">Localização</h2>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          <Metric label="Bairro" value={imovel.bairro} />
          <Metric label="Cidade" value={imovel.cidade} />
          <Metric label="UF" value={imovel.uf} />
        </div>
      </section>

      <section className="glass-panel rounded-3xl p-4">
        <h2 className="mb-3 text-sm font-bold">Origem do registro</h2>
        <div className="space-y-2 text-[12px] text-foreground/60">
          <p>
            Fonte: <span className="font-semibold text-foreground/80">{imovel.source}</span>
            {imovel.sourceCatalogPage ? ` · página ${imovel.sourceCatalogPage} do catálogo` : ""}
          </p>
          <p className="font-mono text-[11px]">ID de origem: {imovel.sourcePropertyId}</p>
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
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number | null | undefined;
  icon?: typeof Bed;
}) {
  const has = value !== null && value !== undefined && value !== "";
  return (
    <div className="rounded-2xl bg-white/45 p-3">
      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-foreground/45">
        {Icon && <Icon className="size-3" />}
        {label}
      </p>
      {has ? (
        <p className="font-semibold">{value}</p>
      ) : (
        <p className="text-[11px] italic text-foreground/35">{NAO_INFORMADO}</p>
      )}
    </div>
  );
}
