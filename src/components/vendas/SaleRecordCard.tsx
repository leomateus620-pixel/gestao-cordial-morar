import {
  ArrowUpRight,
  Building2,
  CalendarDays,
  FileText,
  MapPin,
  UserRound,
  WalletCards,
} from "lucide-react";
import { brl } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SaleRecord } from "@/types/sale";
import { SaleStatusBadge } from "./SaleStatusBadge";

function formatDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR");
}

function metaAddress(sale: SaleRecord) {
  return [sale.propertyNeighborhood, sale.propertyCityState].filter(Boolean).join(" · ");
}

export function SaleRecordCard({
  sale,
  onOpen,
}: {
  sale: SaleRecord;
  onOpen: (sale: SaleRecord) => void;
}) {
  const addressMeta = metaAddress(sale);

  return (
    <article className="group rounded-3xl border border-white/60 bg-white/[0.58] p-3 shadow-[0_18px_45px_-32px_rgba(23,27,33,0.3)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-white/[0.72] hover:shadow-[0_24px_55px_-34px_rgba(23,27,33,0.36)]">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(12rem,0.75fr)_minmax(10rem,0.55fr)_auto] lg:items-center">
        <div className="flex min-w-0 gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/10">
            <Building2 className="size-5" />
          </span>
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h3 className="min-w-0 truncate text-sm font-black tracking-tight text-foreground sm:text-base">
                {sale.propertyName}
              </h3>
              <SaleStatusBadge status={sale.saleStatus} />
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-foreground/56">
              <MapPin className="size-3.5 shrink-0" />
              <span className="min-w-0 truncate">{addressMeta || sale.propertyAddress}</span>
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-1">
          <InfoLine icon={UserRound} label="Comprador" value={sale.buyerName} />
          <InfoLine icon={CalendarDays} label="Data da venda" value={formatDate(sale.saleDate)} />
          <InfoLine icon={FileText} label="Responsável" value={sale.responsibleAgent || "—"} />
        </div>

        <div className="flex items-end justify-between gap-3 rounded-2xl bg-primary/[0.07] px-3 py-2.5 ring-1 ring-primary/10 lg:block lg:text-right">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-primary/65">
              Valor vendido
            </p>
            <p className="mt-1 font-mono text-lg font-black leading-none text-primary tabular-nums">
              {brl(sale.saleValue)}
            </p>
          </div>
          <SaleStatusBadge status={sale.documentStatus} type="document" className="lg:mt-2" />
        </div>

        <button
          type="button"
          onClick={() => onOpen(sale)}
          className={cn(
            "inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-foreground px-4 text-sm font-bold text-background shadow-lg shadow-foreground/10 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-[0.98] lg:h-10",
            "hover:bg-primary hover:text-primary-foreground hover:shadow-primary/20",
          )}
          aria-label={`Ver detalhes da venda de ${sale.propertyName}`}
        >
          Ver detalhes
          <ArrowUpRight className="size-4" />
        </button>
      </div>
    </article>
  );
}

function InfoLine({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof WalletCards;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl bg-white/55 px-3 py-2 ring-1 ring-white/70">
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-foreground/42">
        <Icon className="size-3" />
        {label}
      </p>
      <p className="mt-1 truncate text-xs font-bold text-foreground/76">{value}</p>
    </div>
  );
}
