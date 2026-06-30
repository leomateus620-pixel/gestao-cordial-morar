import type { RentalContractStatus, RentalPaymentStatus } from "@/types/rental";

const CONTRACT_TONES: Record<RentalContractStatus, { bg: string; fg: string; label: string }> = {
  ativo: { bg: "rgba(47,158,104,0.15)", fg: "#1f7a4d", label: "Ativo" },
  pendente_assinatura: { bg: "rgba(214,164,55,0.18)", fg: "#8a6a14", label: "Pendente" },
  vencido: { bg: "rgba(217,120,45,0.18)", fg: "#9a4f17", label: "Vencendo" },
  encerrado: { bg: "rgba(138,143,152,0.18)", fg: "#5a5f68", label: "Encerrado" },
  cancelado: { bg: "rgba(201,76,76,0.14)", fg: "#a83838", label: "Cancelado" },
};

const PAYMENT_TONES: Record<RentalPaymentStatus, { bg: string; fg: string; label: string }> = {
  em_dia: { bg: "rgba(47,158,104,0.15)", fg: "#1f7a4d", label: "Em dia" },
  vence_hoje: { bg: "rgba(214,164,55,0.18)", fg: "#8a6a14", label: "Vence hoje" },
  atrasado: { bg: "rgba(201,76,76,0.16)", fg: "#a83838", label: "Atrasado" },
  pago: { bg: "rgba(47,158,104,0.15)", fg: "#1f7a4d", label: "Pago" },
  pendente: { bg: "rgba(59,130,160,0.14)", fg: "#235f7a", label: "Pendente" },
};

export function RentalStatusBadge({ status }: { status: RentalContractStatus }) {
  const t = CONTRACT_TONES[status];
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider"
      style={{ background: t.bg, color: t.fg }}
    >
      {t.label}
    </span>
  );
}

export function RentalPaymentBadge({ status }: { status: RentalPaymentStatus }) {
  const t = PAYMENT_TONES[status];
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
      style={{ background: t.bg, color: t.fg }}
    >
      {t.label}
    </span>
  );
}
