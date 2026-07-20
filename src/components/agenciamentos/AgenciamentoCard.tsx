import { memo } from "react";
import {
  BadgeCheck,
  CalendarDays,
  Camera,
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  ExternalLink,
  HardDrive,
  MapPin,
  Pencil,
  Signpost,
  UserRound,
  Video,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getAgenciamentoImobiliariaLabel,
  getAgenciamentoStatusLabel,
  getAgenciamentoStatusTone,
  getAgenciamentoTipoLabel,
  getChecklistCompletedCount,
  getChecklistCompletionPercent,
} from "@/services/agenciamentos";
import type { Agenciamento, AgenciamentoChecklist } from "@/types/agenciamento";
import { shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type AgenciamentoCardProps = {
  agenciamento: Agenciamento;
  canManage: boolean;
  canEdit: boolean;
  onView: (agenciamento: Agenciamento) => void;
  onEdit: (agenciamento: Agenciamento) => void;
  onValidate: (agenciamento: Agenciamento) => void;
};

const operationalItems: Array<{
  key: keyof AgenciamentoChecklist;
  pendingLabel: string;
  icon: LucideIcon;
}> = [
  { key: "fotosRealizadas", pendingLabel: "Realizar fotos", icon: Camera },
  { key: "fotosDrive", pendingLabel: "Enviar ao Drive", icon: HardDrive },
  { key: "placaInstalada", pendingLabel: "Instalar placa", icon: Signpost },
  { key: "cadastradoSite", pendingLabel: "Publicar no site", icon: ClipboardCheck },
  { key: "videoRealizado", pendingLabel: "Gravar vídeo", icon: Video },
  { key: "validado", pendingLabel: "Validar cadastro", icon: BadgeCheck },
];

function AgenciamentoCardComponent({
  agenciamento,
  canManage,
  canEdit,
  onView,
  onEdit,
  onValidate,
}: AgenciamentoCardProps) {
  const progress = getChecklistCompletionPercent(agenciamento.checklist);
  const completed = getChecklistCompletedCount(agenciamento.checklist);
  const statusTone = getAgenciamentoStatusTone(agenciamento.status);
  const isValidated = agenciamento.status === "validado" || agenciamento.checklist.validado;
  const pendingItems = operationalItems.filter((item) => !agenciamento.checklist[item.key]);
  const location = [agenciamento.bairro, agenciamento.cidade].filter(Boolean).join(" • ");
  const brandChipClass =
    agenciamento.imobiliaria === "morar"
      ? "border-[var(--morar-primary)]/25 bg-[color-mix(in_oklab,var(--morar-primary)_10%,white)] text-[var(--morar-primary)]"
      : agenciamento.imobiliaria === "ambas"
        ? "border-[var(--system-primary)]/25 bg-[color-mix(in_oklab,var(--system-primary)_10%,white)] text-[var(--system-primary)]"
        : "border-[var(--cordial-primary)]/25 bg-[color-mix(in_oklab,var(--cordial-primary)_10%,white)] text-[var(--cordial-primary)]";

  return (
    <article className="group relative grid min-w-0 gap-4 rounded-2xl border border-foreground/6 bg-white px-5 py-5 shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_1px_2px_rgba(23,27,33,0.05),0_18px_36px_-24px_rgba(23,27,33,0.28)] transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-foreground/10 hover:shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_2px_4px_rgba(23,27,33,0.06),0_28px_48px_-24px_rgba(23,27,33,0.32)] focus-within:border-primary/25 motion-reduce:transition-none sm:px-6 md:grid-cols-2 xl:grid-cols-[minmax(0,1.45fr)_minmax(10rem,0.66fr)_minmax(12rem,0.78fr)_auto] xl:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge label={getAgenciamentoStatusLabel(agenciamento.status)} tone={statusTone} />
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
              brandChipClass,
            )}
          >
            {getAgenciamentoImobiliariaLabel(agenciamento.imobiliaria)}
          </span>
        </div>

        <button
          type="button"
          onClick={() => onView(agenciamento)}
          className="mt-2.5 block max-w-full text-left text-base font-extrabold leading-snug tracking-tight text-foreground underline-offset-4 transition-colors duration-150 ease-out hover:text-primary hover:underline focus-visible:rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2"
        >
          {getAgenciamentoTipoLabel(agenciamento.tipoImovel)} — {agenciamento.endereco}
        </button>

        <div className="mt-1.5 flex min-w-0 items-start gap-1.5 text-xs text-foreground/70">
          <MapPin aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-primary/75" />
          <span className="min-w-0 truncate" title={location || agenciamento.endereco}>
            {location || "Bairro e cidade não informados"}
          </span>
        </div>

        <div className="mt-2.5 flex min-w-0 items-center gap-2 border-t border-foreground/8 pt-2.5 text-xs">
          <UserRound aria-hidden="true" className="size-3.5 shrink-0 text-foreground/50" />
          <span
            className="truncate font-semibold text-foreground/90"
            title={agenciamento.proprietarioNome}
          >
            {agenciamento.proprietarioNome}
          </span>
          <span aria-hidden="true" className="text-foreground/25">
            •
          </span>
          <span className="shrink-0 text-foreground/60">{agenciamento.proprietarioTelefone}</span>
        </div>
      </div>

      <div className="min-w-0 space-y-2 md:rounded-xl md:border md:border-foreground/8 md:bg-[#f7f4f0] md:px-3.5 md:py-3 xl:border-0 xl:bg-transparent xl:p-0">
        <p className="text-[11px] font-bold uppercase tracking-wider text-foreground/55">
          Responsabilidade
        </p>
        <div className="flex min-w-0 items-center gap-2 text-xs">
          <UserRound aria-hidden="true" className="size-3.5 shrink-0 text-[#174d61]" />
          <span
            className="truncate font-semibold text-foreground/90"
            title={agenciamento.corretorNome}
          >
            {agenciamento.corretorNome}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-foreground/65">
          <CalendarDays aria-hidden="true" className="size-3.5 text-foreground/50" />
          <span>{shortDate(agenciamento.dataAgenciamento)}</span>
        </div>
      </div>

      <div className="min-w-0">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-foreground/55">
            Checklist operacional
          </p>
          <span className="text-xs font-extrabold text-primary tabular-nums">
            {completed}/6 · {progress}%
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-foreground/10" aria-hidden="true">
          <span
            className="block h-full origin-left rounded-full bg-gradient-to-r from-[#174d61] to-[#2d8fa8] shadow-[0_1px_2px_rgba(23,77,97,0.35)] transition-transform duration-200 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none"
            style={{ transform: `scaleX(${progress / 100})` }}
          />
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {pendingItems.length > 0 ? (
            pendingItems.slice(0, 3).map((item) => {
              const Icon = item.icon;
              return (
                <span
                  key={item.key}
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--system-accent)]/22 bg-[color-mix(in_oklab,var(--system-accent)_14%,white)] px-2 py-1 text-[10px] font-bold text-[var(--system-accent-dark)]"
                >
                  <Icon aria-hidden="true" className="size-3.5" />
                  {item.pendingLabel}
                </span>
              );
            })
          ) : (
            <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/25 bg-emerald-500/12 px-2 py-1 text-[10px] font-bold text-emerald-800">
              <CheckCircle2 aria-hidden="true" className="size-3.5" />
              Checklist concluído
            </span>
          )}
          {pendingItems.length > 3 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-foreground/8 px-2 py-1 text-[10px] font-bold text-foreground/70">
              <CircleAlert aria-hidden="true" className="size-3.5" />+{pendingItems.length - 3}{" "}
              pendências
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 md:col-span-2 xl:col-span-1 xl:justify-end">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-9 rounded-lg border-foreground/12 bg-white px-3 text-xs font-semibold text-foreground/85 shadow-[0_1px_2px_rgba(23,27,33,0.04)] transition-[background-color,color,transform] duration-150 ease-out hover:bg-foreground/[0.04] active:scale-[0.98]"
          onClick={() => onView(agenciamento)}
        >
          Detalhes
        </Button>
        {canEdit && (
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="size-9 rounded-lg border-foreground/12 bg-white text-foreground/70 shadow-[0_1px_2px_rgba(23,27,33,0.04)] transition-[background-color,color,transform] duration-150 ease-out hover:bg-foreground/[0.04] active:scale-[0.97]"
            onClick={() => onEdit(agenciamento)}
            aria-label={`Editar ${agenciamento.endereco}`}
            title="Editar"
          >
            <Pencil className="size-3.5" />
          </Button>
        )}
        {canManage && !isValidated && (
          <Button
            type="button"
            size="sm"
            className="h-9 rounded-lg bg-[#174d61] px-3 text-xs font-bold text-white shadow-[0_8px_18px_-10px_rgba(23,77,97,0.7)] transition-[background-color,transform,box-shadow] duration-150 ease-out hover:-translate-y-px hover:bg-[#1e647d] active:translate-y-0 active:scale-[0.98]"
            onClick={() => onValidate(agenciamento)}
          >
            <CheckCircle2 className="size-3.5" />
            Validar
          </Button>
        )}
        {agenciamento.driveFolderUrl && (
          <Button
            asChild
            size="icon"
            variant="ghost"
            className="size-9 rounded-lg text-foreground/55 transition-[background-color,color,transform] duration-150 ease-out hover:bg-foreground/5 hover:text-primary active:scale-[0.97]"
          >
            <a
              href={agenciamento.driveFolderUrl}
              target="_blank"
              rel="noreferrer"
              aria-label={`Abrir Drive de ${agenciamento.endereco}`}
              title="Abrir Drive"
            >
              <HardDrive className="size-3.5" />
            </a>
          </Button>
        )}
        {agenciamento.siteUrl && (
          <Button
            asChild
            size="icon"
            variant="ghost"
            className="size-9 rounded-lg text-foreground/55 transition-[background-color,color,transform] duration-150 ease-out hover:bg-foreground/5 hover:text-primary active:scale-[0.97]"
          >
            <a
              href={agenciamento.siteUrl}
              target="_blank"
              rel="noreferrer"
              aria-label={`Abrir imóvel no site: ${agenciamento.endereco}`}
              title="Abrir imóvel no site"
            >
              <ExternalLink className="size-3.5" />
            </a>
          </Button>
        )}
      </div>
    </article>
  );
}

function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: "neutral" | "warning" | "success" | "danger";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold",
        tone === "success" && "border-emerald-500/20 bg-emerald-500/10 text-emerald-700",
        tone === "warning" &&
          "border-[rgba(217,120,45,0.18)] bg-[rgba(217,120,45,0.1)] text-[var(--system-accent-dark)]",
        tone === "danger" && "border-red-500/18 bg-red-500/9 text-red-700",
        tone === "neutral" && "border-primary/12 bg-primary/8 text-primary",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 rounded-full",
          tone === "success" && "bg-emerald-600",
          tone === "warning" && "bg-[var(--system-accent)]",
          tone === "danger" && "bg-red-600",
          tone === "neutral" && "bg-primary",
        )}
      />
      {label}
    </span>
  );
}

export const AgenciamentoCard = memo(AgenciamentoCardComponent);
