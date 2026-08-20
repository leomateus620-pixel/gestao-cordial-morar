import type { ReactNode } from "react";
import {
  ArrowRight,
  BadgeDollarSign,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileText,
  Handshake,
  History,
  Home,
  Percent,
  Timer,
  UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { brl, shortDate } from "@/lib/format";
import { formatElapsedSeconds } from "@/lib/time/elapsed";
import { getCorretorAgencyLabel, getCorretorPeriodLabel } from "@/services/corretores";
import type {
  Corretor,
  CorretorActivity,
  CorretorPeriodFilter,
  CorretorSourceStatus,
} from "@/types/corretor";
import { cn } from "@/lib/utils";

export type CorretorNavigationRoute = CorretorActivity["route"];

type CorretorDetailDrawerProps = {
  corretor: Corretor | null;
  periodo: CorretorPeriodFilter;
  open: boolean;
  sourceStatus: CorretorSourceStatus;
  onOpenChange: (open: boolean) => void;
  onNavigate?: (route: CorretorNavigationRoute, corretor: Corretor) => void;
};

function clampPercentage(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function responseLabel(value: number | null, measured: number) {
  if (value == null || measured === 0) return "Dados insuficientes";
  return formatElapsedSeconds(Math.round(value));
}

function moneyLabel(value: number | null, available: boolean) {
  return available && value != null ? brl(value, { compact: true }) : "Indisponível";
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Data indisponível";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function CorretorDetailDrawer({
  corretor,
  periodo,
  open,
  sourceStatus,
  onOpenChange,
  onNavigate,
}: CorretorDetailDrawerProps) {
  const checklist = corretor ? clampPercentage(corretor.agenciamentosChecklistPercent) : 0;
  const attendanceReady = sourceStatus.atendimentos === "ready";
  const agendaReady = sourceStatus.agenda === "ready";
  const listingsReady = sourceStatus.agenciamentos === "ready";
  const salesReady = sourceStatus.vendas === "ready";
  const rentalsReady = sourceStatus.alugueis === "ready";
  const responseReady = sourceStatus.respostas === "ready";
  const unavailableSources = Object.entries(sourceStatus)
    .filter(([, status]) => status === "error")
    .map(([source]) => source);

  const handleNavigate = (route: CorretorNavigationRoute) => {
    if (!corretor || !onNavigate) return;
    onNavigate(route, corretor);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        closeLabel="Fechar detalhes do corretor"
        className="flex h-dvh !w-full !max-w-3xl flex-col gap-0 overflow-hidden border-border/70 bg-background p-0 text-foreground [&>button]:right-4 [&>button]:top-4 [&>button]:z-30"
      >
        {corretor ? (
          <>
            <SheetHeader className="shrink-0 border-b border-border/70 bg-background px-5 pb-4 pt-5 pr-16 text-left sm:px-6 sm:pr-16">
              <div className="flex min-w-0 items-start gap-3">
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary text-sm font-black text-primary-foreground">
                  {corretor.iniciais}
                </span>
                <div className="min-w-0 flex-1">
                  <SheetTitle className="truncate text-xl font-black tracking-tight">
                    {corretor.nome}
                  </SheetTitle>
                  <SheetDescription className="mt-1 text-xs leading-relaxed">
                    {getCorretorAgencyLabel(corretor.imobiliaria)}
                    {corretor.creci ? ` · ${corretor.creci}` : ""}
                    {` · ${getCorretorPeriodLabel(periodo)}`}
                  </SheetDescription>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]",
                        corretor.status === "ativo"
                          ? "bg-emerald-500/10 text-emerald-700"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {corretor.status === "ativo" ? "Ativo" : "Inativo"}
                    </span>
                    {corretor.rankingPosicao ? (
                      <span className="rounded-full bg-primary/8 px-2.5 py-1 font-mono text-[10px] font-black uppercase tracking-[0.12em] text-primary">
                        #{corretor.rankingPosicao} no ranking
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </SheetHeader>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <div className="px-5 pt-5 sm:px-6">
                {unavailableSources.length > 0 ? (
                  <p
                    role="status"
                    className="mb-3 rounded-xl border border-amber-300/70 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-950"
                  >
                    Dados parciais: valores de fontes indisponíveis aparecem como “—”.
                  </p>
                ) : null}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <MiniStat
                    label="Atendimentos"
                    value={attendanceReady ? corretor.atendimentosRecebidos : "—"}
                  />
                  <MiniStat
                    label="Fechados"
                    value={salesReady && rentalsReady ? corretor.contratosFechados : "—"}
                    accent
                  />
                  <MiniStat
                    label="Conversão"
                    value={attendanceReady ? `${corretor.taxaConversao}%` : "—"}
                  />
                  <MiniStat
                    label="Resposta média"
                    value={
                      !responseReady
                        ? "—"
                        : corretor.mediaRespostaSegundos != null && corretor.respostasMedidas > 0
                          ? formatElapsedSeconds(Math.round(corretor.mediaRespostaSegundos))
                          : "—"
                    }
                  />
                </div>
              </div>

              <Tabs defaultValue="desempenho" className="mt-4">
                <div className="sticky top-0 z-20 overflow-x-auto border-y border-border/70 bg-background/95 px-5 py-2 backdrop-blur-sm sm:px-6">
                  <TabsList
                    aria-label="Seções dos detalhes do corretor"
                    className="h-auto min-h-11 w-max min-w-full justify-start rounded-xl bg-muted/70 p-1"
                  >
                    <TabsTrigger value="desempenho" className="min-h-11 rounded-lg text-xs">
                      Desempenho
                    </TabsTrigger>
                    <TabsTrigger value="atendimentos" className="min-h-11 rounded-lg text-xs">
                      Atendimentos
                    </TabsTrigger>
                    <TabsTrigger value="agenda" className="min-h-11 rounded-lg text-xs">
                      Agenda
                    </TabsTrigger>
                    <TabsTrigger value="agenciamentos" className="min-h-11 rounded-lg text-xs">
                      Agenciamentos
                    </TabsTrigger>
                    <TabsTrigger value="negocios" className="min-h-11 rounded-lg text-xs">
                      Vendas e aluguéis
                    </TabsTrigger>
                    <TabsTrigger value="historico" className="min-h-11 rounded-lg text-xs">
                      Histórico
                    </TabsTrigger>
                  </TabsList>
                </div>

                <div className="px-5 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6">
                  <TabsContent value="desempenho" className="mt-4 space-y-3">
                    <Panel title="Resumo operacional" icon={Handshake}>
                      <MetricRow
                        label="Atendimentos recebidos"
                        value={attendanceReady ? corretor.atendimentosRecebidos : "—"}
                      />
                      <MetricRow
                        label="Contratos fechados"
                        value={salesReady && rentalsReady ? corretor.contratosFechados : "—"}
                        strong
                      />
                      <MetricRow
                        label="Taxa de conversão"
                        value={attendanceReady ? `${corretor.taxaConversao}%` : "—"}
                      />
                      <MetricRow
                        label="Compromissos futuros"
                        value={agendaReady ? corretor.agendaProximos : "—"}
                      />
                      <MetricRow
                        label="Agenciamentos ativos"
                        value={listingsReady ? corretor.agenciamentosAtivos : "—"}
                      />
                    </Panel>

                    <Panel title="Tempo de resposta" icon={Timer}>
                      <MetricRow
                        label="Tempo médio"
                        value={
                          responseReady
                            ? responseLabel(
                                corretor.mediaRespostaSegundos,
                                corretor.respostasMedidas,
                              )
                            : "—"
                        }
                        strong={responseReady && corretor.respostasMedidas > 0}
                      />
                      <MetricRow
                        label="Mediana"
                        value={
                          responseReady
                            ? responseLabel(
                                corretor.medianaRespostaSegundos,
                                corretor.respostasMedidas,
                              )
                            : "—"
                        }
                      />
                      <MetricRow
                        label="Ciclos medidos"
                        value={responseReady ? corretor.respostasMedidas : "—"}
                      />
                      <MetricRow
                        label="Aguardando primeira abertura"
                        value={responseReady ? corretor.respostasPendentes : "—"}
                      />
                      {responseReady && corretor.respostasMedidas === 0 ? (
                        <EmptyNotice>
                          Ainda não há ciclos com atribuição e primeira abertura persistidas para
                          calcular este indicador.
                        </EmptyNotice>
                      ) : null}
                    </Panel>

                    {corretor.destaqueOperacional ? (
                      <Panel title="Sinal operacional" icon={Percent}>
                        <p className="rounded-xl bg-primary/[0.055] px-3 py-3 text-sm leading-relaxed text-foreground/70">
                          {corretor.destaqueOperacional}
                        </p>
                      </Panel>
                    ) : null}
                  </TabsContent>

                  <TabsContent value="atendimentos" className="mt-4 space-y-3">
                    <Panel
                      title="Atendimentos do período"
                      icon={UserRound}
                      action={onNavigate ? () => handleNavigate("/atendimentos") : undefined}
                    >
                      <MetricRow
                        label="Recebidos"
                        value={attendanceReady ? corretor.atendimentosRecebidos : "—"}
                      />
                      <MetricRow
                        label="Em andamento"
                        value={attendanceReady ? corretor.atendimentosEmAndamento : "—"}
                      />
                      <MetricRow
                        label="Concluídos"
                        value={attendanceReady ? corretor.atendimentosConcluidos : "—"}
                      />
                      <MetricRow
                        label="Visitas realizadas"
                        value={agendaReady ? corretor.visitasRealizadas : "—"}
                      />
                      <MetricRow
                        label="Propostas feitas"
                        value={attendanceReady ? corretor.propostasFeitas : "—"}
                      />
                      <MetricRow
                        label="Atendimentos fechados"
                        value={attendanceReady ? corretor.contratosDeAtendimento : "—"}
                        strong
                      />
                    </Panel>

                    <Panel title="Resposta aos recebimentos" icon={Clock3}>
                      <MetricRow
                        label="Mais rápida"
                        value={
                          responseReady
                            ? responseLabel(
                                corretor.respostaMaisRapidaSegundos,
                                corretor.respostasMedidas,
                              )
                            : "—"
                        }
                      />
                      <MetricRow
                        label="Média"
                        value={
                          responseReady
                            ? responseLabel(
                                corretor.mediaRespostaSegundos,
                                corretor.respostasMedidas,
                              )
                            : "—"
                        }
                        strong={responseReady && corretor.respostasMedidas > 0}
                      />
                      <MetricRow
                        label="Mais lenta"
                        value={
                          responseReady
                            ? responseLabel(
                                corretor.respostaMaisLentaSegundos,
                                corretor.respostasMedidas,
                              )
                            : "—"
                        }
                      />
                      <MetricRow
                        label="Último atendimento"
                        value={
                          !attendanceReady
                            ? "—"
                            : corretor.ultimoAtendimentoEm
                              ? shortDate(corretor.ultimoAtendimentoEm)
                              : "Sem registro"
                        }
                      />
                    </Panel>
                  </TabsContent>

                  <TabsContent value="agenda" className="mt-4 space-y-3">
                    <Panel
                      title="Agenda operacional"
                      icon={CalendarDays}
                      action={onNavigate ? () => handleNavigate("/agenda") : undefined}
                    >
                      <MetricRow label="Hoje" value={agendaReady ? corretor.agendaHoje : "—"} />
                      <MetricRow
                        label="Próximos compromissos"
                        value={agendaReady ? corretor.agendaProximos : "—"}
                      />
                      <MetricRow
                        label="Pendentes"
                        value={agendaReady ? corretor.agendaPendentes : "—"}
                      />
                      <MetricRow
                        label="Concluídos no período"
                        value={agendaReady ? corretor.agendaConcluidos : "—"}
                      />
                    </Panel>

                    <Panel title="Próximo compromisso" icon={CalendarClock}>
                      {!agendaReady ? (
                        <EmptyNotice>
                          A fonte da Agenda está indisponível neste recorte.
                        </EmptyNotice>
                      ) : corretor.proximoCompromisso ? (
                        <div className="rounded-2xl border border-border/70 bg-card p-4">
                          <p className="font-bold text-foreground">
                            {corretor.proximoCompromisso.title}
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {formatDateTime(corretor.proximoCompromisso.startsAt)}
                          </p>
                          <span className="mt-3 inline-flex rounded-full bg-primary/8 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-primary">
                            {corretor.proximoCompromisso.status}
                          </span>
                        </div>
                      ) : (
                        <EmptyNotice>
                          Nenhum compromisso futuro atribuído no recorte atual.
                        </EmptyNotice>
                      )}
                    </Panel>
                  </TabsContent>

                  <TabsContent value="agenciamentos" className="mt-4 space-y-3">
                    <Panel
                      title="Carteira de agenciamentos"
                      icon={ClipboardCheck}
                      action={onNavigate ? () => handleNavigate("/agenciamentos") : undefined}
                    >
                      <div className="rounded-2xl bg-primary/[0.055] p-4">
                        <div className="flex items-end justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                              Checklist concluído
                            </p>
                            <p className="mt-1 font-mono text-2xl font-black text-primary">
                              {listingsReady ? `${checklist}%` : "—"}
                            </p>
                          </div>
                          <p className="text-sm font-semibold text-muted-foreground">
                            {listingsReady ? corretor.agenciamentosFeitos : "—"} registros
                          </p>
                        </div>
                        <div
                          role="progressbar"
                          aria-label={`Checklist de agenciamentos de ${corretor.nome}`}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={listingsReady ? checklist : undefined}
                          aria-valuetext={
                            listingsReady ? `${checklist}% concluído` : "Indisponível"
                          }
                          className="mt-3 h-2 overflow-hidden rounded-full bg-background"
                        >
                          <span
                            aria-hidden="true"
                            className="block h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
                            style={{ width: listingsReady ? `${checklist}%` : "0%" }}
                          />
                        </div>
                      </div>

                      <MetricRow
                        label="Ativos"
                        value={listingsReady ? corretor.agenciamentosAtivos : "—"}
                      />
                      <MetricRow
                        label="Concluídos"
                        value={listingsReady ? corretor.agenciamentosConcluidos : "—"}
                      />
                      <MetricRow
                        label="Ações pendentes"
                        value={listingsReady ? corretor.agenciamentosAcoesPendentes : "—"}
                      />
                      <ChecklistRow
                        label="Com placa"
                        done={listingsReady ? corretor.agenciamentosComPlaca : "—"}
                        total={listingsReady ? corretor.agenciamentosFeitos : "—"}
                      />
                      <ChecklistRow
                        label="Com fotos"
                        done={listingsReady ? corretor.agenciamentosComFotos : "—"}
                        total={listingsReady ? corretor.agenciamentosFeitos : "—"}
                      />
                      <ChecklistRow
                        label="No site"
                        done={listingsReady ? corretor.agenciamentosNoSite : "—"}
                        total={listingsReady ? corretor.agenciamentosFeitos : "—"}
                      />
                      <ChecklistRow
                        label="Validados"
                        done={listingsReady ? corretor.agenciamentosValidados : "—"}
                        total={listingsReady ? corretor.agenciamentosFeitos : "—"}
                      />
                    </Panel>
                  </TabsContent>

                  <TabsContent value="negocios" className="mt-4 space-y-3">
                    <Panel
                      title="Vendas"
                      icon={Handshake}
                      action={onNavigate ? () => handleNavigate("/vendas") : undefined}
                    >
                      <MetricRow
                        label="Vendas registradas"
                        value={salesReady ? corretor.vendasRegistradas : "—"}
                      />
                      <MetricRow
                        label="Vendas fechadas"
                        value={salesReady ? corretor.vendasFechadas : "—"}
                        strong
                      />
                      <MetricRow
                        label="Valor atribuído"
                        value={salesReady ? brl(corretor.valorVendas, { compact: true }) : "—"}
                      />
                      <MetricRow
                        label="Ticket médio"
                        value={salesReady ? brl(corretor.ticketMedio, { compact: true }) : "—"}
                      />
                    </Panel>

                    <Panel
                      title="Aluguéis"
                      icon={Home}
                      action={onNavigate ? () => handleNavigate("/alugueis") : undefined}
                    >
                      <MetricRow
                        label="Contratos atribuídos"
                        value={rentalsReady ? corretor.alugueisAtribuidos : "—"}
                      />
                      <MetricRow
                        label="Contratos ativos"
                        value={rentalsReady ? corretor.alugueisAtivos : "—"}
                      />
                      <MetricRow
                        label="Contratos encerrados"
                        value={rentalsReady ? corretor.alugueisEncerrados : "—"}
                      />
                    </Panel>

                  </TabsContent>

                  <TabsContent value="agenciamentos" className="mt-4 space-y-3">
                    <Panel
                      title="Carteira de agenciamentos"
                      icon={ClipboardCheck}
                      action={onNavigate ? () => handleNavigate("/agenciamentos") : undefined}
                    >
                      <div className="rounded-2xl bg-primary/[0.055] p-4">
                        <div className="flex items-end justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                              Checklist concluído
                            </p>
                            <p className="mt-1 font-mono text-2xl font-black text-primary">
                              {listingsReady ? `${checklist}%` : "—"}
                            </p>
                          </div>
                          <p className="text-sm font-semibold text-muted-foreground">
                            {listingsReady ? corretor.agenciamentosFeitos : "—"} registros
                          </p>
                        </div>
                        <div
                          role="progressbar"
                          aria-label={`Checklist de agenciamentos de ${corretor.nome}`}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={listingsReady ? checklist : undefined}
                          aria-valuetext={
                            listingsReady ? `${checklist}% concluído` : "Indisponível"
                          }
                          className="mt-3 h-2 overflow-hidden rounded-full bg-background"
                        >
                          <span
                            aria-hidden="true"
                            className="block h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
                            style={{ width: listingsReady ? `${checklist}%` : "0%" }}
                          />
                        </div>
                      </div>

                      <MetricRow
                        label="Ativos"
                        value={listingsReady ? corretor.agenciamentosAtivos : "—"}
                      />
                      <MetricRow
                        label="Concluídos"
                        value={listingsReady ? corretor.agenciamentosConcluidos : "—"}
                      />
                      <MetricRow
                        label="Ações pendentes"
                        value={listingsReady ? corretor.agenciamentosAcoesPendentes : "—"}
                      />
                      <ChecklistRow
                        label="Com placa"
                        done={listingsReady ? corretor.agenciamentosComPlaca : "—"}
                        total={listingsReady ? corretor.agenciamentosFeitos : "—"}
                      />
                      <ChecklistRow
                        label="Com fotos"
                        done={listingsReady ? corretor.agenciamentosComFotos : "—"}
                        total={listingsReady ? corretor.agenciamentosFeitos : "—"}
                      />
                      <ChecklistRow
                        label="No site"
                        done={listingsReady ? corretor.agenciamentosNoSite : "—"}
                        total={listingsReady ? corretor.agenciamentosFeitos : "—"}
                      />
                      <ChecklistRow
                        label="Validados"
                        done={listingsReady ? corretor.agenciamentosValidados : "—"}
                        total={listingsReady ? corretor.agenciamentosFeitos : "—"}
                      />
                    </Panel>
                  </TabsContent>

                  <TabsContent value="negocios" className="mt-4 space-y-3">
                    <Panel
                      title="Vendas"
                      icon={Handshake}
                      action={onNavigate ? () => handleNavigate("/vendas") : undefined}
                    >
                      <MetricRow
                        label="Vendas registradas"
                        value={salesReady ? corretor.vendasRegistradas : "—"}
                      />
                      <MetricRow
                        label="Vendas fechadas"
                        value={salesReady ? corretor.vendasFechadas : "—"}
                        strong
                      />
                      <MetricRow
                        label="Valor atribuído"
                        value={salesReady ? brl(corretor.valorVendas, { compact: true }) : "—"}
                      />
                      <MetricRow
                        label="Ticket médio"
                        value={salesReady ? brl(corretor.ticketMedio, { compact: true }) : "—"}
                      />
                    </Panel>

                    <Panel
                      title="Aluguéis"
                      icon={Home}
                      action={onNavigate ? () => handleNavigate("/alugueis") : undefined}
                    >
                      <MetricRow
                        label="Contratos atribuídos"
                        value={rentalsReady ? corretor.alugueisAtribuidos : "—"}
                      />
                      <MetricRow
                        label="Contratos ativos"
                        value={rentalsReady ? corretor.alugueisAtivos : "—"}
                      />
                      <MetricRow
                        label="Contratos encerrados"
                        value={rentalsReady ? corretor.alugueisEncerrados : "—"}
                      />
                    </Panel>

                    <Panel title="Comissões" icon={BadgeDollarSign}>
                      <FinanceRow
                        label="Prevista"
                        value={
                          salesReady
                            ? moneyLabel(
                                corretor.comissaoPrevista,
                                corretor.comissaoPrevistaDisponivel,
                              )
                            : "—"
                        }
                        accent
                      />
                      <FinanceRow
                        label="Paga"
                        value={
                          salesReady
                            ? moneyLabel(corretor.comissaoPaga, corretor.comissaoPagaDisponivel)
                            : "—"
                        }
                      />
                      <FinanceRow
                        label="Pendente"
                        value={
                          salesReady &&
                          corretor.comissaoPrevistaDisponivel &&
                          corretor.comissaoPagaDisponivel &&
                          corretor.comissaoPaga != null
                            ? brl(Math.max(corretor.comissaoPrevista - corretor.comissaoPaga, 0), {
                                compact: true,
                              })
                            : "Indisponível"
                        }
                      />
                      {salesReady && !corretor.comissaoPagaDisponivel ? (
                        <EmptyNotice>
                          O pagamento não possui comprovação persistida disponível para este
                          recorte.
                        </EmptyNotice>
                      ) : null}
                    </Panel>
                  </TabsContent>

                  <TabsContent value="historico" className="mt-4 space-y-3">
                    <Panel title="Atividade recente" icon={History}>
                      {corretor.atividadesRecentes.length > 0 ? (
                        <ol className="space-y-2">
                          {corretor.atividadesRecentes.map((activity) => (
                            <li key={`${activity.kind}-${activity.id}`}>
                              <ActivityItem
                                activity={activity}
                                actionable={Boolean(onNavigate)}
                                onSelect={() => handleNavigate(activity.route)}
                              />
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <EmptyNotice>
                          Nenhuma atividade recente comprovada no período selecionado.
                        </EmptyNotice>
                      )}
                    </Panel>
                  </TabsContent>
                </div>
              </Tabs>
            </div>
          </>
        ) : (
          <SheetHeader className="sr-only">
            <SheetTitle>Detalhes do corretor</SheetTitle>
            <SheetDescription>
              Selecione um corretor para consultar os indicadores operacionais.
            </SheetDescription>
          </SheetHeader>
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
    <div className={cn("min-w-0 rounded-2xl bg-muted/55 p-3", accent && "bg-primary/8")}>
      <p className="truncate text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 truncate font-mono text-lg font-black text-foreground",
          accent && "text-primary",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function Panel({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  icon: LucideIcon;
  action?: () => void;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[1.35rem] border border-border/70 bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <h3 className="min-w-0 flex-1 text-sm font-bold tracking-tight">{title}</h3>
        {action ? (
          <button
            type="button"
            onClick={action}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-xs font-bold text-primary outline-none transition-colors hover:bg-primary/8 focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
          >
            Abrir
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </button>
        ) : null}
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
    <div className="flex min-h-11 items-center justify-between gap-3 rounded-xl bg-muted/45 px-3 py-2.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-right font-mono text-sm font-bold tabular-nums text-foreground",
          strong && "text-primary",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function FinanceRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className={cn(
        "flex min-h-12 items-center justify-between gap-3 rounded-xl bg-muted/45 px-3 py-3",
        accent && "bg-amber-500/[0.075]",
      )}
    >
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-right font-mono text-sm font-black tabular-nums text-foreground",
          accent && "text-amber-800",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function ChecklistRow({
  label,
  done,
  total,
}: {
  label: string;
  done: number | string;
  total: number | string;
}) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 rounded-xl bg-muted/45 px-3 py-2.5">
      <span className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground">
        <CheckCircle2 className="size-4 shrink-0 text-primary" aria-hidden="true" />
        {label}
      </span>
      <span className="font-mono text-sm font-black text-foreground">
        {done}/{total}
      </span>
    </div>
  );
}

function EmptyNotice({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-border px-3 py-3 text-xs leading-relaxed text-muted-foreground">
      {children}
    </p>
  );
}

const activityIcon: Record<CorretorActivity["kind"], LucideIcon> = {
  atendimento: UserRound,
  agenda: CalendarClock,
  agenciamento: ClipboardCheck,
  venda: FileText,
  aluguel: Home,
};

function ActivityItem({
  activity,
  actionable,
  onSelect,
}: {
  activity: CorretorActivity;
  actionable: boolean;
  onSelect: () => void;
}) {
  const Icon = activityIcon[activity.kind];

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!actionable}
      className="group flex min-h-14 w-full items-center gap-3 rounded-xl border border-border/60 px-3 py-2.5 text-left outline-none transition-colors enabled:hover:border-primary/25 enabled:hover:bg-primary/[0.035] focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-default motion-reduce:transition-none"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/8 text-primary">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-foreground">{activity.title}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          {activity.detail} · {formatDateTime(activity.occurredAt)}
        </span>
      </span>
      {actionable ? (
        <ArrowRight
          className="size-4 shrink-0 text-muted-foreground group-hover:text-primary"
          aria-hidden="true"
        />
      ) : null}
    </button>
  );
}
