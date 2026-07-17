import { AlertTriangle, CalendarClock, MapPin, User, Wallet } from "lucide-react";
import { brl } from "@/lib/format";
import type { RentalContractFull } from "@/types/rental";
import { RentalPaymentBadge, RentalStatusBadge } from "./RentalStatusBadge";

function fmtDate(s?: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("pt-BR");
}

function BrandBadge({ brand }: { brand?: string | null }) {
  const b = brand === "morar" ? "morar" : "cordial";
  const label = b === "morar" ? "Morar" : "Cordial";
  const cls =
    b === "morar"
      ? "bg-[color:var(--morar-primary,#8b5cf6)]/12 text-[color:var(--morar-primary,#8b5cf6)] ring-[color:var(--morar-primary,#8b5cf6)]/25"
      : "bg-[color:var(--cordial-primary,#0ea5e9)]/12 text-[color:var(--cordial-primary,#0ea5e9)] ring-[color:var(--cordial-primary,#0ea5e9)]/25";
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ring-1 ${cls}`}>
      {label}
    </span>
  );
}


export function RentalCard({
  contract,
  onClick,
}: {
  contract: RentalContractFull;
  onClick: () => void;
}) {
  const today = new Date();
  const fim = new Date(contract.dataFim);
  const diffDias = Math.ceil((fim.getTime() - today.getTime()) / 86400000);
  const venceLogo = contract.status === "ativo" && diffDias > 0 && diffDias <= 30;
  const atrasado = contract.paymentStatus === "atrasado";

  return (
    <button
      onClick={onClick}
      className="group block w-full text-left transition active:scale-[0.997]"
    >
      <article className="liquid-panel relative overflow-hidden rounded-3xl p-4 transition will-change-transform hover:-translate-y-0.5 hover:shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-sm font-semibold leading-tight">
                {contract.property.apelido}
              </p>
              <BrandBadge brand={contract.brand} />
            </div>
            <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-foreground/55">
              <MapPin className="size-3 shrink-0" />
              {[contract.property.bairro, contract.property.cidade]
                .filter(Boolean)
                .join(" · ") || contract.property.logradouro}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <RentalStatusBadge status={contract.status} />
            <RentalPaymentBadge status={contract.paymentStatus} />
          </div>
        </div>


        <div className="mt-3 flex items-end justify-between border-t border-white/40 pt-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1 text-[11px] text-foreground/60">
              <User className="size-3 shrink-0" />
              <span className="truncate">{contract.tenant.nome}</span>
              {contract.tenants && contract.tenants.length > 1 && (
                <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold text-primary">
                  +{contract.tenants.length - 1}
                </span>
              )}
            </p>
            <p className="mt-1 flex items-center gap-1 text-[10px] text-foreground/55">
              <CalendarClock className="size-3 shrink-0" />
              {fmtDate(contract.dataInicio)} → {fmtDate(contract.dataFim)}
            </p>
          </div>
          <div className="text-right">
            <p className="flex items-center justify-end gap-1 font-mono text-sm font-bold text-primary">
              <Wallet className="size-3" />
              {brl(contract.valorMensal)}
            </p>
            <p className="text-[10px] text-foreground/55">
              Próx: {fmtDate(contract.proximoVencimento)}
            </p>
          </div>
        </div>

        {(venceLogo || atrasado) && (
          <div
            className={
              "mt-3 flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[10px] font-medium " +
              (atrasado
                ? "bg-rose-500/10 text-rose-700"
                : "bg-amber-500/10 text-amber-700")
            }
          >
            <AlertTriangle className="size-3" />
            {atrasado
              ? "Pagamento em atraso"
              : `Contrato vence em ${diffDias} dia${diffDias === 1 ? "" : "s"}`}
          </div>
        )}
      </article>
    </button>
  );
}
