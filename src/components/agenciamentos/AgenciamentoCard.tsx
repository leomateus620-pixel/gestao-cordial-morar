import { memo, useCallback, type CSSProperties, type PointerEvent } from "react";
import {
  BadgeCheck,
  CalendarDays,
  Camera,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  ExternalLink,
  Eye,
  HardDrive,
  MapPinned,
  Pencil,
  type LucideIcon,
  UserRound,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getAgenciamentoImobiliariaLabel,
  getAgenciamentoOrigemLabel,
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

const checklistItems: Array<{
  key: keyof AgenciamentoChecklist;
  label: string;
  icon: LucideIcon;
}> = [
  { key: "fotosRealizadas", label: "Fotos", icon: Camera },
  { key: "fotosDrive", label: "Drive", icon: HardDrive },
  { key: "placaInstalada", label: "Placa", icon: MapPinned },
  { key: "cadastradoSite", label: "Site", icon: ClipboardCheck },
  { key: "videoRealizado", label: "Video", icon: Video },
  { key: "validado", label: "Validacao", icon: BadgeCheck },
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
  const agencyColor =
    agenciamento.imobiliaria === "morar"
      ? "var(--morar-primary)"
      : agenciamento.imobiliaria === "ambas"
        ? "var(--system-primary)"
        : "var(--cordial-primary)";
  const isValidated = agenciamento.status === "validado" || agenciamento.checklist.validado;

  const handlePointerMove = useCallback((event: PointerEvent<HTMLElement>) => {
    if (event.pointerType === "touch") return;
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    event.currentTarget.style.setProperty("--ag-card-tilt-x", `${(-y * 4).toFixed(2)}deg`);
    event.currentTarget.style.setProperty("--ag-card-tilt-y", `${(x * 5).toFixed(2)}deg`);
    event.currentTarget.style.setProperty("--ag-card-lift", "-4px");
  }, []);

  const reset = useCallback((event: PointerEvent<HTMLElement>) => {
    event.currentTarget.style.setProperty("--ag-card-tilt-x", "0deg");
    event.currentTarget.style.setProperty("--ag-card-tilt-y", "0deg");
    event.currentTarget.style.setProperty("--ag-card-lift", "0px");
    event.currentTarget.style.setProperty("--ag-card-scale", "1");
  }, []);

  const press = useCallback((event: PointerEvent<HTMLElement>) => {
    event.currentTarget.style.setProperty("--ag-card-scale", "0.988");
    event.currentTarget.style.setProperty("--ag-card-lift", "-1px");
  }, []);

  const release = useCallback((event: PointerEvent<HTMLElement>) => {
    event.currentTarget.style.setProperty("--ag-card-scale", "1");
    event.currentTarget.style.setProperty(
      "--ag-card-lift",
      event.pointerType === "touch" ? "0px" : "-4px",
    );
  }, []);

  return (
    <article
      onClick={() => onView(agenciamento)}
      onPointerMove={handlePointerMove}
      onPointerLeave={reset}
      onPointerDown={press}
      onPointerUp={release}
      className="group relative min-w-0 cursor-pointer overflow-hidden rounded-[1.65rem] p-4 text-left shadow-[0_20px_48px_-28px_rgba(23,27,33,0.42)] outline-none ring-1 ring-white/65 transition-[box-shadow,filter] duration-300 focus-visible:ring-2 focus-visible:ring-primary/35 sm:p-5"
      style={
        {
          "--ag-card-tilt-x": "0deg",
          "--ag-card-tilt-y": "0deg",
          "--ag-card-lift": "0px",
          "--ag-card-scale": "1",
          background:
            "linear-gradient(156deg, rgba(255,255,255,0.84) 0%, rgba(255,255,255,0.58) 58%, rgba(240,248,250,0.52) 100%)",
          border: "1px solid rgba(255,255,255,0.68)",
          transform:
            "perspective(900px) rotateX(var(--ag-card-tilt-x)) rotateY(var(--ag-card-tilt-y)) translateY(var(--ag-card-lift)) scale(var(--ag-card-scale))",
          transformStyle: "preserve-3d",
          transition:
            "transform 230ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 230ms ease, filter 230ms ease",
        } as CSSProperties
      }
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-5 top-0 h-px opacity-80"
        style={{ background: `linear-gradient(90deg, transparent, ${agencyColor}, transparent)` }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-14 size-40 rounded-full opacity-10 blur-2xl"
        style={{ background: agencyColor }}
      />

      <div
        className="relative z-10 flex items-start gap-3"
        style={{ transform: "translateZ(22px)" }}
      >
        <span
          className="grid size-12 shrink-0 place-items-center rounded-2xl text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.26),0_16px_30px_-22px_rgba(23,27,33,0.9)]"
          style={{ background: agencyColor }}
        >
          <ClipboardCheck className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="min-w-0 truncate text-base font-bold tracking-tight text-foreground">
              {getAgenciamentoTipoLabel(agenciamento.tipoImovel)} -{" "}
              {agenciamento.bairro || agenciamento.endereco}
            </h3>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] ring-1",
                statusTone === "success" &&
                  "bg-emerald-500/10 text-emerald-700 ring-emerald-500/15",
                statusTone === "warning" &&
                  "bg-[rgba(217,120,45,0.12)] text-[var(--system-accent-dark)] ring-[rgba(217,120,45,0.18)]",
                statusTone === "danger" && "bg-red-500/10 text-red-700 ring-red-500/15",
                statusTone === "neutral" && "bg-primary/10 text-primary ring-primary/10",
              )}
            >
              {getAgenciamentoStatusLabel(agenciamento.status)}
            </span>
          </div>
          <p className="mt-1 truncate text-[11px] font-medium text-foreground/50">
            {agenciamento.endereco} - {getAgenciamentoImobiliariaLabel(agenciamento.imobiliaria)}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <InfoPill icon={UserRound} label={agenciamento.corretorNome} />
            <InfoPill icon={CalendarDays} label={shortDate(agenciamento.dataAgenciamento)} />
            <InfoPill icon={Circle} label={getAgenciamentoOrigemLabel(agenciamento.origem)} />
          </div>
        </div>
      </div>

      <div
        className="relative z-10 mt-4 grid gap-2 sm:grid-cols-2"
        style={{ transform: "translateZ(16px)" }}
      >
        <div className="min-w-0 rounded-2xl bg-white/[0.58] p-3 ring-1 ring-white/60">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/42">
            Proprietario
          </p>
          <p className="mt-1 truncate text-sm font-semibold text-foreground">
            {agenciamento.proprietarioNome}
          </p>
          <p className="mt-0.5 truncate font-mono text-xs text-foreground/52">
            {agenciamento.proprietarioTelefone}
          </p>
        </div>

        <div className="min-w-0 rounded-2xl bg-white/[0.58] p-3 ring-1 ring-white/60">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/42">
              Checklist
            </p>
            <span className="font-mono text-xs font-black text-primary">
              {completed}/6 - {progress}%
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-foreground/[0.07]">
            <span
              className="block h-full rounded-full"
              style={{
                width: `${progress}%`,
                background: `linear-gradient(90deg, ${agencyColor}, var(--system-primary-light))`,
              }}
            />
          </div>
        </div>
      </div>

      <div
        className="relative z-10 mt-4 flex flex-wrap gap-1.5"
        style={{ transform: "translateZ(12px)" }}
      >
        {checklistItems.map((item) => {
          const Icon = item.icon;
          const done = agenciamento.checklist[item.key];
          return (
            <span
              key={item.key}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ring-1",
                done
                  ? "bg-emerald-500/10 text-emerald-700 ring-emerald-500/15"
                  : "bg-white/[0.62] text-foreground/45 ring-foreground/[0.06]",
              )}
            >
              <Icon className="size-3" />
              {item.label}
            </span>
          );
        })}
      </div>

      <div
        className="relative z-10 mt-4 flex flex-wrap items-center gap-2"
        style={{ transform: "translateZ(10px)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="rounded-2xl border-white/[0.65] bg-white/[0.58]"
          onClick={() => onView(agenciamento)}
        >
          <Eye className="size-4" />
          Detalhes
        </Button>
        {canEdit && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-2xl border-white/[0.65] bg-white/[0.58]"
            onClick={() => onEdit(agenciamento)}
          >
            <Pencil className="size-4" />
            Editar
          </Button>
        )}
        {canManage && !isValidated && (
          <Button
            type="button"
            size="sm"
            className="rounded-2xl bg-primary text-white"
            onClick={() => onValidate(agenciamento)}
          >
            <CheckCircle2 className="size-4" />
            Validar
          </Button>
        )}
        {agenciamento.driveFolderUrl && (
          <Button asChild size="sm" variant="ghost" className="rounded-2xl text-primary">
            <a href={agenciamento.driveFolderUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="size-4" />
              Drive
            </a>
          </Button>
        )}
        {agenciamento.siteUrl && (
          <Button asChild size="sm" variant="ghost" className="rounded-2xl text-primary">
            <a href={agenciamento.siteUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="size-4" />
              Site
            </a>
          </Button>
        )}
      </div>
    </article>
  );
}

function InfoPill({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-white/65 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-foreground/50 ring-1 ring-foreground/5">
      <Icon className="size-3" />
      <span className="truncate">{label}</span>
    </span>
  );
}

export const AgenciamentoCard = memo(AgenciamentoCardComponent);
