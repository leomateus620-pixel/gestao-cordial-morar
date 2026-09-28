import { Camera, Check, Globe2, HardDrive, Loader2, Signpost, Video, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { PlacaPhotoDialog } from "@/components/agenciamentos/PlacaPhotoDialog";
import {
  CHECKLIST_ITEMS,
  isChecklistItemApplicable,
  type ChecklistItemDefinition,
  type ChecklistKey,
} from "@/lib/agenciamentos/checklist";
import type { AgenciamentoChecklist, AgenciamentoImobiliaria } from "@/types/agenciamento";

export const CHECKLIST_ICONS: Record<ChecklistItemDefinition["icon"], LucideIcon> = {
  camera: Camera,
  drive: HardDrive,
  sign: Signpost,
  globe: Globe2,
  video: Video,
};

export type ProviderChecklistState = "pending" | "syncing" | "published" | "error";

/**
 * Checklist operacional compartilhada entre o modal do menu Agenciamentos e a
 * Etapa 7 do cadastro de imóveis. Fonte única dos itens e das regras de exibição.
 */
export function AgencyChecklist({
  checklist,
  imobiliaria,
  onToggle,
  providerStates,
  disabled,
  onPlacaPhoto,
  placaPreviewUrl,
}: {
  checklist: AgenciamentoChecklist;
  imobiliaria: AgenciamentoImobiliaria;
  onToggle: (key: ChecklistKey, value: boolean) => void;
  /** Estado real da publicação por provedor; presente só no fluxo do imóvel. */
  providerStates?: Partial<Record<"cordial" | "morar", ProviderChecklistState>>;
  disabled?: boolean;
  /** Quando presente, marcar a placa exige foto (abre o campo obrigatório). */
  onPlacaPhoto?: (file: File) => void;
  placaPreviewUrl?: string | null;
}) {
  const [placaDialog, setPlacaDialog] = useState(false);
  return (
    <div className="grid gap-2">
      {onPlacaPhoto && (
        <PlacaPhotoDialog
          open={placaDialog}
          onCancel={() => setPlacaDialog(false)}
          onConfirm={(file) => {
            setPlacaDialog(false);
            onPlacaPhoto(file);
          }}
        />
      )}
      {CHECKLIST_ITEMS.map((item) => {
        const applicable = isChecklistItemApplicable(item, imobiliaria);
        const Icon = CHECKLIST_ICONS[item.icon];
        const checked = Boolean(checklist[item.key]);
        const providerState = item.systemManaged ? providerStates?.[item.systemManaged] : undefined;
        // Itens de site só podem ser marcados à mão quando não há integração ativa.
        const systemLocked = Boolean(item.systemManaged && providerStates);
        const locked = disabled || !applicable || systemLocked;

        return (
          <div
            key={item.key}
            className={cn(
              "flex items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition",
              !applicable
                ? "border-dashed border-border bg-muted/40 opacity-60"
                : checked
                  ? "border-primary/30 bg-primary/10"
                  : "border-border bg-card",
            )}
          >
            <Icon className={cn("size-4 shrink-0", checked ? "text-primary" : "text-muted-foreground")} />
            {item.key === "placaInstalada" && onPlacaPhoto && checked && placaPreviewUrl ? (
              <button
                type="button"
                onClick={() => setPlacaDialog(true)}
                disabled={locked}
                title="Trocar foto da placa"
                className="size-11 shrink-0 overflow-hidden rounded-xl border border-primary/30"
              >
                <img src={placaPreviewUrl} alt="Foto da placa" className="size-full object-cover" />
              </button>
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">{item.label}</p>
              <p className="text-[11px] leading-snug text-muted-foreground">
                {!applicable
                  ? "Não se aplica — site fora dos destinos escolhidos."
                  : providerState
                    ? providerLabel(providerState)
                    : item.key === "placaInstalada" && onPlacaPhoto
                      ? checked
                        ? placaPreviewUrl
                          ? "Foto da placa anexada. Toque na miniatura para trocar."
                          : "Sem foto da placa — desmarque e marque de novo para anexar."
                        : "Obrigatório anexar uma foto da placa instalada."
                      : item.helper}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={checked}
              aria-label={item.label}
              disabled={locked}
              onClick={() => {
                if (item.key === "placaInstalada" && onPlacaPhoto && !checked) {
                  setPlacaDialog(true);
                  return;
                }
                onToggle(item.key, !checked);
              }}
              className={cn(
                "grid size-11 shrink-0 place-items-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-60",
                checked ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background",
              )}
            >
              {providerState === "syncing" && !checked ? (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              ) : checked ? (
                <Check className="size-4" />
              ) : null}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function providerLabel(state: ProviderChecklistState): string {
  switch (state) {
    case "published":
      return "Publicação confirmada pelo site.";
    case "syncing":
      return "Sincronizando com o site…";
    case "error":
      return "Publicação com erro — reenvie pela ficha do imóvel.";
    default:
      return "Aguardando publicação. Marcado automaticamente na confirmação.";
  }
}
