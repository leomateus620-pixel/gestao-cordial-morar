import {
  CalendarPlus,
  CheckCircle2,
  Clock3,
  History,
  Link2,
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
  atendimentoInterestLine,
  formatAtendimentoBudget,
  formatDateTime,
} from "@/services/atendimentos";
import { timeAgo } from "@/lib/format";
import {
  atendimentoImobiliariaLabel,
  atendimentoOrigemLabel,
  atendimentoPrioridadeLabel,
  atendimentoStatusLabel,
  type Atendimento,
} from "@/types/atendimento";
import { cn } from "@/lib/utils";

const secondaryActions = [
  { label: "Vincular corretor", icon: UserRoundCog },
  { label: "Criar visita", icon: CalendarPlus },
  { label: "Criar tarefa de retorno", icon: Clock3 },
  { label: "Registrar histórico", icon: History },
  { label: "Marcar motivo de perda", icon: XCircle },
] as const;

export function AtendimentoCard({
  atendimento,
  onConvert,
  onMockAction,
}: {
  atendimento: Atendimento;
  onConvert: (id: string) => void;
  onMockAction: (action: string, contactName: string) => void;
}) {
  const converted = atendimento.convertidoEmCliente || Boolean(atendimento.clienteConvertidoId);
  const initials = getInitials(atendimento.clienteNome);

  return (
    <article className="glass-panel-strong rounded-3xl p-4 transition duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-stone-950/8 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-teal-700/12 text-[11px] font-bold text-teal-800 ring-1 ring-teal-700/10 sm:size-12">
            {initials}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-sm font-semibold sm:text-base">
                {atendimento.clienteNome}
              </h3>
              {converted && (
                <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.08em] text-emerald-700">
                  <CheckCircle2 className="size-3" /> Cliente
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] leading-5 text-foreground/64 sm:text-xs">
              <span className="font-semibold text-foreground/76">Busca:</span>{" "}
              {atendimentoInterestLine(atendimento)}
            </p>
            <p className="text-[11px] leading-5 text-foreground/58 sm:text-xs">
              <span className="font-semibold text-foreground/72">Faixa:</span>{" "}
              {formatAtendimentoBudget(atendimento)}
            </p>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <StatusBadge status={atendimentoStatusLabel(atendimento.status)} />
          <p className="mt-1 font-mono text-[9px] text-foreground/40">
            {timeAgo(atendimento.criadoEm)}
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-2 rounded-2xl bg-white/42 p-3 text-[10px] text-foreground/58 sm:grid-cols-2 sm:text-[11px]">
        <p>
          <span className="font-semibold text-foreground/72">Origem:</span>{" "}
          {atendimentoOrigemLabel(atendimento.origem)} ·{" "}
          <span className="font-semibold text-foreground/72">Corretor:</span>{" "}
          {atendimento.corretorNome ?? "A definir"}
        </p>
        <p className="sm:text-right">
          <span className="font-semibold text-foreground/72">Imobiliária:</span>{" "}
          {atendimentoImobiliariaLabel(atendimento.imobiliaria)} ·{" "}
          <span
            className={cn(
              "font-semibold",
              atendimento.prioridade === "urgente" || atendimento.prioridade === "alta"
                ? "text-amber-700"
                : "text-foreground/72",
            )}
          >
            {atendimentoPrioridadeLabel(atendimento.prioridade)}
          </span>
        </p>
        <p className="sm:col-span-2">
          <span className="font-semibold text-foreground/72">Próximo retorno:</span>{" "}
          {formatDateTime(atendimento.proximoRetorno)}
        </p>
      </div>

      {atendimento.observacoes && (
        <p className="mt-3 line-clamp-2 rounded-2xl bg-white/48 px-3 py-2.5 text-[11px] leading-5 text-foreground/62">
          {atendimento.observacoes}
        </p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              disabled={converted}
              className="flex items-center gap-1.5 rounded-xl bg-teal-700/9 px-2.5 py-2 text-left text-[10px] font-semibold text-teal-800 transition hover:bg-teal-700/15 active:scale-[0.98] disabled:cursor-default disabled:opacity-45"
            >
              <UserPlus className="size-3.5 shrink-0" />
              <span className="truncate">
                {converted ? "Cliente vinculado" : "Transformar em cliente"}
              </span>
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent className="w-[calc(100%-2rem)] rounded-3xl border-white/70 bg-background/95 shadow-2xl backdrop-blur-xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Transformar em cliente?</AlertDialogTitle>
              <AlertDialogDescription>
                Os dados comerciais de {atendimento.clienteNome} serão usados para criar ou
                completar um cadastro de cliente. Se telefone ou nome já existirem, o atendimento
                será vinculado ao cadastro atual.
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

        {secondaryActions
          .filter(({ label }) =>
            label === "Marcar motivo de perda" ? atendimento.status !== "perdido" : true,
          )
          .map(({ label, icon: Icon }) => (
          <button
            key={label}
            type="button"
            onClick={() => onMockAction(label, atendimento.clienteNome)}
            className="flex items-center gap-1.5 rounded-xl bg-white/52 px-2.5 py-2 text-left text-[10px] font-semibold text-foreground/60 transition hover:bg-teal-700/9 hover:text-teal-800 active:scale-[0.98]"
          >
            <Icon className="size-3.5 shrink-0" />
            <span className="truncate">{label}</span>
          </button>
        ))}
      </div>

      {atendimento.status === "perdido" && (
        <div className="mt-3 flex items-center gap-1.5 rounded-xl bg-destructive/8 px-3 py-2 text-[10px] font-medium text-destructive">
          <Link2 className="size-3 shrink-0" />
          Motivo: {atendimento.motivoPerda ?? "Não informado"}
        </div>
      )}
    </article>
  );
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "??";
}
