import { useState } from "react";
import {
  CalendarPlus,
  CheckCircle2,
  Clock3,
  History,
  Link2,
  Mail,
  MoreHorizontal,
  Phone,
  UserPlus,
  UserRoundCog,
  XCircle,
} from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AtendimentoActionsDialog,
  type AtendimentoActionKind,
  type AtendimentoActionPayload,
} from "@/components/atendimentos/AtendimentoActionsDialog";
import {
  atendimentoInterestLine,
  formatAtendimentoBudget,
  formatDateTime,
} from "@/services/atendimentos";
import { timeAgo } from "@/lib/format";
import {
  atendimentoImobiliariaLabel,
  atendimentoOrigemLabel,
  atendimentoPrioridadeLabel,
  atendimentoProximoPassoLabel,
  atendimentoStatusLabel,
  type Atendimento,
} from "@/types/atendimento";
import { cn } from "@/lib/utils";

const secondaryActions: {
  kind: AtendimentoActionKind;
  label: string;
  icon: typeof UserRoundCog;
}[] = [
  { kind: "vincular-corretor", label: "Vincular corretor", icon: UserRoundCog },
  { kind: "criar-visita", label: "Criar visita", icon: CalendarPlus },
  { kind: "criar-retorno", label: "Criar tarefa de retorno", icon: Clock3 },
  { kind: "registrar-historico", label: "Registrar histórico", icon: History },
  { kind: "motivo-perda", label: "Marcar motivo de perda", icon: XCircle },
];

const contactPreferenceLabel = {
  whatsapp: "WhatsApp",
  ligacao: "Ligação",
  email: "E-mail",
} as const;

