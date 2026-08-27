import { Link } from "@tanstack/react-router";
import { Bath, Bed, Car, ImageOff, Maximize2, MapPin } from "lucide-react";
import { brl } from "@/lib/format";
import {
  formatArea,
  propertyLocalidade,
  PUBLICATION_STATUS_LABEL,
  type Property,
} from "@/types/property";

function Missing({ label }: { label: string }) {
  return (
    <span className="text-[10px] font-medium italic text-foreground/35">
      {label}: não informado no catálogo
    </span>
  );
}

const PROVIDER_LABEL: Record<string, string> = { cordial: "Cordial", morar: "Morar" };

function statusTone(status: string) {
  if (status === "published") return "bg-emerald-500/12 text-emerald-700";
  if (status === "error" || status === "out_of_sync") return "bg-amber-500/15 text-amber-700";
  if (status === "unpublished" || status === "draft") return "bg-foreground/[0.06] text-foreground/55";
  return "bg-primary/10 text-primary";
}

export function PropertyCatalogCard({ property }: { property: Property }) {
  const localidade = propertyLocalidade(property);
  const area = formatArea(property.areaPrincipal);
  const specs = [
    property.dormitorios !== null
      ? { icon: Bed, text: `${property.dormitorios} dorm.` }
      : null,
    property.banheiros !== null ? { icon: Bath, text: `${property.banheiros} banh.` } : null,
    property.vagas !== null ? { icon: Car, text: `${property.vagas} vagas` } : null,
    area ? { icon: Maximize2, text: area } : null,
  ].filter(Boolean) as Array<{ icon: typeof Bed; text: string }>;

  return (
    <Link
      to="/imoveis/$imovelId"
      params={{ imovelId: property.id }}
      className="group block overflow-hidden rounded-3xl transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl"
      style={{
        background:
          "linear-gradient(160deg, rgba(255,255,255,0.78) 0%, rgba(255,255,255,0.58) 100%)",
        backdropFilter: "blur(18px) saturate(145%)",
        border: "1px solid rgba(255,255,255,0.62)",
        boxShadow:
          "0 10px 30px -12px rgba(23,27,33,0.12), inset 0 1px 0 rgba(255,255,255,0.85)",
      }}
    >
      <div className="flex gap-3 p-3">
        {property.coverUrl ? (
          <img
            src={property.coverUrl}
            alt={`Foto do imóvel ${property.codigo ?? ""} em ${property.cidade ?? "catálogo"}`}
            loading="lazy"
            className="aspect-square w-20 shrink-0 rounded-2xl object-cover sm:w-24"
          />
        ) : (
          <div className="grid aspect-square w-20 shrink-0 place-items-center rounded-2xl bg-foreground/[0.05] text-foreground/30 sm:w-24">
            <div className="flex flex-col items-center gap-1">
              <ImageOff className="size-5" />
              <span className="px-1 text-center text-[8px] leading-tight">
                Imagem não disponível
              </span>
            </div>
          </div>
        )}


        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight">
                {property.tipo ?? "Imóvel"}
              </p>
              {property.codigo ? (
                <p className="mt-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-foreground/45">
                  Cód. {property.codigo}
                </p>
              ) : null}
            </div>
            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
              {property.operacao === "venda" ? "Venda" : "Aluguel"}
            </span>
          </div>

          {property.localizacaoExibida ? (
            <p className="mt-1 flex items-start gap-1 text-[11px] leading-snug text-foreground/55">
              <MapPin className="mt-[2px] size-3 shrink-0" />
              <span className="line-clamp-2">{property.localizacaoExibida}</span>
            </p>
          ) : localidade ? (
            <p className="mt-1 flex items-center gap-1 truncate text-[11px] text-foreground/55">
              <MapPin className="size-3 shrink-0" />
              {localidade}
            </p>
          ) : (
            <p className="mt-1">
              <Missing label="Localização" />
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-foreground/55">
              {specs.length > 0 ? (
                specs.map((s) => (
                  <span key={s.text} className="flex items-center gap-1">
                    <s.icon className="size-3" />
                    {s.text}
                  </span>
                ))
              ) : (
                <Missing label="Características" />
              )}
            </div>
            <p className="shrink-0 font-mono text-sm font-bold text-primary">
              {property.valorModo === "consulte" || property.valor === null
                ? "Consulte"
                : brl(property.valor)}
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}
