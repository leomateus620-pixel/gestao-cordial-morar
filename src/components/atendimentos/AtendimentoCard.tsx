import { useState } from "react";
import {
  ArrowRight,
  Building2,
  CalendarClock,
  CalendarDays,
  ChevronRight,
  CircleAlert,
  MapPin,
  MessageCircle,
  Phone,
  UserRound,
} from "lucide-react";
import {
  AtendimentoActionsDialog,
  type AtendimentoActionPayload,
} from "@/components/atendimentos/AtendimentoActionsDialog";
import { pipelineStageUi } from "@/components/atendimentos/pipeline-ui";
import {
  atendimentoInterestLine,
  formatAtendimentoBudget,
  formatDate,
  formatDateTime,
  getPipelineContext,
  isAtendimentoOverdue,
  whatsappHref,
} from "@/services/atendimentos";
import {
  ACTIVE_PIPELINE_STAGES,
  atendimentoImobiliariaLabel,
  atendimentoOrigemLabel,
  atendimentoPrioridadeLabel,
  atendimentoProximoPassoLabel,
  atendimentoStatusLabel,
  pipelineStageLabel,
  type Atendimento,
  type PipelineStage,
} from "@/types/atendimento";
import { cn } from "@/lib/utils";

type Props = {
  atendimento: Atendimento;
  onOpen: (atendimento: Atendimento) => void;
  onStageChange: (id: string, stage: PipelineStage) => Promise<void> | void;
  onAction: (payload: AtendimentoActionPayload, atendimento: Atendimento) => Promise<void> | void;
  brokerOptions?: Array<{ id: string; nome: string }>;
};

