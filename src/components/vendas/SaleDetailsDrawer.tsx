import {
  Building2,
  CalendarClock,
  Check,
  Edit3,
  ExternalLink,
  FileText,
  MapPinned,
  ReceiptText,
  RefreshCw,
  UserRound,
  Wallet,
  X,
  XCircle,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { brl } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SaleRecord } from "@/types/sale";
import { SaleStatusBadge } from "./SaleStatusBadge";

function formatDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR");
}

function formatDateTime(date: string) {
  return new Date(date).toLocaleString("pt-BR");
}

export function SaleDetailsDrawer({
  sale,
  open,
  onOpenChange,
  onEdit,
  onReplaceContract,
  onCancel,
  onOpenContract,
  onOpenAttachment,
  onAddAttachment,
  onRemoveAttachment,
  onMarkPaymentPaid,
}: {
  sale: SaleRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (sale: SaleRecord) => void;
  onReplaceContract: (sale: SaleRecord) => void;
  onCancel: (sale: SaleRecord) => void;
  onOpenContract?: () => void;
  onOpenAttachment?: (path: string) => void;
  onAddAttachment?: (sale: SaleRecord, file: File) => Promise<void> | void;
  onRemoveAttachment?: (attachmentId: string) => Promise<void> | void;
  onMarkPaymentPaid?: (paymentId: string, paid: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-dvh w-full max-w-full flex-col overflow-hidden border-white/40 bg-[#f7f3ed]/96 p-0 text-foreground backdrop-blur-2xl sm:max-w-2xl [&>button]:hidden"
      >
        {sale && (
          <>
            <SheetHeader className="border-b border-white/60 px-5 pb-4 pt-5 text-left sm:px-6">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
                    <ReceiptText className="size-6" />
                  </span>
                  <div className="min-w-0">
                    <SheetTitle className="truncate text-xl font-black tracking-tight sm:text-2xl">
                      {sale.propertyName}
                    </SheetTitle>
                    <SheetDescription className="mt-1 text-sm font-medium text-foreground/56">
                      Venda registrada em {formatDate(sale.saleDate)} para {sale.buyerName}
                    </SheetDescription>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <SaleStatusBadge status={sale.saleStatus} />
                      <SaleStatusBadge status={sale.documentStatus} type="document" />
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-white/60 text-foreground/60 ring-1 ring-white/70 transition hover:bg-white hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  aria-label="Fechar detalhes da venda"
                >
                  <X className="size-4" />
                </button>
              </div>
            </SheetHeader>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <MiniStat
                  label="Valor vendido"
                  value={brl(sale.saleValue, { compact: true })}
                  accent
                />
                <MiniStat label="Pagamento" value={sale.paymentMethod} />
                <MiniStat
                  label="Comissão"
                  value={
                    sale.commissionValue
                      ? brl(sale.commissionValue, { compact: true })
                      : sale.commissionPercentage
                        ? `${sale.commissionPercentage}%`
                        : "—"
                  }
                />
                <MiniStat label="Área" value={sale.areaM2 ? `${sale.areaM2} m²` : "—"} />
              </div>

              <Panel title="Dados da venda" icon={ReceiptText}>
                <MetricRow label="Imóvel vendido" value={sale.propertyName} strong />
                <MetricRow label="Valor vendido" value={brl(sale.saleValue)} strong />
                <MetricRow label="Data da venda" value={formatDate(sale.saleDate)} />
                <MetricRow label="Forma de pagamento" value={sale.paymentMethod} />
                <MetricRow label="Detalhes do pagamento" value={sale.paymentDetails || "—"} />
                <MetricRow label="Corretor" value={sale.ownerName || "—"} />
                <MetricRow label="Responsável" value={sale.responsibleAgent || "—"} />

                <MetricRow
                  label="Comissão"
                  value={
                    sale.commissionValue
                      ? brl(sale.commissionValue)
                      : sale.commissionPercentage
                        ? `${sale.commissionPercentage}%`
                        : "—"
                  }
                />
              </Panel>

              <Panel title="Comprador" icon={UserRound}>
                <MetricRow label="Nome completo" value={sale.buyerName} strong />
                <MetricRow label="CPF/CNPJ" value={sale.buyerDocument || "—"} />
                <MetricRow label="Telefone / WhatsApp" value={sale.buyerPhone || "—"} />
                <MetricRow label="E-mail" value={sale.buyerEmail || "—"} />
                <MetricRow label="Endereço" value={sale.buyerAddress || "—"} />
                <MetricRow label="Observações" value={sale.buyerObservations || "—"} />
              </Panel>

              <Panel title="Imóvel" icon={Building2}>
                <MetricRow label="Referência" value={sale.propertyName} strong />
                <MetricRow label="Endereço" value={sale.propertyAddress} />
                <MetricRow label="Bairro" value={sale.propertyNeighborhood || "—"} />
                <MetricRow label="Cidade/UF" value={sale.propertyCityState || "—"} />
                <MetricRow label="Tipo" value={sale.propertyType} />
                <MetricRow label="Quartos" value={sale.bedrooms ?? "—"} />
                <MetricRow label="Banheiros" value={sale.bathrooms ?? "—"} />
                <MetricRow label="Área" value={sale.areaM2 ? `${sale.areaM2} m²` : "—"} />
                <MetricRow
                  label="Valor pedido anterior"
                  value={sale.previousAskingPrice ? brl(sale.previousAskingPrice) : "—"}
                />
              </Panel>

              {sale.payments && sale.payments.length > 0 && (
                <Panel title="Plano de pagamento" icon={Wallet}>
                  <div className="space-y-2">
                    {[...sale.payments]
                      .sort((a, b) => {
                        if (a.kind !== b.kind) return a.kind === "entrada" ? -1 : 1;
                        return a.sequence - b.sequence;
                      })
                      .map((p) => {
                        const overdue =
                          !p.paid && new Date(`${p.dueDate}T23:59:59`) < new Date();
                        return (
                          <div
                            key={p.id}
                            className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.62] px-3 py-3 ring-1 ring-white/70"
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-foreground">
                                {p.kind === "entrada"
                                  ? "Entrada"
                                  : `Parcela ${p.sequence + 1}`}
                              </p>
                              <p className="mt-0.5 text-[11px] font-semibold text-foreground/56">
                                Vence em {formatDate(p.dueDate)}
                                {p.paid && p.paidAt
                                  ? ` · pago em ${formatDate(p.paidAt.slice(0, 10))}`
                                  : overdue
                                    ? " · em atraso"
                                    : ""}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span
                                className={cn(
                                  "font-mono text-sm font-black tabular-nums",
                                  p.paid
                                    ? "text-emerald-700"
                                    : overdue
                                      ? "text-rose-700"
                                      : "text-foreground",
                                )}
                              >
                                {brl(p.amount)}
                              </span>
                              {onMarkPaymentPaid && (
                                <button
                                  type="button"
                                  onClick={() => onMarkPaymentPaid(p.id, !p.paid)}
                                  className={cn(
                                    "inline-flex h-8 items-center gap-1 rounded-xl px-2.5 text-[11px] font-bold ring-1 transition",
                                    p.paid
                                      ? "bg-emerald-500/10 text-emerald-800 ring-emerald-500/25 hover:bg-emerald-500/15"
                                      : "bg-primary/10 text-primary ring-primary/25 hover:bg-primary/15",
                                  )}
                                >
                                  <Check className="size-3.5" />
                                  {p.paid ? "Pago" : "Marcar pago"}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </Panel>
              )}

              <Panel title="Documentos" icon={FileText}>
                <MetricRow
                  label="Contrato"
                  value={sale.contractFileName || "Contrato ainda não anexado"}
                  strong={Boolean(sale.contractFileName)}
                />
                <MetricRow
                  label="Documento auxiliar"
                  value={sale.supportingDocumentFileName || "—"}
                />
                <MetricRow
                  label="Status documental"
                  value={<SaleStatusBadge status={sale.documentStatus} type="document" />}
                />
                {sale.contractFilePath && onOpenContract ? (
                  <button
                    type="button"
                    onClick={onOpenContract}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition hover:brightness-110"
                  >
                    <ExternalLink className="size-4" />
                    Abrir contrato
                  </button>
                ) : sale.contractFileUrl ? (
                  <a
                    href={sale.contractFileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition hover:brightness-110"
                  >
                    <ExternalLink className="size-4" />
                    Abrir contrato
                  </a>
                ) : (
                  <p className="rounded-2xl bg-white/50 px-3 py-3 text-xs font-medium leading-5 text-foreground/58 ring-1 ring-white/70">
                    Nenhum contrato anexado a este registro.
                  </p>
                )}
              </Panel>

              <Panel title="Histórico" icon={CalendarClock}>
                <MetricRow label="Criado em" value={formatDateTime(sale.createdAt)} />
                <MetricRow label="Atualizado em" value={formatDateTime(sale.updatedAt)} />
                <MetricRow label="Observações internas" value={sale.notes || "—"} />
              </Panel>
            </div>

            <div className="grid gap-2 border-t border-white/60 bg-white/45 px-5 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:grid-cols-[1fr_auto_auto] sm:px-6">
              <button
                type="button"
                onClick={() => onEdit(sale)}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-foreground px-4 text-sm font-bold text-background shadow-lg shadow-foreground/10 transition hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-[0.98]"
              >
                <Edit3 className="size-4" />
                Editar registro
              </button>
              <button
                type="button"
                onClick={() => onReplaceContract(sale)}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-white/70 px-4 text-sm font-bold text-foreground/72 ring-1 ring-white/80 transition hover:bg-white hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-[0.98]"
              >
                <RefreshCw className="size-4" />
                Substituir contrato
              </button>
              {sale.saleStatus !== "cancelada" && (
                <button
                  type="button"
                  onClick={() => onCancel(sale)}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-rose-500/10 px-4 text-sm font-bold text-rose-700 ring-1 ring-rose-600/15 transition hover:bg-rose-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/35 active:scale-[0.98]"
                >
                  <XCircle className="size-4" />
                  Cancelar venda
                </button>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-2xl px-3 py-3 text-center ring-1 ring-white/65",
        accent ? "bg-primary/[0.095]" : "bg-white/[0.58]",
      )}
    >
      <p className="truncate text-[9px] font-bold uppercase tracking-[0.14em] text-foreground/45">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 truncate font-mono text-base font-black leading-none tabular-nums",
          accent ? "text-primary" : "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function Panel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof MapPinned;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[1.35rem] border border-white/60 bg-white/[0.5] p-4 shadow-[0_14px_34px_-28px_rgba(23,27,33,0.24)]">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-4" />
        </span>
        <h3 className="text-sm font-black tracking-tight">{title}</h3>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function MetricRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-2xl bg-white/[0.62] px-3 py-3 ring-1 ring-white/70">
      <span className="text-xs font-semibold text-foreground/48">{label}</span>
      <span
        className={cn(
          "max-w-[64%] text-right text-xs font-bold text-foreground/72",
          strong && "text-primary",
        )}
      >
        {value}
      </span>
    </div>
  );
}
