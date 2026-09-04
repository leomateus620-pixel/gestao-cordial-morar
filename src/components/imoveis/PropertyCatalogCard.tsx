import { Link } from "@tanstack/react-router";
import { Bath, Bed, Car, Image as ImageIcon, MapPin, Maximize2, Pencil } from "lucide-react";
import { brl } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  formatArea,
  propertyLocalidade,
  PUBLICATION_STATUS_LABEL,
  type Property,
} from "@/types/property";
import { CopyPublicLinkControl } from "./CopyPublicLinkButton";

export type CatalogView = "grid" | "list";

const PROVIDER_LABEL: Record<string, string> = { cordial: "Cordial", morar: "Morar" };
const PROVIDER_INITIAL: Record<string, string> = { cordial: "C", morar: "M" };

function statusTone(status: string, tone: "overlay" | "surface" = "overlay") {
  if (status === "published") return "bg-emerald-400";
  if (status === "error" || status === "out_of_sync") return "bg-amber-400";
  if (status === "unpublished" || status === "draft")
    return tone === "overlay" ? "bg-white/60" : "bg-foreground/30";
  return "bg-sky-300";
}

type CodeChip = { provider: "cordial" | "morar" | "legado"; label: string; value: string };

function propertyCodes(property: Property): CodeChip[] {
  const codes: CodeChip[] = [];
  if (property.codigoCordial)
    codes.push({ provider: "cordial", label: "Cordial", value: property.codigoCordial });
  if (property.codigoMorar)
    codes.push({ provider: "morar", label: "Morar", value: property.codigoMorar });
  if (codes.length === 0 && property.codigo)
    codes.push({ provider: "legado", label: "Código", value: property.codigo });
  return codes;
}

function CodeChips({ codes, className }: { codes: CodeChip[]; className?: string }) {
  if (codes.length === 0) return null;
  return (
    <span className={cn("flex shrink-0 items-center gap-1", className)}>
      {codes.map((code) => (
        <span
          key={`${code.provider}-${code.value}`}
          title={`${code.label}: ${code.value}`}
          className={cn(
            "inline-flex h-5 items-center rounded-md px-1.5 font-mono text-[10.5px] font-semibold leading-none tabular-nums",
            code.provider === "cordial" &&
              "bg-[var(--cordial-primary)]/10 text-[var(--cordial-primary)]",
            code.provider === "morar" && "bg-[var(--morar-primary)]/12 text-[#b95f20]",
            code.provider === "legado" && "bg-foreground/[0.06] text-foreground/55",
          )}
        >
          {code.value}
        </span>
      ))}
    </span>
  );
}

function OperacaoBadge({
  operacao,
  tone = "overlay",
  className,
}: {
  operacao: Property["operacao"];
  /** `overlay` sobre a foto · `surface` sobre o fundo claro do card. */
  tone?: "overlay" | "surface";
  className?: string;
}) {
  const venda = operacao === "venda";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-bold uppercase tracking-[0.12em]",
        tone === "overlay"
          ? cn(
              "h-6 px-2.5 text-[10px] text-white shadow-sm backdrop-blur-md",
              venda ? "bg-[rgba(30,100,125,0.85)]" : "bg-[rgba(217,120,45,0.88)]",
            )
          : cn(
              "h-5 px-2 text-[9.5px]",
              venda ? "bg-primary/10 text-primary" : "bg-[var(--system-accent)]/12 text-[#b95f20]",
            ),
        className,
      )}
    >
      {venda ? "Venda" : "Aluguel"}
    </span>
  );
}

/** Pílulas C/M com o estado de publicação em cada site. */
function PublicationBadges({
  property,
  tone = "overlay",
}: {
  property: Property;
  tone?: "overlay" | "surface";
}) {
  if (property.publications.length === 0 && !property.removalState) return null;
  const pill =
    tone === "overlay"
      ? "bg-black/45 text-white backdrop-blur-md"
      : "bg-foreground/[0.06] text-foreground/70";
  return (
    <span className="flex items-center gap-1">
      {property.publications.map((publication) => (
        <span
          key={publication.provider}
          title={`${PROVIDER_LABEL[publication.provider] ?? publication.provider}: ${
            PUBLICATION_STATUS_LABEL[publication.status] ?? publication.status
          }`}
          className={cn(
            "inline-flex h-6 items-center gap-1 rounded-full pl-1.5 pr-2 text-[10px] font-bold",
            pill,
          )}
        >
          <span className={cn("size-1.5 rounded-full", statusTone(publication.status, tone))} />
          {PROVIDER_INITIAL[publication.provider] ?? publication.provider.slice(0, 1).toUpperCase()}
        </span>
      ))}
      {property.removalState === "pending_removal" ? (
        <span
          title="Remoção pendente"
          className="inline-flex h-6 items-center rounded-full bg-rose-500/85 px-2 text-[10px] font-bold text-white backdrop-blur-md"
        >
          !
        </span>
      ) : null}
    </span>
  );
}

