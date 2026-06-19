import {
  BadgeDollarSign,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Handshake,
  type LucideIcon,
  Percent,
  UserRound,
  XCircle,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getAgenciamentoCompletion,
  getCorretorAgencyLabel,
  getCorretorPeriodLabel,
} from "@/services/corretores";
import type { Corretor, CorretorPeriodFilter } from "@/types/corretor";
import { brl, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type CorretorDetailDrawerProps = {
  corretor: Corretor | null;
  periodo: CorretorPeriodFilter;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CorretorDetailDrawer({
  corretor,
  periodo,
  open,
  onOpenChange,
}: CorretorDetailDrawerProps) {
  const completion = corretor ? getAgenciamentoCompletion(corretor) : 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-dvh w-full max-w-full flex-col overflow-hidden border-white/20 bg-[#f7f3ed]/95 p-0 text-foreground backdrop-blur-2xl sm:max-w-xl lg:max-w-2xl [&>button]:right-5 [&>button]:top-5"
      >
        {corretor && (
          <>
            <SheetHeader className="border-b border-white/55 px-5 pb-4 pt-6 text-left sm:px-6">
              <div className="flex items-start gap-3 pr-8">
                <span className="grid size-13 shrink-0 place-items-center rounded-2xl bg-primary text-sm font-black text-white shadow-[0_16px_34px_-22px_rgba(30,100,125,0.85)]">
                  {corretor.iniciais}
                </span>
                <div className="min-w-0 flex-1">
                  <SheetTitle className="truncate text-xl font-black tracking-tight">
                    {corretor.nome}
                  </SheetTitle>
                  <SheetDescription className="mt-1 text-xs">
                    {corretor.creci} · {getCorretorAgencyLabel(corretor.imobiliaria)} ·{" "}
                    {getCorretorPeriodLabel(periodo)}
                  </SheetDescription>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em]",
                        corretor.status === "ativo"
                          ? "bg-emerald-500/10 text-emerald-700"
                          : "bg-foreground/[0.07] text-foreground/50",
                      )}
                    >
                      {corretor.status === "ativo" ? "Ativo" : "Inativo"}
                    </span>
                    {corretor.rankingPosicao && (
                      <span className="rounded-full bg-[rgba(217,120,45,0.12)] px-2.5 py-1 font-mono text-[10px] font-black uppercase tracking-[0.14em] text-[var(--system-accent-dark)]">
                        #{corretor.rankingPosicao} no ranking
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </SheetHeader>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <MiniStat label="Atend." value={corretor.atendimentosRecebidos} />
                <MiniStat label="Fechados" value={corretor.contratosFechados} accent />
                <MiniStat label="Conversão" value={`${corretor.taxaConversao}%`} />
                <MiniStat
                  label="Comissão"
                  value={brl(corretor.comissaoPrevista, { compact: true })}
                />
              </div>

              <Tabs defaultValue="desempenho" className="mt-5">
                <TabsList className="grid h-auto w-full grid-cols-4 rounded-2xl bg-white/[0.62] p-1 text-[11px]">
                  <TabsTrigger value="desempenho" className="rounded-xl px-2 text-[11px]">
                    Desempenho
                  </TabsTrigger>
                  <TabsTrigger value="agenciamentos" className="rounded-xl px-2 text-[11px]">
                    Agenc.
                  </TabsTrigger>
                  <TabsTrigger value="comissoes" className="rounded-xl px-2 text-[11px]">
                    Comissões
                  </TabsTrigger>
                  <TabsTrigger value="historico" className="rounded-xl px-2 text-[11px]">
                    Histórico
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="desempenho" className="mt-4 space-y-3">
                  <Panel title="Resumo operacional" icon={Handshake}>
                    <MetricRow
                      label="Atendimentos recebidos"
                      value={corretor.atendimentosRecebidos}
                    />
                    <MetricRow label="Em andamento" value={corretor.atendimentosEmAndamento} />
                    <MetricRow label="Visitas realizadas" value={corretor.visitasRealizadas} />
                    <MetricRow label="Propostas feitas" value={corretor.propostasFeitas} />
                    <MetricRow
                      label="Contratos fechados"
                      value={corretor.contratosFechados}
                      strong
                    />
                  </Panel>

                  <Panel title="Mix de contratos" icon={FileText}>
                    <MetricRow label="Vendas fechadas" value={corretor.vendasFechadas} />
                    <MetricRow label="Aluguéis fechados" value={corretor.alugueisFechados} />
                    <MetricRow
                      label="Taxa de conversão"
                      value={`${corretor.taxaConversao}%`}
                      strong
                    />
                    <MetricRow
                      label="Média mensal"
                      value={corretor.mediaMensalContratos.toFixed(1)}
                    />
                  </Panel>
                </TabsContent>

                <TabsContent value="agenciamentos" className="mt-4 space-y-3">
                  <Panel title="Controle de agenciamentos" icon={ClipboardCheck}>
                    <div className="rounded-2xl bg-primary/[0.075] p-4">
                      <div className="flex items-end justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary/65">
                            Checklist concluído
                          </p>
                          <p className="mt-1 font-mono text-3xl font-black text-primary">
                            {completion}%
                          </p>
                        </div>
                        <p className="font-mono text-xl font-black text-foreground/75">
                          {corretor.agenciamentosFeitos}
                        </p>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/70">
                        <span
                          className="block h-full rounded-full bg-primary"
                          style={{ width: `${completion}%` }}
                        />
                      </div>
                    </div>
                    <ChecklistRow
                      label="Com placa"
                      done={corretor.agenciamentosComPlaca}
                      total={corretor.agenciamentosFeitos}
                    />
                    <ChecklistRow
                      label="Com fotos"
                      done={corretor.agenciamentosComFotos}
                      total={corretor.agenciamentosFeitos}
                    />
                    <ChecklistRow
                      label="No site"
                      done={corretor.agenciamentosNoSite}
                      total={corretor.agenciamentosFeitos}
                    />
                    <ChecklistRow
                      label="Validados"
                      done={corretor.agenciamentosValidados}
                      total={corretor.agenciamentosFeitos}
                    />
                  </Panel>
                </TabsContent>

                <TabsContent value="comissoes" className="mt-4 space-y-3">
                  <Panel title="Comissões do período" icon={BadgeDollarSign}>
                    <FinanceRow label="Prevista" value={corretor.comissaoPrevista} accent />
                    <FinanceRow label="Paga" value={corretor.comissaoPaga} />
                    <FinanceRow
                      label="Pendente"
                      value={Math.max(corretor.comissaoPrevista - corretor.comissaoPaga, 0)}
                    />
                    <FinanceRow label="Comissão do mês" value={corretor.comissaoMes} />
                    <MetricRow
                      label="Ticket médio"
                      value={brl(corretor.ticketMedio, { compact: true })}
                      strong
                    />
                  </Panel>
                </TabsContent>

                <TabsContent value="historico" className="mt-4 space-y-3">
                  <Panel title="Histórico e gestão" icon={CalendarClock}>
                    <MetricRow
                      label="Último atendimento"
                      value={
                        corretor.ultimoAtendimentoEm
                          ? shortDate(corretor.ultimoAtendimentoEm)
                          : "Sem registro"
                      }
                    />
                    <MetricRow
                      label="Tendência"
                      value={
                        corretor.performanceTrend === "alta"
                          ? "Alta"
                          : corretor.performanceTrend === "queda"
                            ? "Queda"
                            : "Estável"
                      }
                    />
                    <div className="rounded-2xl bg-white/[0.58] p-4 ring-1 ring-white/65">
                      <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/45">
                        <UserRound className="size-3.5 text-primary/70" />
                        Observações da gestão
                      </div>
                      <p className="text-sm leading-relaxed text-foreground/68">
                        {corretor.observacaoGestao ?? "Sem observações registradas para o período."}
                      </p>
                    </div>
                  </Panel>
                </TabsContent>
              </Tabs>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function MiniStat({
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
        "rounded-2xl bg-white/[0.58] p-3 ring-1 ring-white/65",
        accent && "bg-primary/[0.09]",
      )}
    >
      <p className="truncate text-[9px] font-bold uppercase tracking-[0.14em] text-foreground/45">
        {label}
      </p>
      <p className={cn("mt-1 truncate font-mono text-xl font-black", accent && "text-primary")}>
        {value}
      </p>
    </div>
  );
}

function Panel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[1.35rem] bg-white/[0.52] p-4 ring-1 ring-white/65">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-4" />
        </span>
        <h3 className="text-sm font-bold tracking-tight">{title}</h3>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function MetricRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: string | number;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.58] px-3 py-2.5 ring-1 ring-white/65">
      <span className="text-xs font-medium text-foreground/55">{label}</span>
      <span
        className={cn(
          "font-mono text-sm font-bold",
          strong ? "text-primary" : "text-foreground/72",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function FinanceRow({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-2xl px-3 py-3 ring-1 ring-white/65",
        accent ? "bg-[rgba(217,120,45,0.1)]" : "bg-white/[0.58]",
      )}
    >
      <span className="text-xs font-semibold text-foreground/56">{label}</span>
      <span
        className={cn(
          "font-mono text-base font-black",
          accent ? "text-[var(--system-accent-dark)]" : "text-foreground/72",
        )}
      >
        {brl(value, { compact: true })}
      </span>
    </div>
  );
}

function ChecklistRow({ label, done, total }: { label: string; done: number; total: number }) {
  const complete = total > 0 && done >= total;

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.58] px-3 py-2.5 ring-1 ring-white/65">
      <span className="flex min-w-0 items-center gap-2 text-xs font-medium text-foreground/58">
        {complete ? (
          <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
        ) : (
          <XCircle className="size-4 shrink-0 text-foreground/28" />
        )}
        {label}
      </span>
      <span className="font-mono text-sm font-black text-primary">
        {done}/{total}
      </span>
    </div>
  );
}
