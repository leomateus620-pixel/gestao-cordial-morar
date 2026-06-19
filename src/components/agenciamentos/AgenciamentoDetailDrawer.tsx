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
  type LucideIcon,
  UserRound,
  Video,
} from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
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
import type { Agenciamento, AgenciamentoChecklist } from "@/types/agenciamento";
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
};

const checklistRows: Array<{
  key: keyof AgenciamentoChecklist;
  label: string;
  icon: LucideIcon;
}> = [
  { key: "fotosRealizadas", label: "Fotos realizadas", icon: Camera },
  { key: "fotosDrive", label: "Fotos enviadas ao Drive", icon: HardDrive },
  { key: "placaInstalada", label: "Placa instalada", icon: MapPinned },
  { key: "cadastradoSite", label: "Imovel cadastrado no site", icon: ClipboardCheck },
  { key: "videoRealizado", label: "Video realizado", icon: Video },
  { key: "validado", label: "Agenciamento validado", icon: BadgeCheck },
];

export function AgenciamentoDetailDrawer({
  agenciamento,
  open,
  canManage,
  canEdit,
  onOpenChange,
  onEdit,
  onValidate,
}: AgenciamentoDetailDrawerProps) {
  const progress = agenciamento ? getChecklistCompletionPercent(agenciamento.checklist) : 0;
  const completed = agenciamento ? getChecklistCompletedCount(agenciamento.checklist) : 0;
  const validated = Boolean(
    agenciamento?.checklist.validado || agenciamento?.status === "validado",
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-dvh w-full max-w-full flex-col overflow-hidden border-white/20 bg-[#f7f3ed]/95 p-0 text-foreground backdrop-blur-2xl sm:max-w-xl lg:max-w-2xl [&>button]:right-5 [&>button]:top-5 [&>button]:z-20"
      >
        {agenciamento && (
          <>
            <SheetHeader className="border-b border-white/55 px-5 pb-4 pt-6 text-left sm:px-6">
              <div className="flex items-start gap-3 pr-8">
                <span className="grid size-13 shrink-0 place-items-center rounded-2xl bg-primary text-white shadow-[0_16px_34px_-22px_rgba(30,100,125,0.85)]">
                  <Home className="size-6" />
                </span>
                <div className="min-w-0 flex-1">
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
                <TabsList className="grid h-auto w-full grid-cols-4 rounded-2xl bg-white/[0.62] p-1 text-[11px]">
                  <TabsTrigger value="desempenho" className="rounded-xl px-2 text-[11px]">
                    Imovel
                  </TabsTrigger>
                  <TabsTrigger value="checklist" className="rounded-xl px-2 text-[11px]">
                    Checklist
                  </TabsTrigger>
                  <TabsTrigger value="links" className="rounded-xl px-2 text-[11px]">
                    Links
                  </TabsTrigger>
                  <TabsTrigger value="historico" className="rounded-xl px-2 text-[11px]">
                    Historico
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="desempenho" className="mt-4 space-y-3">
                  <Panel title="Dados do imovel" icon={Home}>
                    <MetricRow
                      label="Tipo"
                      value={getAgenciamentoTipoLabel(agenciamento.tipoImovel)}
                    />
                    <MetricRow label="Endereco" value={agenciamento.endereco} />
                    <MetricRow label="Bairro/regiao" value={agenciamento.bairro || "-"} />
                    <MetricRow label="Cidade" value={agenciamento.cidade || "-"} />
                    <MetricRow
                      label="Imobiliaria"
                      value={getAgenciamentoImobiliariaLabel(agenciamento.imobiliaria)}
                    />
                    <MetricRow label="Descricao" value={agenciamento.descricaoImovel || "-"} />
                  </Panel>

                  <Panel title="Proprietario e responsavel" icon={UserRound}>
                    <MetricRow label="Proprietario" value={agenciamento.proprietarioNome} strong />
                    <MetricRow label="Telefone" value={agenciamento.proprietarioTelefone} />
                    <MetricRow
                      label="Contato preferencial"
                      value={agenciamento.proprietarioContatoPreferencial ?? "-"}
                    />
                    <MetricRow
                      label="Observacoes"
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
                          <p className="mt-1 font-mono text-3xl font-black text-primary">
                            {progress}%
                          </p>
                        </div>
                        <p className="font-mono text-xl font-black text-foreground/75">
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
                    <LinkRow label="Imovel no site" href={agenciamento.siteUrl} />
                    <MetricRow
                      label="Observacoes internas"
                      value={agenciamento.observacoesInternas || "-"}
                    />
                  </Panel>
                </TabsContent>

                <TabsContent value="historico" className="mt-4 space-y-3">
                  <Panel title="Historico basico" icon={CalendarClock}>
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

            <div className="flex flex-col gap-2 border-t border-white/60 bg-white/45 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
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
          "mt-1 truncate font-mono text-lg font-black leading-none tabular-nums",
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
        <span className="text-xs font-semibold text-foreground/42">Nao informado</span>
      )}
    </div>
  );
}
