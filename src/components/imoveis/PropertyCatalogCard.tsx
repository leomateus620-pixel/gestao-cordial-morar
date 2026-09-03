import { Link } from "@tanstack/react-router";
import { Bath, Bed, Car, Image as ImageIcon, Maximize2, MapPin, Pencil } from "lucide-react";
import { brl } from "@/lib/format";
import { CopyPublicLinkButton } from "./CopyPublicLinkButton";

import {
  formatArea,
  propertyLocalidade,
  PUBLICATION_STATUS_LABEL,
  type Property,
} from "@/types/property";

const PROVIDER_LABEL: Record<string, string> = { cordial: "Cordial", morar: "Morar" };

function dotTone(status: string) {
  if (status === "published") return "bg-emerald-500";
  if (status === "error" || status === "out_of_sync") return "bg-amber-500";
  if (status === "unpublished" || status === "draft") return "bg-white/50";
  return "bg-sky-400";
}

export function PropertyCatalogCard({ property }: { property: Property }) {
  const localidade = propertyLocalidade(property);
  const area = formatArea(property.areaPrincipal);
  const specs = [
    property.dormitorios ? { icon: Bed, text: `${property.dormitorios}` } : null,
    property.banheiros ? { icon: Bath, text: `${property.banheiros}` } : null,
    property.vagas
      ? { icon: Car, text: `${property.vagas}` }
      : area
        ? { icon: Maximize2, text: area }
        : null,
  ]
    .filter(Boolean)
    .slice(0, 3) as Array<{ icon: typeof Bed; text: string }>;

  const price =
    property.valorModo === "consulte" || property.valor === null
      ? "Consulte"
      : brl(property.valor);

  // Códigos por imobiliária; imóveis antigos caem no código legado importado.
  const providerCodes = [
    property.codigoCordial
      ? { provider: "cordial" as const, label: "Cordial", value: property.codigoCordial }
      : null,
    property.codigoMorar
      ? { provider: "morar" as const, label: "Morar", value: property.codigoMorar }
      : null,
  ].filter(Boolean) as Array<{ provider: "cordial" | "morar"; label: string; value: string }>;

  const codes: Array<{ provider: "cordial" | "morar" | "legado"; label: string; value: string }> =
    providerCodes.length > 0
      ? providerCodes
      : property.codigo
        ? [{ provider: "legado", label: "Código", value: property.codigo }]
        : [];

  const codeLabel = codes.map((c) => c.value).join(" / ");

  return (
    <div className="group relative overflow-hidden rounded-3xl border border-white/60 bg-white/70 shadow-[0_10px_30px_-14px_rgba(23,27,33,0.18)] backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl focus-within:ring-2 focus-within:ring-primary/40">
      <Link
        to="/imoveis/$imovelId"
        params={{ imovelId: property.id }}
        className="block outline-none"
        aria-label={`Abrir ficha do imóvel ${property.codigo ?? property.tipo ?? ""}`}
      >
        <div className="relative aspect-[16/9] w-full overflow-hidden">
          {property.coverUrl ? (
            <img
              src={property.coverUrl}
              alt={`Foto do imóvel ${property.codigo ?? ""} em ${property.cidade ?? "catálogo"}`}
              loading="lazy"
              className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="grid size-full place-items-center bg-gradient-to-br from-foreground/[0.07] to-foreground/[0.03] text-foreground/20">
              <ImageIcon className="size-10" strokeWidth={1.2} />
            </div>
          )}

          <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur-sm">
            {property.operacao === "venda" ? "Venda" : "Aluguel"}
          </span>

          {(property.publications.length > 0 || property.removalState) && (
            <span className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-black/45 px-2 py-1.5 backdrop-blur-sm">
              {property.publications.map((publication) => (
                <span
                  key={publication.provider}
                  title={`${PROVIDER_LABEL[publication.provider] ?? publication.provider}: ${
                    PUBLICATION_STATUS_LABEL[publication.status] ?? publication.status
                  }`}
                  className={`size-2.5 rounded-full ring-2 ring-white/40 ${dotTone(publication.status)}`}
                />
              ))}
              {property.removalState === "pending_removal" && (
                <span
                  title="Remoção pendente"
                  className="size-2.5 rounded-full bg-rose-500 ring-2 ring-white/40"
                />
              )}
            </span>
          )}
        </div>

        <div className="space-y-1.5 p-4">
          <div className="flex items-baseline justify-between gap-2">
            <p className="flex min-w-0 items-baseline gap-1.5 truncate text-[15px] font-semibold leading-tight">
              <span className="truncate">{property.tipo ?? "Imóvel"}</span>
              {codes.map((code) => (
                <span
                  key={`${code.provider}-${code.value}`}
                  title={`${code.label}: ${code.value}`}
                  className={`shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none ${
                    code.provider === "cordial"
                      ? "bg-sky-500/10 text-sky-700"
                      : code.provider === "morar"
                        ? "bg-orange-500/10 text-orange-700"
                        : "bg-foreground/[0.06] text-foreground/50"
                  }`}
                >
                  {code.value}
                </span>
              ))}
            </p>
            <p className="shrink-0 text-base font-bold text-primary">{price}</p>
          </div>

          {property.localizacaoExibida || localidade ? (
            <p className="flex items-center gap-1 truncate text-xs text-foreground/55">
              <MapPin className="size-3 shrink-0" />
              {property.localizacaoExibida ?? localidade}
            </p>
          ) : null}

          {specs.length > 0 && (
            <div className="flex items-center gap-4 pt-0.5 text-xs font-medium text-foreground/60">
              {specs.map((s, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  <s.icon className="size-3.5" />
                  {s.text}
                </span>
              ))}
              {property.publications.some((p) => p.status === "published") && (
                <span className="ml-auto flex items-center gap-1">
                  {property.publications
                    .filter((p) => p.status === "published")
                    .map((p) => (
                      <CopyPublicLinkButton
                        key={p.provider}
                        provider={p.provider}
                        url={p.publicUrl}
                        compact
                      />
                    ))}
                </span>
              )}
            </div>
          )}
        </div>
      </Link>

      <Link
        to="/imoveis/$imovelId/editar"
        params={{ imovelId: property.id }}
        aria-label="Editar imóvel"
        title="Editar imóvel"
        className="absolute bottom-3 right-3 grid size-8 place-items-center rounded-full bg-white/80 text-foreground/55 opacity-0 shadow-sm backdrop-blur-sm transition hover:text-primary group-hover:opacity-100 focus:opacity-100"
      >
        <Pencil className="size-3.5" />
      </Link>
    </div>
  );
}