export function AtendimentoCard({
  atendimento,
  onConvert,
  onAction,
}: {
  atendimento: Atendimento;
  onConvert: (id: string) => void;
  onAction: (payload: AtendimentoActionPayload, atendimento: Atendimento) => Promise<void> | void;
}) {
  const [activeKind, setActiveKind] = useState<AtendimentoActionKind | null>(null);
  const converted = atendimento.convertidoEmCliente || Boolean(atendimento.clienteConvertidoId);
  const initials = getInitials(atendimento.clienteNome);

  return (
    <article
      aria-label={`Atendimento de ${atendimento.clienteNome}`}
      className="premium-reveal glass-panel-strong rounded-3xl p-4 sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-teal-700/12 text-[11px] font-bold text-teal-800 ring-1 ring-teal-700/10 sm:size-12">
            {initials}
          </div>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h3 className="truncate text-sm font-semibold sm:text-base">
                {atendimento.clienteNome}
              </h3>
              {converted && <CheckCircle2 className="size-3.5 shrink-0 text-emerald-700" />}
            </div>
            <div className="mt-1 flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-[10px] text-foreground/58 sm:text-[11px]">
              <span className="flex min-w-0 items-center gap-1.5">
                <Phone className="size-3.5 shrink-0 text-teal-700/65" />
                <span className="truncate">{atendimento.telefone}</span>
              </span>
              {atendimento.email && (
                <span className="flex min-w-0 items-center gap-1.5">
                  <Mail className="size-3.5 shrink-0 text-teal-700/65" />
                  <span className="max-w-48 truncate">{atendimento.email}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <StatusBadge status={atendimentoStatusLabel(atendimento.status)} />
          <p className="mt-1 text-[9px] tabular-nums text-foreground/40">
            {timeAgo(atendimento.criadoEm)}
          </p>
        </div>
      </div>

      <div className="mt-3 rounded-2xl border border-white/55 bg-white/42 p-3">
        <p className="text-[11px] leading-5 text-foreground/64 sm:text-xs">
          <span className="font-semibold text-foreground/78">Interesse:</span>{" "}
          {atendimentoInterestLine(atendimento)}
        </p>
        <p className="mt-0.5 text-[11px] leading-5 text-foreground/58 sm:text-xs">
          <span className="font-semibold text-foreground/72">Faixa:</span>{" "}
          <span className="tabular-nums">{formatAtendimentoBudget(atendimento)}</span>
        </p>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3 text-[10px] sm:grid-cols-3 sm:text-[11px]">
        <Info
          label="Próximo passo"
          value={atendimentoProximoPassoLabel(atendimento.proximoPasso)}
        />
        <Info label="Próximo retorno" value={formatDateTime(atendimento.proximoRetorno)} />
        <Info
          label="Responsável"
          value={atendimento.corretorNome ?? "A definir"}
          className="col-span-2 sm:col-span-1"
        />
        <Info
          label="Origem e contato"
          value={`${atendimentoOrigemLabel(atendimento.origem)} · ${contactPreferenceLabel[atendimento.contatoPreferencial]}`}
        />
        <Info label="Imobiliária" value={atendimentoImobiliariaLabel(atendimento.imobiliaria)} />
        <Info
          label="Prioridade"
          value={atendimentoPrioridadeLabel(atendimento.prioridade)}
          valueClassName={cn(
            atendimento.prioridade === "urgente" || atendimento.prioridade === "alta"
              ? "text-amber-800"
              : undefined,
          )}
        />
      </dl>

      {atendimento.observacoes && (
        <p className="mt-3 line-clamp-2 rounded-2xl bg-white/48 px-3 py-2.5 text-[11px] leading-5 text-foreground/62">
          {atendimento.observacoes}
        </p>
      )}

      {atendimento.status === "perdido" && (
        <div className="mt-3 flex items-start gap-1.5 rounded-xl bg-destructive/8 px-3 py-2 text-[10px] font-medium text-destructive">
          <Link2 className="mt-0.5 size-3 shrink-0" />
          <span>Motivo: {atendimento.motivoPerda ?? "Não informado"}</span>
        </div>
      )}

      <div className="mt-4 flex items-center gap-2 border-t border-white/55 pt-3">
        {converted ? (
          <span className="inline-flex min-h-10 flex-1 items-center gap-1.5 rounded-xl bg-emerald-500/10 px-3 text-[11px] font-semibold text-emerald-800">
            <CheckCircle2 className="size-3.5" />
            Cliente vinculado
          </span>
        ) : (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                className="premium-pressable inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-teal-700 px-3 text-[11px] font-semibold text-white shadow-md shadow-teal-900/14 transition-colors duration-150 hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700/40 focus-visible:ring-offset-2"
              >
                <UserPlus className="size-3.5 shrink-0" />
                Transformar em cliente
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent className="w-[calc(100%-2rem)] rounded-3xl border-white/70 bg-background/95 shadow-2xl backdrop-blur-xl">
              <AlertDialogHeader>
                <AlertDialogTitle>Transformar em cliente?</AlertDialogTitle>
                <AlertDialogDescription>
                  Os dados comerciais de {atendimento.clienteNome} serão usados para criar um
                  cadastro em Clientes e vinculá-lo a este atendimento.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-2xl">Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => onConvert(atendimento.id)}
                  className="rounded-2xl bg-teal-700 text-white hover:bg-teal-800"
                >
                  Confirmar conversão
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Mais ações para ${atendimento.clienteNome}`}
              className="premium-pressable inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-white/65 bg-white/62 px-3 text-[11px] font-semibold text-foreground/65 transition-[border-color,background-color,color] duration-150 hover:bg-white/82 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700/35"
            >
              <MoreHorizontal className="size-4" />
              <span className="hidden min-[360px]:inline">Mais ações</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-64 rounded-2xl border-white/70 bg-background/98 p-1.5 shadow-xl"
          >
            <DropdownMenuLabel className="px-2.5 py-2 text-[10px] uppercase tracking-[0.12em] text-foreground/45">
              Continuar atendimento
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {secondaryActions
              .filter(({ kind }) =>
                kind === "motivo-perda" ? atendimento.status !== "perdido" : true,
              )
              .map(({ kind, label, icon: Icon }) => (
                <DropdownMenuItem
                  key={kind}
                  onSelect={() => setActiveKind(kind)}
                  className={cn(
                    "min-h-10 rounded-xl px-2.5 text-xs focus:bg-teal-700/8 focus:text-teal-900",
                    kind === "motivo-perda" && "text-destructive focus:text-destructive",
                  )}
                >
                  <Icon className="size-3.5" />
                  {label}
                </DropdownMenuItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AtendimentoActionsDialog
        kind={activeKind}
        atendimento={atendimento}
        open={activeKind !== null}
        onOpenChange={(open) => {
          if (!open) setActiveKind(null);
        }}
        onSubmit={(payload) => onAction(payload, atendimento)}
      />
    </article>
  );
}

function Info({
  label,
  value,
  className,
  valueClassName,
}: {
  label: string;
  value: string;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-[9px] font-bold uppercase tracking-[0.11em] text-foreground/42">
        {label}
      </dt>
      <dd
        className={cn("mt-1 truncate font-medium text-foreground/72", valueClassName)}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "??";
}