function Specs({ property, className }: { property: Property; className?: string }) {
  const area = formatArea(property.areaPrincipal);
  const items = [
    property.dormitorios
      ? { icon: Bed, text: String(property.dormitorios), title: "Dormitórios" }
      : null,
    property.banheiros
      ? { icon: Bath, text: String(property.banheiros), title: "Banheiros" }
      : null,
    property.vagas ? { icon: Car, text: String(property.vagas), title: "Vagas" } : null,
    area ? { icon: Maximize2, text: area, title: "Área" } : null,
  ].filter(Boolean) as Array<{ icon: typeof Bed; text: string; title: string }>;

  if (items.length === 0) return null;
  return (
    <ul
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-medium text-foreground/60",
        className,
      )}
    >
      {items.map((item) => (
        <li
          key={item.title}
          title={item.title}
          className="inline-flex items-center gap-1 tabular-nums"
        >
          <item.icon className="size-3.5 text-foreground/40" strokeWidth={2} />
          {item.text}
        </li>
      ))}
    </ul>
  );
}

function Price({ property, className }: { property: Property; className?: string }) {
  const consulte = property.valorModo === "consulte" || property.valor === null;
  return (
    <p className={cn("flex items-baseline gap-1 font-bold tracking-tight text-primary", className)}>
      {consulte ? (
        <span className="text-[15px] font-semibold text-foreground/60">Sob consulta</span>
      ) : (
        <>
          <span className="tabular-nums">{brl(property.valor as number)}</span>
          {property.operacao === "aluguel" ? (
            <span className="text-[11px] font-semibold text-foreground/45">/mês</span>
          ) : null}
        </>
      )}
    </p>
  );
}

function Cover({
  property,
  alt,
  className,
}: {
  property: Property;
  alt: string;
  className?: string;
}) {
  return property.coverUrl ? (
    <img
      src={property.coverUrl}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={cn(
        "size-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04] motion-reduce:transform-none",
        className,
      )}
    />
  ) : (
    <div className="grid size-full place-items-center bg-[linear-gradient(135deg,rgba(30,100,125,0.10),rgba(217,120,45,0.08))] text-primary/30">
      <ImageIcon className="size-9" strokeWidth={1.2} />
    </div>
  );
}

function CardActions({ property, className }: { property: Property; className?: string }) {
  const published = property.publications
    .filter((p) => p.status === "published")
    .map((p) => ({ provider: p.provider, url: p.publicUrl }));
  return (
    <div className={cn("relative z-10 flex items-center gap-1.5", className)}>
      <CopyPublicLinkControl
        links={published}
        className="grid size-8 place-items-center rounded-full bg-foreground/[0.05] text-foreground/55 transition hover:bg-primary/10 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/40 [&_svg]:size-3.5"
      />
      <Link
        to="/imoveis/$imovelId/editar"
        params={{ imovelId: property.id }}
        aria-label="Editar imóvel"
        title="Editar imóvel"
        className="grid size-8 place-items-center rounded-full bg-foreground/[0.05] text-foreground/55 transition hover:bg-primary/10 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <Pencil className="size-3.5" />
      </Link>
    </div>
  );
}

const CARD_SHELL =
  "group relative overflow-hidden rounded-[22px] border border-white/70 bg-white/72 shadow-[0_12px_32px_-18px_rgba(23,27,33,0.28)] backdrop-blur-xl transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-white hover:shadow-[0_22px_48px_-20px_rgba(23,27,33,0.32)] focus-within:ring-2 focus-within:ring-primary/35 motion-reduce:transform-none";

