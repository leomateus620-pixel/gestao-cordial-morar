import type { Corretor } from "@/lib/mock/data";
import { brl } from "@/lib/format";
import { cn } from "@/lib/utils";

export function BrokerCard({ broker }: { broker: Corretor }) {
  const agencyColor =
    broker.imobiliaria === "morar"
      ? "var(--morar-primary)"
      : broker.imobiliaria === "ambas"
        ? "var(--system-primary)"
        : "var(--cordial-primary)";
  const agencyLabel =
    broker.imobiliaria === "morar"
      ? "Morar"
      : broker.imobiliaria === "ambas"
        ? "Cordial + Morar"
        : "Cordial";

  return (
    <article
      className="rounded-2xl p-4 transition-all duration-200 hover:scale-[1.01]"
      style={{
        background:
          "linear-gradient(160deg, rgba(255,255,255,0.72) 0%, rgba(255,255,255,0.52) 100%)",
        backdropFilter: "blur(18px) saturate(145%)",
        border: "1px solid rgba(255,255,255,0.6)",
        boxShadow: "0 8px 24px -8px rgba(23,27,33,0.1), inset 0 1px 0 rgba(255,255,255,0.8)",
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="grid size-12 shrink-0 place-items-center rounded-full text-sm font-bold text-white"
          style={{ background: agencyColor }}
        >
          {broker.iniciais}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{broker.nome}</p>
          <p className="text-[11px] text-foreground/50">{broker.creci}</p>
          <span
            className="mt-0.5 inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white"
            style={{ background: agencyColor }}
          >
            {agencyLabel}
          </span>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <MiniMetric label="Atend." value={broker.atendimentosMes} />
        <MiniMetric label="Fechad." value={broker.contratosFechados} />
        <MiniMetric label="Comis." value={brl(broker.comissaoMes, { compact: true })} accent />
      </div>
    </article>
  );
}

function MiniMetric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div className={cn("rounded-xl p-2.5", accent ? "bg-primary/10" : "bg-white/45")}>
      <p
        className={cn(
          "text-[9px] font-semibold uppercase tracking-wider",
          accent ? "text-primary/70" : "text-foreground/45",
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          "mt-1 font-mono text-base font-bold",
          accent ? "text-primary" : "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}
