import {
  BadgeCheck,
  CalendarClock,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  HardDrive,
  Home,
  MapPinned,
  Pencil,
  ShieldX,
  Tags,
  Trash2,
  type LucideIcon,
  UserRound,
  Video,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getAgenciamentoImobiliariaLabel,
  getAgenciamentoOrigemLabel,
  getAgenciamentoStatusLabel,
  getAgenciamentoTipoLabel,
  getChecklistCompletedCount,
  getChecklistCompletionPercent,
} from "@/services/agenciamentos";
import type {
  Agenciamento,
  AgenciamentoChecklist,
  AgenciamentoFinalidade,
} from "@/types/agenciamento";
import { shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type AgenciamentoDetailDrawerProps = {
  agenciamento: Agenciamento | null;
  open: boolean;
  canManage: boolean;
  canEdit: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (agenciamento: Agenciamento) => void;
  onValidate: (agenciamento: Agenciamento) => void;
  canReject?: boolean;
  onReject?: (agenciamento: Agenciamento) => void;
  onDelete?: (agenciamento: Agenciamento) => void;
  onReclassify?: (
    agenciamento: Agenciamento,
    finalidade: AgenciamentoFinalidade,
  ) => Promise<boolean> | void;
  isReclassifying?: boolean;
};

const checklistRows: Array<{
  key: keyof AgenciamentoChecklist;
  label: string;
  icon: LucideIcon;
}> = [
  { key: "fotosHorizontal", label: "Fotos realizadas (horizontal)", icon: Camera },
  { key: "fotosVertical", label: "Fotos realizadas (vertical)", icon: Camera },
  { key: "fotosDrive", label: "Fotos enviadas ao Drive", icon: HardDrive },
  { key: "placaInstalada", label: "Placa instalada", icon: MapPinned },
  { key: "cadastradoMorar", label: "Imóvel cadastrado Morar", icon: ClipboardCheck },
  { key: "cadastradoCordial", label: "Imóvel cadastrado Cordial", icon: ClipboardCheck },
  { key: "videoRealizado", label: "Vídeo realizado", icon: Video },
  { key: "validado", label: "Agenciamento validado", icon: BadgeCheck },
];

const finalidadeLabel = (value?: AgenciamentoFinalidade) =>
  value === "aluguel" ? "Aluguel" : value === "venda" ? "Venda" : "Sem classificação";

export function AgenciamentoDetailDrawer({
  agenciamento,
  open,
  canManage,
  canEdit,
  onOpenChange,
  onEdit,
  onValidate,
  canReject = false,
  onReject,
  onDelete,
  onReclassify,
  isReclassifying,
}: AgenciamentoDetailDrawerProps) {
  const [pendingFinalidade, setPendingFinalidade] = useState<AgenciamentoFinalidade | null>(null);
  const progress = agenciamento ? getChecklistCompletionPercent(agenciamento.checklist) : 0;
  const completed = agenciamento ? getChecklistCompletedCount(agenciamento.checklist) : 0;
  const validated = Boolean(
    agenciamento?.checklist.validado || agenciamento?.status === "validado",
  );

  const canReclassify = Boolean(onReclassify && canEdit);

  return (
    <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        closeLabel="Fechar detalhes do agenciamento"
        className="flex h-dvh w-full max-w-full flex-col overflow-hidden border-white/20 bg-[#f7f3ed]/95 p-0 text-foreground backdrop-blur-2xl data-[state=closed]:duration-200 data-[state=open]:duration-300 motion-reduce:data-[state=closed]:animate-none motion-reduce:data-[state=open]:animate-none motion-reduce:transition-none sm:max-w-xl lg:max-w-2xl [&>button]:right-5 [&>button]:top-5 [&>button]:z-20"
      >
        {agenciamento && (
          <>
            {agenciamento.status === "reprovado" && agenciamento.reprovadoMotivo && (
              <div className="mx-5 mt-5 flex items-start gap-2.5 rounded-2xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm leading-relaxed text-destructive sm:mx-6">
                <ShieldX aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider">
                    Agenciamento reprovado
                    {agenciamento.reprovadoPorNome ? ` por ${agenciamento.reprovadoPorNome}` : ""}
                  </p>
                  <p className="mt-1 text-sm">{agenciamento.reprovadoMotivo}</p>
                </div>
              </div>
            )}
            <SheetHeader className="border-b border-white/55 px-5 pb-4 pt-6 text-left sm:px-6">
              <div className="flex items-start gap-3 pr-8">
                <span className="grid size-13 shrink-0 place-items-center rounded-2xl bg-primary text-white shadow-[0_16px_34px_-22px_rgba(30,100,125,0.85)]">
                  <Home className="size-6" />
                </span>
                <div className="min-w-0 flex-1">
                  {(agenciamento.codigoMorar || agenciamento.codigoCordial) && (
                    <p className="mb-1 truncate text-[10px] font-bold uppercase tracking-[0.14em] text-primary">
                      {[
                        agenciamento.codigoMorar && `Morar ${agenciamento.codigoMorar}`,
                        agenciamento.codigoCordial && `Cordial ${agenciamento.codigoCordial}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                  <SheetTitle className="truncate text-xl font-black tracking-tight">
                    {getAgenciamentoTipoLabel(agenciamento.tipoImovel)} -{" "}
                    {agenciamento.bairro || agenciamento.endereco}
                  </SheetTitle>

                  <SheetDescription className="mt-1 text-xs">
                    {agenciamento.endereco} -{" "}
                    {getAgenciamentoImobiliariaLabel(agenciamento.imobiliaria)} -{" "}
                    {shortDate(agenciamento.dataAgenciamento)}
                  </SheetDescription>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-primary">
                      {getAgenciamentoStatusLabel(agenciamento.status)}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em]",
                        validated
                          ? "bg-emerald-500/10 text-emerald-700"
                          : "bg-[rgba(217,120,45,0.12)] text-[var(--system-accent-dark)]",
                      )}
                    >
                      {validated ? "Validado" : "Pendente"}
                    </span>
                  </div>
                </div>
              </div>
            </SheetHeader>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
              <div className="grid grid-cols-3 gap-2">
                <MiniStat label="Checklist" value={`${progress}%`} accent />
                <MiniStat label="Etapas" value={`${completed}/6`} />
                <MiniStat label="Corretor" value={agenciamento.corretorNome.split(" ")[0]} />
              </div>

              <Tabs defaultValue="desempenho" className="mt-5">
                <TabsList className="grid h-auto w-full grid-cols-2 rounded-xl bg-white/[0.62] p-1 text-[11px] sm:grid-cols-4">
                  <TabsTrigger value="desempenho" className="rounded-xl px-2 text-[11px]">
                    Imóvel
                  </TabsTrigger>
                  <TabsTrigger value="checklist" className="rounded-xl px-2 text-[11px]">
                    Checklist
                  </TabsTrigger>
                  <TabsTrigger value="links" className="rounded-xl px-2 text-[11px]">
                    Links
                  </TabsTrigger>
                  <TabsTrigger value="historico" className="rounded-xl px-2 text-[11px]">
                    Histórico
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="desempenho" className="mt-4 space-y-3">
                  <Panel title="Classificação comercial" icon={Tags}>
                    <div className="rounded-2xl bg-white/[0.62] px-3 py-3 ring-1 ring-white/70">
                      <p className="text-xs font-medium text-foreground/48">
                        Trilha atual: {finalidadeLabel(agenciamento.finalidade)}
                      </p>
                      <Select
                        value={agenciamento.finalidade ?? ""}
                        disabled={!canReclassify || isReclassifying}
                        onValueChange={(value) => {
                          const next = value as AgenciamentoFinalidade;
                          if (next === agenciamento.finalidade) return;
                          setPendingFinalidade(next);
                        }}
                      >
                        <SelectTrigger
                          aria-label="Classificação Venda ou Aluguel"
                          className="mt-2 h-10 rounded-xl bg-white/80"
                        >
                          <SelectValue placeholder="Selecione Venda ou Aluguel" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="venda">Venda</SelectItem>
                          <SelectItem value="aluguel">Aluguel</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="mt-2 text-[11px] leading-relaxed text-foreground/50">
                        {canReclassify
                          ? "Você pode trocar entre Venda e Aluguel quando quiser. As bonificações são recalculadas na hora."
                          : "Seu perfil não permite alterar a classificação deste agenciamento."}
                      </p>
                    </div>
                  </Panel>

                  <Panel title="Dados do imóvel" icon={Home}>
                    <MetricRow
                      label="Tipo"
                      value={getAgenciamentoTipoLabel(agenciamento.tipoImovel)}
                    />
                    <MetricRow label="Código Morar" value={agenciamento.codigoMorar || "-"} />
                    <MetricRow label="Código Cordial" value={agenciamento.codigoCordial || "-"} />
                    <MetricRow label="Endereço" value={agenciamento.endereco} />
                    <MetricRow label="Bairro/regiao" value={agenciamento.bairro || "-"} />
                    <MetricRow label="Cidade" value={agenciamento.cidade || "-"} />
                    <MetricRow
                      label="Imobiliária"
                      value={getAgenciamentoImobiliariaLabel(agenciamento.imobiliaria)}
                    />
                    <MetricRow label="Descrição" value={agenciamento.descricaoImovel || "-"} />
                  </Panel>

                  <Panel title="Proprietário e responsável" icon={UserRound}>
                    <MetricRow label="Proprietário" value={agenciamento.proprietarioNome} strong />
                    <MetricRow label="Telefone" value={agenciamento.proprietarioTelefone} />
                    <MetricRow
                      label="Contato preferencial"
                      value={agenciamento.proprietarioContatoPreferencial ?? "-"}
                    />
                    <MetricRow
                      label="Observações"
                      value={agenciamento.proprietarioObservacoes || "-"}
                    />
                    <MetricRow label="Corretor" value={agenciamento.corretorNome} strong />
                    <MetricRow
                      label="Origem"
                      value={getAgenciamentoOrigemLabel(agenciamento.origem)}
                    />
                  </Panel>
                </TabsContent>

                <TabsContent value="checklist" className="mt-4 space-y-3">
                  <Panel title="Checklist operacional" icon={ClipboardCheck}>
                    <div className="rounded-2xl bg-primary/[0.075] p-4">
                      <div className="flex items-end justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary/65">
                            Progresso
                          </p>
                          <p className="mt-1 text-3xl font-black text-primary tabular-nums">
                            {progress}%
                          </p>
                        </div>
                        <p className="text-xl font-black text-foreground/75 tabular-nums">
                          {completed}/6
                        </p>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/70">
                        <span
                          className="block h-full rounded-full bg-primary"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>

                    {checklistRows.map((item) => {
                      const Icon = item.icon;
                      const done = agenciamento.checklist[item.key];
                      return (
                        <div
                          key={item.key}
                          className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.62] px-3 py-3 ring-1 ring-white/70"
                        >
                          <span className="inline-flex min-w-0 items-center gap-2 text-sm font-semibold">
                            <Icon className="size-4 text-primary/70" />
                            {item.label}
                          </span>
                          <span
                            className={cn(
                              "rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em]",
                              done
                                ? "bg-emerald-500/10 text-emerald-700"
                                : "bg-foreground/[0.06] text-foreground/45",
                            )}
                          >
                            {done ? "OK" : "Pendente"}
                          </span>
                        </div>
                      );
                    })}
                  </Panel>
                </TabsContent>

                <TabsContent value="links" className="mt-4 space-y-3">
                  <Panel title="Drive e site" icon={ExternalLink}>
                    <LinkRow label="Pasta do Drive" href={agenciamento.driveFolderUrl} />
                    <LinkRow label="Imóvel no site" href={agenciamento.siteUrl} />
                    <MetricRow
                      label="Observações internas"
                      value={agenciamento.observacoesInternas || "-"}
                    />
                  </Panel>
                </TabsContent>

                <TabsContent value="historico" className="mt-4 space-y-3">
                  <Panel title="Histórico básico" icon={CalendarClock}>
                    <MetricRow label="Criado por" value={agenciamento.criadoPorNome || "-"} />
                    <MetricRow label="Criado em" value={shortDate(agenciamento.criadoEm)} />
                    <MetricRow label="Atualizado em" value={shortDate(agenciamento.atualizadoEm)} />
                    <MetricRow label="Validado por" value={agenciamento.validadoPorNome || "-"} />
                    <MetricRow
                      label="Validado em"
                      value={agenciamento.validadoEm ? shortDate(agenciamento.validadoEm) : "-"}
                    />
                  </Panel>
                </TabsContent>
              </Tabs>
            </div>

            <div
              className="flex flex-col gap-2 border-t border-white/60 bg-white/70 px-5 py-4 backdrop-blur sm:flex-row sm:justify-end sm:px-6"
              style={{ paddingBottom: "max(env(safe-area-inset-bottom), 1rem)" }}
            >
              {onDelete && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-2xl border-destructive/30 bg-white/[0.66] text-destructive hover:bg-destructive/10"
                  onClick={() => onDelete(agenciamento)}
                >
                  <Trash2 className="size-4" />
                  Excluir
                </Button>
              )}
              {canEdit && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-2xl border-white/[0.65] bg-white/[0.66]"
                  onClick={() => onEdit(agenciamento)}
                >
                  <Pencil className="size-4" />
                  Editar
                </Button>
              )}
              {canReject && onReject && agenciamento.status !== "reprovado" && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-2xl border-destructive/30 bg-white/[0.66] text-destructive hover:bg-destructive/10"
                  onClick={() => onReject(agenciamento)}
                >
                  <ShieldX className="size-4" />
                  Reprovar
                </Button>
              )}
              {canManage && !validated && (
                <Button
                  type="button"
                  className="h-11 rounded-2xl bg-primary text-white"
                  onClick={() => onValidate(agenciamento)}
                >
                  <CheckCircle2 className="size-4" />
                  Validar agenciamento
                </Button>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>

    <AlertDialog
      open={pendingFinalidade !== null}
      onOpenChange={(next) => {
        if (!next && !isReclassifying) setPendingFinalidade(null);
      }}
    >
      <AlertDialogContent className="w-[calc(100%_-_2rem)] max-w-md rounded-2xl border-border bg-background p-5 shadow-2xl sm:p-6">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg font-extrabold tracking-tight">
            Alterar a trilha desta captação?
          </AlertDialogTitle>
          <AlertDialogDescription className="leading-relaxed text-muted-foreground">
            A classificação mudará de <strong>{finalidadeLabel(agenciamento?.finalidade)}</strong>{" "}
            para <strong>{finalidadeLabel(pendingFinalidade ?? undefined)}</strong>. As bonificações
            e os indicadores das duas trilhas serão recalculados imediatamente.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isReclassifying} className="h-10 rounded-xl shadow-none">
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={isReclassifying}
            className="h-10 rounded-xl"
            onClick={(event) => {
              event.preventDefault();
              if (!agenciamento || !pendingFinalidade || !onReclassify) return;
              const next = pendingFinalidade;
              void Promise.resolve(onReclassify(agenciamento, next)).finally(() =>
                setPendingFinalidade(null),
              );
            }}
          >
            {isReclassifying ? "Salvando..." : "Confirmar mudança"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}


function MiniStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
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
          "mt-1 truncate text-lg font-black leading-none tabular-nums",
          accent ? "text-primary" : "text-foreground",
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
  children,
}: {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[1.35rem] border border-white/60 bg-white/[0.48] p-4 shadow-[0_14px_34px_-28px_rgba(23,27,33,0.24)]">
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
    <div className="flex items-start justify-between gap-3 rounded-2xl bg-white/[0.62] px-3 py-3 ring-1 ring-white/70">
      <span className="text-xs font-medium text-foreground/48">{label}</span>
      <span
        className={cn(
          "max-w-[62%] text-right text-xs font-semibold text-foreground/72",
          strong && "text-primary",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function LinkRow({ label, href }: { label: string; href?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.62] px-3 py-3 ring-1 ring-white/70">
      <span className="text-xs font-medium text-foreground/48">{label}</span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
        >
          Abrir
          <ExternalLink className="size-3.5" />
        </a>
      ) : (
        <span className="text-xs font-semibold text-foreground/42">Não informado</span>
      )}
    </div>
  );
}
