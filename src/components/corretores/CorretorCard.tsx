import { memo } from "react";
import {
  ArrowUpRight,
  BadgeDollarSign,
  CalendarClock,
  ClipboardCheck,
  Clock3,
  Eye,
  Handshake,
  Home,
  Percent,
  type LucideIcon,
} from "lucide-react";
import { brl, shortDate } from "@/lib/format";
import { formatElapsedSeconds } from "@/lib/time/elapsed";
import { getCorretorAgencyLabel } from "@/services/corretores";
import type { Corretor, CorretorSourceStatus } from "@/types/corretor";
import { cn } from "@/lib/utils";

type CorretorCardProps = {
  corretor: Corretor;
  sourceStatus: CorretorSourceStatus;
  onSelect: (corretor: Corretor) => void;
};

function clampPercentage(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function availableMoney(value: number | null, available: boolean) {
  return available && value != null ? brl(value, { compact: true }) : "—";
}

function CorretorCardComponent({ corretor, sourceStatus, onSelect }: CorretorCardProps) {
  const checklist = clampPercentage(corretor.agenciamentosChecklistPercent);
  const attendanceReady = sourceStatus.atendimentos === "ready";
  const agendaReady = sourceStatus.agenda === "ready";
  const listingsReady = sourceStatus.agenciamentos === "ready";
  const salesReady = sourceStatus.vendas === "ready";
  const rentalsReady = sourceStatus.alugueis === "ready";
  const responseReady = sourceStatus.respostas === "ready";
  const hasUnavailableSource = Object.values(sourceStatus).some((status) => status === "error");
  const responseTime = !responseReady
    ? "Indisponível"
    : corretor.medianaRespostaSegundos != null && corretor.respostasMedidas > 0
      ? formatElapsedSeconds(Math.round(corretor.medianaRespostaSegundos))
      : "Sem amostra";

  return (
    <button
      type="button"
      onClick={() => onSelect(corretor)}
      aria-label={`Abrir detalhes operacionais de ${corretor.nome}. Checklist de agenciamentos: ${
        listingsReady ? `${checklist}% concluído` : "indisponível"
      }`}
      className="group relative flex h-full min-w-0 w-full flex-col overflow-hidden rounded-[1.5rem] border border-border/70 bg-card p-4 text-left shadow-[0_14px_40px_-30px_rgba(15,23,42,0.5)] outline-none transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_20px_44px_-28px_rgba(15,23,42,0.42)] focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:translate-y-0 motion-reduce:transform-none motion-reduce:transition-none sm:p-5"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary text-sm font-black text-primary-foreground">
          {corretor.iniciais}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="min-w-0 flex-1 truncate text-base font-bold tracking-tight text-foreground">
              {corretor.nome}
            </h3>
            {corretor.rankingPosicao ? (
              <span className="shrink-0 rounded-full bg-primary/9 px-2 py-1 font-mono text-[10px] font-black text-primary">
                #{corretor.rankingPosicao}
              </span>
            ) : null}
          </div>

          <p className="mt-1 truncate text-xs font-medium text-muted-foreground">
            {getCorretorAgencyLabel(corretor.imobiliaria)}
            {corretor.creci ? ` · ${corretor.creci}` : ""}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em]",
                corretor.status === "ativo"
                  ? "bg-emerald-500/10 text-emerald-700"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {corretor.status === "ativo" ? "Ativo" : "Inativo"}
            </span>
            {corretor.agencies.map((agency) => (
              <span
                key={agency}
                className="rounded-full border border-border/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
              >
                {agency}
              </span>
            ))}
          </div>
        </div>

        <ArrowUpRight
          aria-hidden="true"
          className="size-5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
        />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <MainMetric
          label="Atendimentos"
          value={attendanceReady ? corretor.atendimentosRecebidos : "—"}
        />
        <MainMetric
          label="Fechados"
          value={attendanceReady ? corretor.contratosDeAtendimento : "—"}
          accent
        />
        <MainMetric
          label="Conversão"
          value={attendanceReady ? `${corretor.taxaConversao}%` : "—"}
        />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <MoneyMetric
          label="Mediana de resposta"
          value={
            responseReady && corretor.medianaRespostaSegundos != null
              ? formatElapsedSeconds(Math.round(corretor.medianaRespostaSegundos))
              : "—"
          }
        />
        <MoneyMetric
          label="Fora do prazo (72h)"
          value={responseReady ? String(corretor.respostasForaDoPrazo) : "—"}
          muted
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <CompactChip
          icon={Eye}
          label="Visitas"
          value={agendaReady ? corretor.visitasRealizadas : "—"}
        />
        <CompactChip
          icon={Percent}
          label="Propostas"
          value={attendanceReady ? corretor.propostasFeitas : "—"}
        />
        <CompactChip
          icon={Handshake}
          label="Vendas"
          value={salesReady ? corretor.vendasFechadas : "—"}
        />
        <CompactChip
          icon={Home}
          label="Aluguéis"
          value={rentalsReady ? corretor.alugueisAtribuidos : "—"}
        />
        <CompactChip
          icon={ClipboardCheck}
          label="Agenciamentos"
          value={listingsReady ? corretor.agenciamentosFeitos : "—"}
        />
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <OperationalSignal icon={Clock3} label="Resposta média" value={responseTime} />
        <OperationalSignal
          icon={CalendarClock}
          label="Próximo compromisso"
          value={
            !agendaReady
              ? "Indisponível"
              : corretor.proximoCompromisso
                ? shortDate(corretor.proximoCompromisso.startsAt)
                : "Sem compromisso"
          }
        />
      </div>

      {hasUnavailableSource ? (
        <p className="mt-3 rounded-xl bg-amber-500/[0.08] px-3 py-2 text-xs leading-relaxed text-foreground/70">
          Algumas fontes operacionais estão indisponíveis neste recorte.
        </p>
      ) : corretor.destaqueOperacional ? (
        <p className="mt-3 rounded-xl bg-primary/[0.055] px-3 py-2 text-xs leading-relaxed text-foreground/70">
          {corretor.destaqueOperacional}
        </p>
      ) : null}

      <div className="mt-auto pt-4">
        <div className="flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground">
          <span>Checklist de agenciamentos</span>
          <span className="font-mono text-primary">{listingsReady ? `${checklist}%` : "—"}</span>
        </div>
        <div aria-hidden="true" className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <span
            aria-hidden="true"
            className="block h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: listingsReady ? `${checklist}%` : "0%" }}
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
        "min-w-0 rounded-2xl bg-muted/55 px-2 py-3 text-center",
        accent && "bg-primary/8",
      )}
    >
      <p className="truncate text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 truncate font-mono text-lg font-black leading-none tabular-nums text-foreground",
          accent && "text-primary",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function MoneyMetric({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={cn("rounded-2xl bg-amber-500/[0.075] px-3 py-3", muted && "bg-muted/55")}>
      <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        <BadgeDollarSign className="size-3" aria-hidden="true" />
        {label}
      </p>
      <p className="mt-1 truncate font-mono text-sm font-black tabular-nums text-foreground">
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
  value: number | string;
}) {
  return (
    <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border/60 bg-background/65 px-2.5 text-[11px] font-medium text-muted-foreground">
      <Icon className="size-3.5 text-primary/70" aria-hidden="true" />
      <span>{label}</span>
      <span className="font-mono font-black text-foreground">{value}</span>
    </span>
  );
}

function OperationalSignal({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-xl border border-border/60 px-3 py-2.5">
      <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
      <div className="min-w-0">
        <p className="truncate text-[9px] font-bold uppercase tracking-[0.11em] text-muted-foreground">
          {label}
        </p>
        <p className="mt-0.5 truncate text-xs font-bold text-foreground">{value}</p>
      </div>
    </div>
  );
}

export const CorretorCard = memo(CorretorCardComponent);