export function AtendimentoCard({
  atendimento,
  onOpen,
  onStageChange,
  onAction,
  brokerOptions = [],
}: Props) {
  const [schedulingReturn, setSchedulingReturn] = useState(false);
  const [moving, setMoving] = useState(false);
  const initials = getInitials(atendimento.clienteNome);
  const overdue = isAtendimentoOverdue(atendimento);
  const whatsapp = whatsappHref(atendimento.telefone);
  const pipeline = getPipelineContext(atendimento);
  const nextStage = pipeline.next;
  const stageUi = pipelineStageUi[atendimento.pipelineStage];

  async function moveTo(stage: PipelineStage) {
    if (moving || stage === atendimento.pipelineStage) return;
    setMoving(true);
    try {
      await onStageChange(atendimento.id, stage);
    } finally {
      setMoving(false);
    }
  }

  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-[1.4rem] border border-l-[3px] bg-[#fffdf9] shadow-[0_10px_28px_-22px_rgba(31,41,55,0.7)] transition-[border-color,box-shadow,transform] duration-200",
        "hover:-translate-y-0.5 hover:border-foreground/18 hover:shadow-[0_18px_36px_-22px_rgba(31,41,55,0.55)]",
        stageUi.accent,
      )}
      id={`atendimento-${atendimento.id}`}
    >
      <div className="p-4">
        <header className="flex items-start gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-2xl border border-teal-900/8 bg-teal-800/10 text-[11px] font-extrabold tracking-wide text-teal-900">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="min-w-0 text-[15px] font-bold leading-5 tracking-[-0.015em] text-stone-950">
                <span className="line-clamp-2">{atendimento.clienteNome}</span>
              </h3>
              <span
                className={cn(
                  "shrink-0 rounded-full border px-2 py-1 text-[9px] font-extrabold uppercase tracking-[0.08em]",
                  stageUi.badge,
                )}
              >
                {pipelineStageLabel(atendimento.pipelineStage)}
              </span>
            </div>
            <p className="mt-1 line-clamp-2 text-[11px] font-medium leading-4.5 text-stone-600">
              {atendimentoInterestLine(atendimento)}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-medium text-stone-500">
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="size-3.5 text-stone-400" />
                Criado em {formatDate(atendimento.criadoEm)}
              </span>
              <span className="font-semibold text-stone-700">
                {atendimentoStatusLabel(atendimento.status)}
              </span>
            </div>
          </div>
        </header>

        <section
          className={cn(
            "mt-3 rounded-2xl border px-3 py-2.5",
            overdue
              ? "border-rose-700/20 bg-rose-50 text-rose-950"
              : "border-teal-900/10 bg-teal-950/[0.035] text-stone-800",
          )}
          aria-label="Próxima ação"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[9px] font-extrabold uppercase tracking-[0.12em] text-current/60">
                {overdue ? (
                  <CircleAlert className="size-3.5" />
                ) : (
                  <CalendarClock className="size-3.5" />
                )}
                {overdue ? "Retorno atrasado" : "Próxima ação"}
              </p>
              <p className="mt-1 truncate text-xs font-bold">
                {atendimentoProximoPassoLabel(atendimento.proximoPasso)}
              </p>
            </div>
            <p className="shrink-0 text-right text-[10px] font-semibold leading-4">
              {formatDateTime(atendimento.proximoRetorno)}
            </p>
          </div>
        </section>

        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5 text-[11px]">
          <ContextRow icon={UserRound} label="Corretor">
            {atendimento.corretorNome ?? "A definir"}
          </ContextRow>
          <ContextRow icon={Phone} label="Telefone">
            <span className="break-words">{atendimento.telefone || "Não informado"}</span>
          </ContextRow>
          <ContextRow icon={MapPin} label="Região">
            {atendimento.bairroInteresse ?? "A definir"}
          </ContextRow>
          <ContextRow icon={Building2} label="Faixa">
            {formatAtendimentoBudget(atendimento)}
          </ContextRow>
        </dl>

        {atendimento.imovel ? (
          <div className="mt-3 rounded-xl border border-amber-800/12 bg-amber-50/70 px-3 py-2.5">
            <p className="text-[9px] font-extrabold uppercase tracking-[0.11em] text-amber-900/55">
              Imóvel vinculado
            </p>
            <p className="mt-1 line-clamp-2 text-[11px] font-bold leading-4.5 text-stone-800">
              {atendimento.imovel.codigo ? `${atendimento.imovel.codigo} · ` : ""}
              {atendimento.imovel.titulo}
            </p>
          </div>
        ) : null}

        <div className="mt-3 grid grid-cols-3 divide-x divide-stone-200 overflow-hidden rounded-xl border border-stone-900/8 bg-stone-50 text-center">
          <PipelinePoint label="Anterior">
            {pipeline.previous ? pipelineStageLabel(pipeline.previous) : "Entrada"}
          </PipelinePoint>
          <PipelinePoint label="Atual" active>
            {pipelineStageLabel(pipeline.current)}
          </PipelinePoint>
          <PipelinePoint label="Próxima">
            {nextStage ? pipelineStageLabel(nextStage) : "Concluído"}
          </PipelinePoint>
        </div>
        {pipeline.transitionAt ? (
          <p className="mt-1.5 truncate px-1 text-[9px] font-medium text-stone-500">
            Última transição: {formatDateTime(pipeline.transitionAt)}
            {pipeline.transitionActor ? ` · ${pipeline.transitionActor}` : ""}
          </p>
        ) : null}
      </div>

      <footer className="border-t border-stone-900/8 bg-stone-50/75 p-3">
        {ACTIVE_PIPELINE_STAGES.includes(atendimento.pipelineStage) ? (
          <label className="block">
            <span className="sr-only">Mover atendimento para outra etapa</span>
            <select
              value={atendimento.pipelineStage}
              disabled={moving}
              onChange={(event) => void moveTo(event.target.value as PipelineStage)}
              className="h-10 w-full rounded-xl border border-stone-300 bg-white px-3 text-[11px] font-bold text-stone-800 outline-none transition focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15 disabled:opacity-60"
              aria-label={`Etapa de ${atendimento.clienteNome}`}
            >
              {ACTIVE_PIPELINE_STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {pipelineStageLabel(stage)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-center text-[10px] font-bold text-stone-600">
            {pipelineStageLabel(atendimento.pipelineStage)} · gerencie no atendimento completo
          </p>
        )}

        <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
          <button
            type="button"
            onClick={() => onOpen(atendimento)}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-teal-800 px-3 text-xs font-bold text-white shadow-[0_8px_18px_-10px_rgba(17,94,89,0.9)] transition duration-200 hover:bg-teal-900 active:scale-[0.98]"
          >
            Abrir atendimento
            <ArrowRight className="size-3.5" />
          </button>
          {whatsapp ? (
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Falar com ${atendimento.clienteNome} no WhatsApp`}
              title="Falar no WhatsApp"
              className="grid size-10 place-items-center rounded-xl border border-emerald-700/20 bg-emerald-50 text-emerald-800 transition duration-200 hover:bg-emerald-100 active:scale-[0.98]"
            >
              <MessageCircle className="size-4.5" />
            </a>
          ) : (
            <span
              className="grid size-10 place-items-center rounded-xl border border-stone-200 bg-stone-100 text-stone-400"
              title="Telefone inválido para WhatsApp"
              aria-label="WhatsApp indisponível: telefone inválido"
            >
              <MessageCircle className="size-4.5" />
            </span>
          )}
        </div>

        {overdue || !atendimento.proximoRetorno ? (
          <button
            type="button"
            onClick={() => setSchedulingReturn(true)}
            className="mt-2 inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-amber-700/20 bg-amber-50 px-3 text-[11px] font-bold text-amber-950 transition duration-200 hover:bg-amber-100 active:scale-[0.99]"
          >
            <CalendarClock className="size-3.5" />
            {overdue ? "Reagendar próxima ação" : "Agendar próxima ação"}
          </button>
        ) : nextStage ? (
          <button
            type="button"
            disabled={moving}
            onClick={() => void moveTo(nextStage)}
            className="mt-2 inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-teal-800/15 bg-white px-3 text-[11px] font-bold text-teal-900 transition duration-200 hover:bg-teal-50 active:scale-[0.99] disabled:opacity-60"
          >
            Avançar para {pipelineStageLabel(nextStage)}
            <ChevronRight className="size-3.5" />
          </button>
        ) : null}
      </footer>

      <AtendimentoActionsDialog
        kind="criar-retorno"
        atendimento={atendimento}
        brokerOptions={brokerOptions}
        open={schedulingReturn}
        onOpenChange={setSchedulingReturn}
        onSubmit={(payload) => onAction(payload, atendimento)}
      />
    </article>
  );
}

function ContextRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof UserRound;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1 text-[9px] font-extrabold uppercase tracking-[0.1em] text-stone-400">
        <Icon className="size-3" />
        {label}
      </dt>
      <dd className="mt-0.5 truncate font-semibold text-stone-700">{children}</dd>
    </div>
  );
}

function PipelinePoint({
  label,
  active = false,
  children,
}: {
  label: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 px-1.5 py-2">
      <p className="text-[7px] font-extrabold uppercase tracking-[0.1em] text-stone-400">{label}</p>
      <p
        className={cn(
          "mt-0.5 line-clamp-2 text-[9px] font-bold leading-3.5 text-stone-600",
          active && "text-teal-900",
        )}
      >
        {children}
      </p>
    </div>
  );
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "??";
}
