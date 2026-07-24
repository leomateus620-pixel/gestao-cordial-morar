import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X, Clock, MessageSquare, User, Building2, Phone, Mail, MapPin, Send } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  addAttendanceNote,
  listAttendanceHistory,
  type AttendanceHistoryEvent,
} from "@/lib/attendances/attendances.functions";
import {
  atendimentoImobiliariaLabel,
  atendimentoOrigemLabel,
  atendimentoPrioridadeLabel,
  atendimentoProximoPassoLabel,
  atendimentoStatusLabel,
  atendimentoTipoImovelLabel,
  atendimentoFinalidadeLabel,
  pipelineStageLabel,
  pipelineStageOptions,
  type Atendimento,
  type PipelineStage,
} from "@/types/atendimento";
import {
  atendimentoInterestLine,
  formatAtendimentoBudget,
  formatDateTime,
} from "@/services/atendimentos";
import { ATTENDANCES_QUERY_KEY } from "@/hooks/useAttendances";
import { cn } from "@/lib/utils";

export function AtendimentoDetailDrawer({
  atendimento,
  open,
  onOpenChange,
  onStageChange,
}: {
  atendimento: Atendimento | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStageChange?: (id: string, stage: PipelineStage) => Promise<void> | void;
}) {
  const [note, setNote] = useState("");
  const qc = useQueryClient();

  const historyQuery = useQuery({
    queryKey: ["attendance-history", atendimento?.id],
    queryFn: () => listAttendanceHistory({ data: { attendanceId: atendimento!.id } }),
    enabled: Boolean(atendimento?.id && open),
    staleTime: 10_000,
  });

  const noteMutation = useMutation({
    mutationFn: (texto: string) =>
      addAttendanceNote({ data: { attendanceId: atendimento!.id, texto } }),
    onSuccess: () => {
      setNote("");
      toast.success("Nota adicionada ao histórico.");
      qc.invalidateQueries({ queryKey: ["attendance-history", atendimento?.id] });
      qc.invalidateQueries({ queryKey: ATTENDANCES_QUERY_KEY });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erro ao registrar nota."),
  });

  useEffect(() => {
    if (!open) setNote("");
  }, [open]);

  if (!atendimento) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full max-w-full overflow-y-auto border-white/60 bg-background/98 p-0 backdrop-blur-xl sm:max-w-xl md:max-w-2xl"
      >
        <SheetHeader className="sticky top-0 z-10 border-b border-white/50 bg-background/95 px-5 py-4 backdrop-blur-xl">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-teal-700/80">
                CRM · Atendimento
              </p>
              <SheetTitle className="mt-1 truncate text-lg font-semibold sm:text-xl">
                {atendimento.clienteNome}
              </SheetTitle>
              <SheetDescription className="mt-0.5 text-xs text-foreground/60">
                {atendimentoInterestLine(atendimento)} · {atendimentoImobiliariaLabel(atendimento.imobiliaria)}
              </SheetDescription>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="grid size-9 shrink-0 place-items-center rounded-full bg-white/70 text-foreground/60 hover:text-foreground"
              aria-label="Fechar"
            >
              <X className="size-4" />
            </button>
          </div>
        </SheetHeader>

        <div className="space-y-5 px-5 py-5">
          <StagePicker
            current={atendimento.pipelineStage}
            onPick={async (stage) => {
              if (stage === atendimento.pipelineStage) return;
              try {
                await onStageChange?.(atendimento.id, stage);
                toast.success(`Etapa: ${pipelineStageLabel(stage)}`);
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Erro ao mudar etapa.");
              }
            }}
          />

          <section className="grid gap-3 sm:grid-cols-2">
            <InfoCard label="Status" icon={Clock}>
              {atendimentoStatusLabel(atendimento.status)}
            </InfoCard>
            <InfoCard label="Prioridade" icon={Clock}>
              {atendimentoPrioridadeLabel(atendimento.prioridade)}
            </InfoCard>
            <InfoCard label="Corretor" icon={User}>
              {atendimento.corretorNome ?? "A definir"}
            </InfoCard>
            <InfoCard label="Origem" icon={Building2}>
              {atendimentoOrigemLabel(atendimento.origem)}
            </InfoCard>
            <InfoCard label="Telefone" icon={Phone}>
              {atendimento.telefone}
            </InfoCard>
            <InfoCard label="E-mail" icon={Mail}>
              {atendimento.email ?? "—"}
            </InfoCard>
          </section>

          <section className="glass-panel rounded-2xl p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground/60">
              Interesse comercial
            </h3>
            <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
              <DlRow label="Finalidade">{atendimentoFinalidadeLabel(atendimento.finalidade)}</DlRow>
              <DlRow label="Tipo">{atendimentoTipoImovelLabel(atendimento.tipoImovel)}</DlRow>
              <DlRow label="Dormitórios">{atendimento.dormitorios ?? "—"}</DlRow>
              <DlRow label="Bairro">{atendimento.bairroInteresse ?? "—"}</DlRow>
              <DlRow label="Orçamento">{formatAtendimentoBudget(atendimento)}</DlRow>
              <DlRow label="Próximo retorno">{formatDateTime(atendimento.proximoRetorno)}</DlRow>
              <DlRow label="Próximo passo">
                {atendimentoProximoPassoLabel(atendimento.proximoPasso)}
              </DlRow>
              <DlRow label="Imóvel vinculado">
                <span className="flex items-center gap-1">
                  {atendimento.imovelDescricao ? <MapPin className="size-3" /> : null}
                  {atendimento.imovelDescricao ??
                    (atendimento.imovelCodigo ? `Cód. ${atendimento.imovelCodigo}` : "—")}
                </span>
              </DlRow>
            </dl>
            {atendimento.observacoes && (
              <p className="mt-3 rounded-xl bg-white/60 px-3 py-2 text-xs leading-5 text-foreground/70 whitespace-pre-wrap">
                {atendimento.observacoes}
              </p>
            )}
          </section>

          <section className="glass-panel rounded-2xl p-4">
            <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-foreground/60">
              <MessageSquare className="size-3.5" /> Nova nota
            </h3>
            <div className="mt-2 flex gap-2">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Registre uma anotação, follow-up ou observação..."
                className="flex-1 rounded-xl border border-white/60 bg-white/70 px-3 py-2 text-sm outline-none focus:border-teal-700/40 focus:ring-2 focus:ring-teal-700/15"
              />
              <button
                type="button"
                disabled={!note.trim() || noteMutation.isPending}
                onClick={() => noteMutation.mutate(note.trim())}
                className="grid size-11 shrink-0 place-items-center self-start rounded-xl bg-teal-700 text-white shadow-lg shadow-teal-700/25 hover:bg-teal-800 disabled:opacity-45"
                aria-label="Salvar nota"
              >
                <Send className="size-4" />
              </button>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="px-1 text-xs font-bold uppercase tracking-wider text-foreground/60">
              Histórico
            </h3>
            <HistoryTimeline
              events={historyQuery.data ?? []}
              isLoading={historyQuery.isLoading}
            />
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function StagePicker({
  current,
  onPick,
}: {
  current: PipelineStage;
  onPick: (stage: PipelineStage) => void;
}) {
  return (
    <div className="glass-panel rounded-2xl p-3">
      <h3 className="px-1 text-[10px] font-bold uppercase tracking-[0.14em] text-foreground/60">
        Etapa do funil
      </h3>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {pipelineStageOptions.map((opt) => {
          const active = opt.value === current;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onPick(opt.value)}
              className={cn(
                "rounded-full px-3 py-1.5 text-[11px] font-semibold transition",
                active
                  ? "bg-teal-700 text-white shadow-md shadow-teal-700/25"
                  : "bg-white/60 text-foreground/68 hover:bg-teal-700/10 hover:text-teal-800",
              )}
            >
              {opt.short}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function InfoCard({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon: typeof Clock;
  children: React.ReactNode;
}) {
  return (
    <div className="glass-panel rounded-2xl px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-foreground/55">
        <Icon className="size-3" /> {label}
      </div>
      <p className="mt-1 truncate text-sm font-semibold text-foreground">{children}</p>
    </div>
  );
}

function DlRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white/50 px-3 py-2">
      <dt className="text-[9px] font-bold uppercase tracking-[0.14em] text-foreground/50">{label}</dt>
      <dd className="mt-0.5 text-xs font-medium text-foreground/85">{children}</dd>
    </div>
  );
}

function HistoryTimeline({
  events,
  isLoading,
}: {
  events: AttendanceHistoryEvent[];
  isLoading: boolean;
}) {
  const items = useMemo(() => events, [events]);
  if (isLoading) {
    return (
      <div className="glass-panel rounded-2xl p-6 text-center text-xs text-foreground/50">
        Carregando histórico...
      </div>
    );
  }
  if (!items.length) {
    return (
      <div className="glass-panel rounded-2xl p-6 text-center text-xs text-foreground/50">
        Nenhum evento registrado ainda.
      </div>
    );
  }
  return (
    <ol className="relative space-y-2 border-l border-teal-700/15 pl-4">
      {items.map((ev) => (
        <li key={ev.id} className="relative">
          <span className="absolute -left-[19px] top-1.5 grid size-3 place-items-center rounded-full bg-teal-700 ring-4 ring-background" />
          <div className="glass-panel rounded-2xl p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="rounded-full bg-teal-700/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-teal-800">
                {eventTypeLabel(ev.eventType)}
              </span>
              <time className="font-mono text-[10px] text-foreground/45">
                {formatDateTime(ev.createdAt)}
              </time>
            </div>
            {ev.description && (
              <p className="mt-1.5 text-xs leading-5 text-foreground/78 whitespace-pre-wrap">
                {ev.description}
              </p>
            )}
            {ev.actorName && (
              <p className="mt-1 text-[10px] text-foreground/45">por {ev.actorName}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function eventTypeLabel(type: string): string {
  const map: Record<string, string> = {
    criacao: "Criação",
    stage_change: "Etapa",
    status_change: "Status",
    broker_change: "Corretor",
    client_link: "Cliente vinculado",
    property_link: "Imóvel",
    next_return: "Retorno",
    next_action: "Próximo passo",
    note: "Nota",
  };
  return map[type] ?? type;
}
