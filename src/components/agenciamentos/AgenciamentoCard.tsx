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

  return (
    <article className="group relative grid min-w-0 gap-4 px-4 py-4 transition-[background-color,box-shadow] duration-180 ease-out hover:bg-white/72 focus-within:bg-white/78 sm:px-5 md:grid-cols-2 xl:grid-cols-[minmax(0,1.45fr)_minmax(10rem,0.66fr)_minmax(12rem,0.78fr)_auto] xl:items-center">
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-y-4 left-0 w-0.5 rounded-full",
          agenciamento.imobiliaria === "morar"
            ? "bg-[var(--morar-primary)]"
            : agenciamento.imobiliaria === "ambas"
              ? "bg-[var(--system-primary)]"
              : "bg-[var(--cordial-primary)]",
        )}
      />

      <div className="min-w-0 pl-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge label={getAgenciamentoStatusLabel(agenciamento.status)} tone={statusTone} />
          <span className="rounded-full border border-foreground/9 bg-white/64 px-2 py-0.5 text-[10px] font-semibold text-foreground/60">
            {getAgenciamentoImobiliariaLabel(agenciamento.imobiliaria)}
          </span>
        </div>

        <button
          type="button"
          onClick={() => onView(agenciamento)}
          className="mt-2 block max-w-full text-left text-[15px] font-extrabold leading-snug tracking-tight text-foreground underline-offset-4 transition-colors duration-150 ease-out hover:text-primary hover:underline focus-visible:rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2"
        >
          {getAgenciamentoTipoLabel(agenciamento.tipoImovel)} — {agenciamento.endereco}
        </button>

        <div className="mt-1.5 flex min-w-0 items-start gap-1.5 text-xs text-foreground/56">
          <MapPin aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-primary/70" />
          <span className="min-w-0 truncate" title={location || agenciamento.endereco}>
            {location || "Bairro e cidade não informados"}
          </span>
        </div>

        <div className="mt-2 flex min-w-0 items-center gap-2 border-t border-foreground/7 pt-2 text-xs">
          <UserRound aria-hidden="true" className="size-3.5 shrink-0 text-foreground/42" />
          <span
            className="truncate font-semibold text-foreground/78"
            title={agenciamento.proprietarioNome}
          >
            {agenciamento.proprietarioNome}
          </span>
          <span aria-hidden="true" className="text-foreground/20">
            •
          </span>
          <span className="shrink-0 text-foreground/52">{agenciamento.proprietarioTelefone}</span>
        </div>
      </div>

      <div className="min-w-0 space-y-2 md:rounded-xl md:border md:border-foreground/7 md:bg-white/38 md:px-3 md:py-2.5 xl:border-0 xl:bg-transparent xl:p-0">
        <p className="text-[11px] font-semibold text-foreground/48">Responsabilidade</p>
        <div className="flex min-w-0 items-center gap-2 text-xs">
          <UserRound aria-hidden="true" className="size-3.5 shrink-0 text-primary/70" />
          <span
            className="truncate font-semibold text-foreground/76"
            title={agenciamento.corretorNome}
          >
            {agenciamento.corretorNome}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-foreground/54">
          <CalendarDays aria-hidden="true" className="size-3.5 text-foreground/42" />
          <span>{shortDate(agenciamento.dataAgenciamento)}</span>
        </div>
      </div>

      <div className="min-w-0">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold text-foreground/48">Checklist operacional</p>
          <span className="text-xs font-extrabold text-primary tabular-nums">
            {completed}/6 · {progress}%
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-foreground/8" aria-hidden="true">
          <span
            className="block h-full origin-left rounded-full bg-[#1e647d] transition-transform duration-200 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none"
            style={{ transform: `scaleX(${progress / 100})` }}
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {pendingItems.length > 0 ? (
            pendingItems.slice(0, 3).map((item) => {
              const Icon = item.icon;
              return (
                <span
                  key={item.key}
                  className="inline-flex items-center gap-1 rounded-md bg-[rgba(217,120,45,0.1)] px-1.5 py-1 text-[10px] font-semibold text-[var(--system-accent-dark)]"
                >
                  <Icon aria-hidden="true" className="size-3" />
                  {item.pendingLabel}
                </span>
              );
            })
          ) : (
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-1 text-[10px] font-semibold text-emerald-700">
              <CheckCircle2 aria-hidden="true" className="size-3" />
              Checklist concluído
            </span>
          )}
          {pendingItems.length > 3 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-foreground/6 px-1.5 py-1 text-[10px] font-semibold text-foreground/55">
              <CircleAlert aria-hidden="true" className="size-3" />+{pendingItems.length - 3}{" "}
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
          className="h-9 rounded-lg border-foreground/10 bg-white/70 px-2.5 text-xs shadow-none transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.98]"
          onClick={() => onView(agenciamento)}
        >
          Detalhes
        </Button>
        {canEdit && (
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="size-9 rounded-lg border-foreground/10 bg-white/70 shadow-none transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.97]"
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
            className="h-9 rounded-lg bg-[#174d61] px-2.5 text-xs text-white transition-[background-color,transform] duration-150 ease-out hover:bg-[#1e647d] active:scale-[0.98]"
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
            className="size-9 rounded-lg text-primary transition-[background-color,transform] duration-150 ease-out active:scale-[0.97]"
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
            className="size-9 rounded-lg text-primary transition-[background-color,transform] duration-150 ease-out active:scale-[0.97]"
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
