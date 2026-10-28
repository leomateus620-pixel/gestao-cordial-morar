import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowUpRight,
  CalendarClock,
  Check,
  History,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { pipelineStageUi } from "@/components/atendimentos/pipeline-ui";
import { WORKSPACE_PIPELINE_STAGES } from "@/lib/atendimentos/stage-workspace";
import { cn } from "@/lib/utils";
import {
  atendimentoInterestLine,
  formatDateTime,
  isAtendimentoOverdue,
  whatsappHref,
} from "@/services/atendimentos";
import {
  attendanceEventLabel,
  pipelineStageLabel,
  type Atendimento,
  type PipelineStage,
} from "@/types/atendimento";

export type AtendimentoCardDensity = "compacta" | "confortavel";

type Props = {
  atendimento: Atendimento;
  density?: AtendimentoCardDensity;
  onOpen: (atendimento: Atendimento) => void;
  onStageChange: (id: string, stage: PipelineStage) => Promise<void> | void;
};

/** Presentation only: history and first-open registration belong to the existing drawer. */
export function AtendimentoCompactCard({
  atendimento,
  density = "compacta",
  onOpen,
  onStageChange,
}: Props) {
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const cardRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const moveFocusRef = useRef<{
    card: HTMLElement;
    grid: HTMLElement;
    menu: HTMLElement | null;
    neighbors: HTMLButtonElement[];
  } | null>(null);
  const name = atendimento.clienteNome?.trim() || "Contato sem nome";
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  const whatsapp = whatsappHref(atendimento.telefone);
  const interest = atendimentoInterestLine(atendimento);
  const returnDate = atendimento.proximoRetorno ? new Date(atendimento.proximoRetorno) : null;
  const hasReturn = returnDate !== null && Number.isFinite(returnDate.getTime());
  const overdue = isAtendimentoOverdue(atendimento);
  const isToday = hasReturn && returnDate.toDateString() === new Date().toDateString();
  const action = atendimento.ultimaAcao;
  const hasActionDate = Boolean(action?.em && Number.isFinite(new Date(action.em).getTime()));

  useEffect(
    () => () => {
      // An optimistic transition can remove the focused card before its request finishes.
      // Restore only lost focus within this still-mounted grid, never another control's focus.
      const origin = moveFocusRef.current;
      if (!origin) return;
      requestAnimationFrame(() => {
        if (origin.card.isConnected || !origin.grid.isConnected) return;
        const active = document.activeElement;
        if (
          active &&
          active !== document.body &&
          active.isConnected &&
          !origin.card.contains(active) &&
          !origin.menu?.contains(active)
        )
          return;
        const target =
          origin.neighbors.find((button) => button.isConnected && !button.disabled) ??
          document.getElementById("atendimento-stage-title");
        target?.focus({ preventScroll: true });
      });
    },
    [],
  );

  async function moveTo(stage: PipelineStage) {
    if (moving || stage === atendimento.pipelineStage) return;
    const card = cardRef.current;
    const grid = card?.parentElement;
    const active = document.activeElement;
    if (card && grid && (card.contains(active) || menuRef.current?.contains(active))) {
      const buttons = Array.from(
        grid.querySelectorAll<HTMLButtonElement>('[id^="atendimento-open-"]'),
      );
      const index = buttons.findIndex((button) => card.contains(button));
      moveFocusRef.current = {
        card,
        grid,
        menu: menuRef.current,
        neighbors: [...buttons.slice(index + 1), ...buttons.slice(0, index).reverse()],
      };
    }
    setMoving(true);
    setMoveError(null);
    try {
      await onStageChange(atendimento.id, stage);
      if (stage !== "em_espera")
        toast.success(`Atendimento movido para ${pipelineStageLabel(stage)}.`);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível mover este atendimento. Tente novamente.";
      setMoveError(message);
      toast.error(message);
    } finally {
      setMoving(false);
    }
  }

  return (
    <article
      ref={cardRef}
      aria-labelledby={`atendimento-name-${atendimento.id}`}
      aria-busy={moving || undefined}
      data-attendance-id={atendimento.id}
      className={cn(
        "flex min-w-0 flex-col rounded-2xl border border-l-[3px] border-border bg-card shadow-sm transition-shadow hover:shadow-md motion-reduce:transition-none",
        pipelineStageUi[atendimento.pipelineStage].accent,
      )}
    >
      <div className={cn("flex flex-1 flex-col", density === "compacta" ? "p-4" : "p-5")}>
        <button
          id={`atendimento-open-${atendimento.id}`}
          type="button"
          onClick={() => onOpen(atendimento)}
          aria-label={`Ver atendimento de ${name}`}
          className="group flex w-full items-start gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4"
        >
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-xs font-bold text-primary"
          >
            {initials}
          </span>
          <span className="min-w-0 flex-1">
            <span
              id={`atendimento-name-${atendimento.id}`}
              className="block text-base font-semibold leading-6 text-foreground [overflow-wrap:anywhere] group-hover:text-primary"
            >
              {name}
            </span>
            <span
              title={interest}
              className="mt-0.5 line-clamp-2 text-sm leading-5 text-muted-foreground [overflow-wrap:anywhere]"
            >
              {interest}
            </span>
          </span>
          <ArrowUpRight
            aria-hidden="true"
            className="mt-1 size-4 shrink-0 text-muted-foreground group-hover:text-primary"
          />
        </button>

        <dl className={cn("space-y-3 text-sm", density === "compacta" ? "mt-4" : "mt-5")}>
          <div className="flex items-start gap-2.5">
            <UserRound
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
            />
            <div className="min-w-0">
              <dt className="sr-only">Corretor responsável</dt>
              <dd className="leading-5 text-foreground [overflow-wrap:anywhere]">
                {atendimento.corretorNome?.trim() || "Sem corretor"}
              </dd>
            </div>
          </div>
          <div
            className={cn(
              "flex items-start gap-2.5",
              overdue ? "text-destructive" : "text-foreground",
            )}
          >
            {overdue ? (
              <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            ) : (
              <CalendarClock
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              />
            )}
            <div className="min-w-0">
              <dt
                className={cn(
                  "text-xs leading-4",
                  overdue ? "font-semibold" : "text-muted-foreground",
                )}
              >
                {overdue ? "Retorno atrasado" : isToday ? "Retorno hoje" : "Próximo retorno"}
              </dt>
              <dd className="mt-0.5 leading-5 [overflow-wrap:anywhere]">
                {hasReturn ? (
                  <time dateTime={atendimento.proximoRetorno}>
                    {formatDateTime(atendimento.proximoRetorno)}
                  </time>
                ) : (
                  "Sem retorno agendado"
                )}
              </dd>
            </div>
          </div>
        </dl>

        <div
          className={cn("border-t border-border/70 pt-3", density === "compacta" ? "mt-4" : "mt-5")}
        >
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 font-medium">
              <History aria-hidden="true" className="size-3.5" />
              Última ação
            </span>
            {hasActionDate ? <time dateTime={action!.em}>{formatDateTime(action!.em)}</time> : null}
          </div>
          <p className="mt-1.5 line-clamp-2 text-sm leading-5 text-foreground/85 [overflow-wrap:anywhere]">
            {action
              ? action.descricao?.trim() || attendanceEventLabel(action.tipo)
              : "Resumo indisponível. Consulte o histórico."}
          </p>
          {atendimento.pipelineStage === "perdido" && atendimento.motivoPerda?.trim() ? (
            <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">
              Motivo da perda: {atendimento.motivoPerda}
            </p>
          ) : null}
        </div>
      </div>

      <footer
        className={cn(
          "flex flex-wrap items-center gap-1.5 border-t border-border/70",
          density === "compacta" ? "px-3 py-2" : "px-4 py-3",
        )}
      >
        <Button
          type="button"
          variant="ghost"
          onClick={() => onOpen(atendimento)}
          className="mr-auto h-10 rounded-xl px-2 text-primary hover:bg-primary/10 hover:text-primary"
          aria-label={`Ver histórico de ${name}`}
        >
          Ver histórico
          <ArrowUpRight aria-hidden="true" />
        </Button>
        {whatsapp ? (
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="size-10 rounded-xl text-primary hover:bg-primary/10 hover:text-primary"
          >
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Falar com ${name} no WhatsApp`}
              title="Falar no WhatsApp"
            >
              <MessageCircle aria-hidden="true" />
            </a>
          </Button>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={moving}
              className="size-10 rounded-xl"
              aria-label={`Mover atendimento de ${name}`}
              title="Mover para outra etapa"
            >
              {moving ? (
                <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
              ) : (
                <MoreHorizontal aria-hidden="true" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent ref={menuRef} align="end" className="w-60">
            <DropdownMenuLabel>Mover para outra etapa</DropdownMenuLabel>
            {WORKSPACE_PIPELINE_STAGES.map((stage) => (
              <DropdownMenuItem
                key={stage}
                disabled={stage === atendimento.pipelineStage}
                onSelect={() => {
                  if (stage === "perdido" || stage === "fechamento") onOpen(atendimento);
                  else void moveTo(stage);
                }}
                className="min-h-10 gap-2"
              >
                <span
                  aria-hidden="true"
                  className={cn("size-2 shrink-0 rounded-full", pipelineStageUi[stage].dot)}
                />
                {stage === "perdido" || stage === "fechamento" ? (
                  <span>Gerenciar {pipelineStageLabel(stage).toLowerCase()} na ficha</span>
                ) : (
                  pipelineStageLabel(stage)
                )}
                {stage === atendimento.pipelineStage ? (
                  <Check aria-hidden="true" className="ml-auto size-4" />
                ) : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {moveError ? (
          <p
            role="alert"
            className="w-full px-1 pb-1 text-sm text-destructive [overflow-wrap:anywhere]"
          >
            {moveError}
          </p>
        ) : null}
      </footer>
    </article>
  );
}
