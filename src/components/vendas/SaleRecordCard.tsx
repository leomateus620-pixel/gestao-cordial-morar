import {
  ArrowUpRight,
  Building2,
  CalendarDays,
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
  const addressMeta = metaAddress(sale) || sale.propertyAddress;
  const isCanceled = sale.saleStatus === "cancelada";
  const showDocumentStatus = !(isCanceled && sale.documentStatus === "cancelado");

  return (
    <article className="group rounded-[1.5rem] border border-white/70 bg-white/[0.64] p-4 shadow-[0_18px_46px_-36px_rgba(23,27,33,0.44)] backdrop-blur-xl transition-[transform,background-color,border-color,box-shadow] duration-200 ease-out hover:border-white/90 hover:bg-white/[0.76] hover:shadow-[0_24px_58px_-38px_rgba(23,27,33,0.5)] focus-within:border-primary/25 focus-within:shadow-[0_22px_50px_-34px_rgba(30,100,125,0.34)] motion-reduce:transform-none motion-reduce:transition-none xl:hover:-translate-y-0.5">
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(16rem,1.28fr)_minmax(15rem,0.88fr)_minmax(9.5rem,0.5fr)_auto] xl:items-center xl:gap-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-[0.9rem] bg-primary/[0.09] text-primary ring-1 ring-primary/10">
            <Building2 className="size-[1.15rem]" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="min-w-0 break-words text-[15px] font-black leading-5 tracking-[-0.015em] text-foreground sm:text-base">
              {sale.propertyName}
            </h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.11em] text-primary/62">
                {sale.propertyType}
              </p>
              <SaleStatusBadge status={sale.saleStatus} />
            </div>
            <p className="mt-1.5 flex min-w-0 items-start gap-1.5 text-xs font-medium leading-5 text-foreground/55">
              <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 break-words">{addressMeta}</span>
            </p>
          </div>
        </div>

        <dl className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-3 border-t border-foreground/[0.07] pt-3 xl:border-l xl:border-t-0 xl:py-0 xl:pl-5">
          <InfoItem
            icon={UserRound}
            label="Comprador"
            value={sale.buyerName}
            className="col-span-2"
          />
          <InfoItem icon={CalendarDays} label="Data da venda" value={formatDate(sale.saleDate)} />
          <InfoItem
            icon={WalletCards}
            label="Corretor"
            value={sale.ownerName || sale.responsibleAgent || "Não informado"}
          />
        </dl>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center xl:contents">
          <div className="flex min-w-0 items-end justify-between gap-3 border-t border-foreground/[0.07] pt-3 sm:border-t-0 sm:pt-0 xl:block xl:border-l xl:pl-5 xl:text-right">
            <div className="min-w-0">
              <p className="text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-foreground/45">
                Valor vendido
              </p>
              <p className="mt-1 break-words text-xl font-black leading-none tracking-[-0.025em] text-primary tabular-nums">
                {brl(sale.saleValue)}
              </p>
            </div>
            {showDocumentStatus && (
              <SaleStatusBadge
                status={sale.documentStatus}
                type="document"
                className="shrink-0 xl:mt-2"
              />
            )}
          </div>

          <button
            type="button"
            onClick={() => onOpen(sale)}
            className={cn(
              "inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-foreground px-4 text-sm font-extrabold text-background shadow-[0_12px_24px_-15px_rgba(23,27,33,0.78)] transition-[transform,background-color,color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.985] motion-reduce:transform-none motion-reduce:transition-none sm:w-auto xl:h-10",
              "hover:bg-primary hover:text-primary-foreground hover:shadow-[0_14px_28px_-14px_rgba(30,100,125,0.66)]",
            )}
            aria-label={`Ver detalhes da venda de ${sale.propertyName}`}
          >
            Ver detalhes
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </article>
  );
}

function InfoItem({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon: typeof WalletCards;
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-[0.1em] text-foreground/43">
        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
        {label}
      </dt>
      <dd className="mt-1 break-words text-xs font-bold leading-4 text-foreground/75">{value}</dd>
    </div>
  );
}

export function SaleRecordSkeleton() {
  return (
    <div
      className="min-h-[11.5rem] animate-pulse rounded-[1.5rem] border border-white/70 bg-white/[0.58] p-4 motion-reduce:animate-none xl:min-h-[7.5rem]"
      aria-hidden="true"
    >
      <div className="grid h-full gap-5 xl:grid-cols-[minmax(16rem,1.28fr)_minmax(15rem,0.88fr)_minmax(9.5rem,0.5fr)_auto] xl:items-center">
        <div className="flex items-start gap-3">
          <span className="size-10 shrink-0 rounded-[0.9rem] bg-foreground/[0.07]" />
          <div className="flex-1 space-y-2">
            <span className="block h-4 w-2/3 rounded bg-foreground/[0.08]" />
            <span className="block h-3 w-1/3 rounded bg-foreground/[0.06]" />
            <span className="block h-3 w-4/5 rounded bg-foreground/[0.06]" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <span className="col-span-2 block h-4 rounded bg-foreground/[0.06]" />
          <span className="block h-4 rounded bg-foreground/[0.06]" />
          <span className="block h-4 rounded bg-foreground/[0.06]" />
        </div>
        <span className="block h-8 rounded bg-primary/[0.08]" />
        <span className="block h-10 rounded-2xl bg-foreground/[0.09]" />
      </div>
    </div>
  );
}
