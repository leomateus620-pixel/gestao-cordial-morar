import { memo, useCallback, type CSSProperties, type PointerEvent } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  BadgeDollarSign,
  ClipboardCheck,
  Eye,
  Handshake,
  type LucideIcon,
  Minus,
  Percent,
  UserRoundCheck,
} from "lucide-react";
import { getAgenciamentoCompletion, getCorretorAgencyLabel } from "@/services/corretores";
import type { Corretor, CorretorPerformanceTrend } from "@/types/corretor";
import { brl } from "@/lib/format";
import { cn } from "@/lib/utils";

type CorretorCardProps = {
  corretor: Corretor;
  onSelect: (corretor: Corretor) => void;
};

const trendIcon: Record<CorretorPerformanceTrend, typeof ArrowUpRight> = {
  alta: ArrowUpRight,
  estavel: Minus,
  queda: ArrowDownRight,
};

const trendLabel: Record<CorretorPerformanceTrend, string> = {
  alta: "Alta",
  estavel: "Estável",
  queda: "Queda",
};

function CorretorCardComponent({ corretor, onSelect }: CorretorCardProps) {
  const agencyColor =
    corretor.imobiliaria === "morar"
      ? "var(--morar-primary)"
      : corretor.imobiliaria === "ambas"
        ? "var(--system-primary)"
        : "var(--cordial-primary)";
  const completion = getAgenciamentoCompletion(corretor);
  const TrendIcon = trendIcon[corretor.performanceTrend ?? "estavel"];

  const handlePointerMove = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "touch") return;
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    event.currentTarget.style.setProperty("--broker-tilt-x", `${(-y * 5).toFixed(2)}deg`);
    event.currentTarget.style.setProperty("--broker-tilt-y", `${(x * 6).toFixed(2)}deg`);
    event.currentTarget.style.setProperty("--broker-lift", "-5px");
  }, []);

  const handlePointerLeave = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.style.setProperty("--broker-tilt-x", "0deg");
    event.currentTarget.style.setProperty("--broker-tilt-y", "0deg");
    event.currentTarget.style.setProperty("--broker-lift", "0px");
    event.currentTarget.style.setProperty("--broker-scale", "1");
  }, []);

  const handlePointerDown = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.style.setProperty("--broker-scale", "0.985");
    event.currentTarget.style.setProperty("--broker-lift", "-1px");
  }, []);

  const handlePointerUp = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.style.setProperty("--broker-scale", "1");
    event.currentTarget.style.setProperty(
      "--broker-lift",
      event.pointerType === "touch" ? "0px" : "-5px",
    );
  }, []);

  return (
    <button
      type="button"
      onClick={() => onSelect(corretor)}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      aria-label={`Abrir detalhes de ${corretor.nome}`}
      className="group relative min-w-0 overflow-hidden rounded-[1.65rem] p-4 text-left shadow-[0_20px_48px_-28px_rgba(23,27,33,0.42)] outline-none ring-1 ring-white/65 transition-[box-shadow,filter] duration-300 focus-visible:ring-2 focus-visible:ring-primary/35 sm:p-5"
      style={
        {
          "--broker-tilt-x": "0deg",
          "--broker-tilt-y": "0deg",
          "--broker-lift": "0px",
          "--broker-scale": "1",
          background:
            "linear-gradient(156deg, rgba(255,255,255,0.82) 0%, rgba(255,255,255,0.58) 58%, rgba(240,248,250,0.52) 100%)",
          border: "1px solid rgba(255,255,255,0.68)",
          transform:
            "perspective(900px) rotateX(var(--broker-tilt-x)) rotateY(var(--broker-tilt-y)) translateY(var(--broker-lift)) scale(var(--broker-scale))",
          transformStyle: "preserve-3d",
          transition:
            "transform 230ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 230ms ease, filter 230ms ease",
        } as CSSProperties
      }
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-5 top-0 h-px opacity-80"
        style={{ background: `linear-gradient(90deg, transparent, ${agencyColor}, transparent)` }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-12 size-36 rounded-full opacity-10 blur-2xl"
        style={{ background: agencyColor }}
      />

      <div
        className="relative z-10 flex items-start gap-3"
        style={{ transform: "translateZ(24px)" }}
      >
        <span
          className="grid size-13 shrink-0 place-items-center rounded-2xl text-sm font-black text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.26),0_16px_30px_-22px_rgba(23,27,33,0.9)]"
          style={{ background: agencyColor }}
        >
          {corretor.iniciais}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="min-w-0 truncate text-base font-bold tracking-tight text-foreground">
              {corretor.nome}
            </h3>
            {corretor.rankingPosicao && (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 font-mono text-[10px] font-black tabular-nums",
                  corretor.rankingPosicao === 1
                    ? "bg-[rgba(217,120,45,0.14)] text-[var(--system-accent-dark)]"
                    : "bg-primary/10 text-primary",
                )}
              >
                #{corretor.rankingPosicao}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-[11px] font-medium text-foreground/50">
            {corretor.creci}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-white/65 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-foreground/55 ring-1 ring-foreground/5">
              {getCorretorAgencyLabel(corretor.imobiliaria)}
            </span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] ring-1",
                corretor.status === "ativo"
                  ? "bg-emerald-500/10 text-emerald-700 ring-emerald-500/15"
                  : "bg-foreground/5 text-foreground/45 ring-foreground/[0.08]",
              )}
            >
              {corretor.status === "ativo" ? "Ativo" : "Inativo"}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-white/65 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-foreground/50 ring-1 ring-foreground/5">
              <TrendIcon className="size-3" />
              {trendLabel[corretor.performanceTrend ?? "estavel"]}
            </span>
          </div>
        </div>
      </div>

      <div
        className="relative z-10 mt-5 grid grid-cols-3 gap-2"
        style={{ transform: "translateZ(18px)" }}
      >
        <MainMetric label="Atend." value={corretor.atendimentosRecebidos} />
        <MainMetric label="Fechados" value={corretor.contratosFechados} accent />
        <MainMetric label="Conversão" value={`${corretor.taxaConversao}%`} />
      </div>

      <div
        className="relative z-10 mt-3 grid grid-cols-2 gap-2"
        style={{ transform: "translateZ(14px)" }}
      >
        <MoneyMetric label="Prevista" value={brl(corretor.comissaoPrevista, { compact: true })} />
        <MoneyMetric label="Paga" value={brl(corretor.comissaoPaga, { compact: true })} muted />
      </div>

      <div
        className="relative z-10 mt-4 flex flex-wrap gap-1.5"
        style={{ transform: "translateZ(10px)" }}
      >
        <CompactChip icon={Eye} label="Visitas" value={corretor.visitasRealizadas} />
        <CompactChip icon={Percent} label="Propostas" value={corretor.propostasFeitas} />
        <CompactChip icon={Handshake} label="Vendas" value={corretor.vendasFechadas} />
        <CompactChip icon={UserRoundCheck} label="Aluguéis" value={corretor.alugueisFechados} />
        <CompactChip icon={ClipboardCheck} label="Agenc." value={corretor.agenciamentosFeitos} />
      </div>

      <div className="relative z-10 mt-4" style={{ transform: "translateZ(8px)" }}>
        <div className="flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-[0.14em] text-foreground/42">
          <span>Checklist de agenciamentos</span>
          <span className="font-mono text-primary">{completion}%</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-foreground/[0.07]">
          <span
            className="block h-full rounded-full"
            style={{
              width: `${completion}%`,
              background: `linear-gradient(90deg, ${agencyColor}, var(--system-primary-light))`,
            }}
          />
        </div>
      </div>
    </button>
  );
}

function MainMetric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-2xl px-3 py-3 text-center ring-1 ring-white/60",
        accent ? "bg-primary/[0.095]" : "bg-white/[0.58]",
      )}
    >
      <p className="truncate text-[9px] font-bold uppercase tracking-[0.14em] text-foreground/45">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 truncate font-mono text-xl font-black leading-none tabular-nums",
          accent ? "text-primary" : "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function MoneyMetric({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-2xl px-3 py-3 ring-1 ring-white/60",
        muted ? "bg-white/[0.58]" : "bg-[rgba(217,120,45,0.09)]",
      )}
    >
      <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-foreground/45">
        <BadgeDollarSign className="size-3" />
        {label}
      </p>
      <p
        className={cn(
          "mt-1 truncate font-mono text-base font-black tabular-nums",
          muted ? "text-foreground/68" : "text-[var(--system-accent-dark)]",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function CompactChip({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
}) {
  return (
    <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-white/[0.58] px-2.5 text-[11px] font-semibold text-foreground/58 ring-1 ring-white/60">
      <Icon className="size-3.5 text-primary/60" />
      <span>{label}</span>
      <span className="font-mono font-black text-foreground/76">{value}</span>
    </span>
  );
}

export const CorretorCard = memo(CorretorCardComponent);