export function PropertyCatalogCard({
  property,
  view = "grid",
}: {
  property: Property;
  view?: CatalogView;
}) {
  const localidade = property.localizacaoExibida ?? propertyLocalidade(property);
  const codes = propertyCodes(property);
  const codeLabel = codes.map((code) => code.value).join(" / ");
  const title = property.tipo ?? "Imóvel";
  const ariaLabel = `Abrir ficha: ${title}${codeLabel ? ` ${codeLabel}` : ""}${localidade ? `, ${localidade}` : ""}`;
  const alt = `Foto do imóvel ${codeLabel || title}${property.cidade ? ` em ${property.cidade}` : ""}`;

  if (view === "list") {
    return (
      <article className={cn(CARD_SHELL, "flex items-stretch gap-3 p-2.5 sm:gap-4 sm:p-3")}>
        <Link
          to="/imoveis/$imovelId"
          params={{ imovelId: property.id }}
          aria-label={ariaLabel}
          className="absolute inset-0 z-[1] rounded-[22px] outline-none"
        />
        <div className="relative w-24 shrink-0 self-stretch overflow-hidden rounded-2xl sm:aspect-[4/3] sm:w-44 sm:self-auto">
          <div className="absolute inset-0">
            <Cover property={property} alt={alt} />
          </div>
          <span className="absolute left-2 top-2 hidden sm:block">
            <OperacaoBadge operacao={property.operacao} />
          </span>
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-between gap-1.5 py-0.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="truncate text-[14px] font-semibold leading-tight text-foreground sm:text-[15px]">
                  {title}
                </h3>
                <CodeChips codes={codes} className="hidden sm:flex" />
              </div>
              {localidade ? (
                <p className="mt-0.5 flex items-center gap-1 truncate text-[12px] text-foreground/55">
                  <MapPin className="size-3 shrink-0 text-foreground/40" />
                  <span className="truncate">{localidade}</span>
                </p>
              ) : null}
            </div>
            <Price property={property} className="hidden shrink-0 text-[17px] sm:flex" />
          </div>

          <div className="flex items-center gap-1.5 sm:hidden">
            <OperacaoBadge operacao={property.operacao} tone="surface" />
            <CodeChips codes={codes} />
          </div>

          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0 space-y-1">
              <Price property={property} className="text-[16px] sm:hidden" />
              <Specs property={property} />
            </div>
            <div className="hidden items-center gap-2 sm:flex">
              <PublicationBadges property={property} tone="surface" />
              <CardActions property={property} />
            </div>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className={cn(CARD_SHELL, "flex flex-col")}>
      <Link
        to="/imoveis/$imovelId"
        params={{ imovelId: property.id }}
        aria-label={ariaLabel}
        className="absolute inset-0 z-[1] rounded-[22px] outline-none"
      />

      <div className="relative aspect-[4/3] w-full overflow-hidden sm:aspect-[16/10]">
        <Cover property={property} alt={alt} />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/30 to-transparent" />
        <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
          <OperacaoBadge operacao={property.operacao} />
          <PublicationBadges property={property} />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3.5 sm:p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 truncate text-[15px] font-semibold leading-tight text-foreground">
            {title}
          </h3>
          <CodeChips codes={codes} />
        </div>

        <Price property={property} className="text-[19px] leading-none" />

        {localidade ? (
          <p className="flex items-center gap-1 truncate text-[12px] text-foreground/55">
            <MapPin className="size-3 shrink-0 text-foreground/40" />
            <span className="truncate">{localidade}</span>
          </p>
        ) : null}

        <div className="mt-auto flex items-center justify-between gap-2 border-t border-foreground/[0.06] pt-2.5">
          <Specs property={property} />
          <CardActions
            property={property}
            className="ml-auto lg:opacity-0 lg:transition-opacity lg:group-hover:opacity-100 lg:group-focus-within:opacity-100"
          />
        </div>
      </div>
    </article>
  );
}

export function PropertyCatalogCardSkeleton({ view = "grid" }: { view?: CatalogView }) {
  if (view === "list") {
    return (
      <div className="flex items-stretch gap-3 rounded-[22px] border border-white/60 bg-white/55 p-2.5 sm:gap-4 sm:p-3">
        <div className="aspect-square w-24 shrink-0 animate-pulse rounded-2xl bg-foreground/[0.06] sm:aspect-[4/3] sm:w-44" />
        <div className="flex flex-1 flex-col justify-between gap-2 py-1">
          <div className="space-y-2">
            <div className="h-4 w-1/3 animate-pulse rounded-md bg-foreground/[0.07]" />
            <div className="h-3 w-1/2 animate-pulse rounded-md bg-foreground/[0.05]" />
          </div>
          <div className="h-3 w-2/5 animate-pulse rounded-md bg-foreground/[0.05]" />
        </div>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-[22px] border border-white/60 bg-white/55">
      <div className="aspect-[4/3] w-full animate-pulse bg-foreground/[0.06] sm:aspect-[16/10]" />
      <div className="space-y-2.5 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="h-4 w-1/3 animate-pulse rounded-md bg-foreground/[0.07]" />
          <div className="h-4 w-14 animate-pulse rounded-md bg-foreground/[0.05]" />
        </div>
        <div className="h-5 w-2/5 animate-pulse rounded-md bg-primary/10" />
        <div className="h-3 w-3/5 animate-pulse rounded-md bg-foreground/[0.05]" />
        <div className="h-3 w-1/2 animate-pulse rounded-md bg-foreground/[0.05]" />
      </div>
    </div>
  );
}
