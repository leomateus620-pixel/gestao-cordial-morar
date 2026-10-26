import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { createCampaign } from "@/lib/marketing/marketing.functions";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { marketingChannels, marketingObjectives, marketingStatuses } from "@/services/marketing";
import type {
  MarketingAgencyId,
  MarketingCampaign,
  MarketingCampaignStatus,
  MarketingChannel,
  MarketingObjective,
} from "@/types/marketing";

type CampaignCreateDrawerProps = {
  open: boolean;
  agency: MarketingAgencyId;
  onOpenChange: (open: boolean) => void;
  onCreate: (campaign: MarketingCampaign) => void;
  onRestoreFocus?: () => void;
  canViewFinancialInsights?: boolean;
};

type CampaignFormState = {
  name: string;
  channel: MarketingChannel;
  objective: MarketingObjective;
  status: MarketingCampaignStatus;
  startDate: string;
  endDate: string;
  investment: string;
  targetRegion: string;
  responsiblePerson: string;
  expectedLeads: string;
  referenceUrl: string;
  notes: string;
};

export function CampaignCreateDrawer({
  open,
  agency,
  onOpenChange,
  onCreate,
  onRestoreFocus,
  canViewFinancialInsights = true,
}: CampaignCreateDrawerProps) {
  const save = useServerFn(createCampaign);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CampaignFormState>(() => createInitialForm());

  useEffect(() => {
    if (!open) return;
    const today = todayInput();
    setForm((current) => ({
      ...current,
      startDate: current.startDate || today,
      endDate: current.endDate || today,
    }));
  }, [open]);

  function update<K extends keyof CampaignFormState>(key: K, value: CampaignFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const campaign = await save({
        data: {
          imobiliaria: agency,
          nome: form.name,
          canal: form.channel,
          objetivo: form.objective,
          status: form.status,
          dataInicio: form.startDate || todayInput(),
          dataFim: form.endDate || form.startDate || todayInput(),
          investimento: canViewFinancialInsights ? Number(form.investment || 0) : 0,
          observacoes: [form.notes, form.targetRegion ? `Região alvo: ${form.targetRegion}` : ""]
            .filter(Boolean)
            .join("\n"),
          responsavel: form.responsiblePerson,
          leadsEsperados: Number(form.expectedLeads || 0) || null,
          referenciaUrl: form.referenceUrl,
        },
      });
      onCreate(campaign);
      toast.success("Campanha cadastrada.");
      setForm(createInitialForm());
      onOpenChange(false);
    } catch {
      toast.error("Não foi possível salvar a campanha. Confira os campos e tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        closeLabel="Fechar"
        onCloseAutoFocus={(event) => {
          if (onRestoreFocus) {
            event.preventDefault();
            onRestoreFocus();
          }
        }}
        side="right"
        className="flex h-full w-full max-w-full flex-col overflow-y-auto overscroll-contain border-white/60 bg-[rgba(251,248,244,0.96)] p-0 backdrop-blur-2xl sm:max-w-[42rem]"
      >
        <form
          onSubmit={handleSubmit}
          className="flex min-h-full flex-col p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-6"
        >
          <SheetHeader className="text-left">
            <SheetTitle className="text-2xl font-black tracking-tight">
              Cadastrar campanha
            </SheetTitle>
            <SheetDescription className="text-sm leading-relaxed text-foreground/58">
              {canViewFinancialInsights
                ? "Registre a origem, objetivo, período e investimento da campanha imobiliária."
                : "Registre a origem, objetivo, período e responsável pela campanha imobiliária."}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Field label="Nome da campanha" className="sm:col-span-2">
              <input
                value={form.name}
                onChange={(event) => update("name", event.target.value)}
                placeholder="Ex.: Instagram - imóveis alto padrão"
                className={inputClassName}
                required
              />
            </Field>

            <Field label="Canal">
              <select
                value={form.channel}
                onChange={(event) => update("channel", event.target.value as MarketingChannel)}
                className={inputClassName}
              >
                {marketingChannels.map((channel) => (
                  <option key={channel} value={channel}>
                    {channel}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Objetivo">
              <select
                value={form.objective}
                onChange={(event) => update("objective", event.target.value as MarketingObjective)}
                className={inputClassName}
              >
                {marketingObjectives.map((objective) => (
                  <option key={objective} value={objective}>
                    {objective}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Status">
              <select
                value={form.status}
                onChange={(event) =>
                  update("status", event.target.value as MarketingCampaignStatus)
                }
                className={inputClassName}
              >
                {marketingStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Região alvo">
              <input
                value={form.targetRegion}
                onChange={(event) => update("targetRegion", event.target.value)}
                placeholder="Ex.: Jardins"
                className={inputClassName}
              />
            </Field>

            <Field label="Data inicial">
              <input
                type="date"
                value={form.startDate}
                onChange={(event) => update("startDate", event.target.value)}
                className={inputClassName}
              />
            </Field>

            <Field label="Data final">
              <input
                type="date"
                value={form.endDate}
                onChange={(event) => update("endDate", event.target.value)}
                className={inputClassName}
              />
            </Field>

            {canViewFinancialInsights && (
              <Field label="Investimento">
                <input
                  type="number"
                  min="0"
                  step="50"
                  value={form.investment}
                  onChange={(event) => update("investment", event.target.value)}
                  placeholder="0"
                  className={inputClassName}
                />
              </Field>
            )}

            <Field label="Leads esperados">
              <input
                type="number"
                min="0"
                step="1"
                value={form.expectedLeads}
                onChange={(event) => update("expectedLeads", event.target.value)}
                placeholder="25"
                className={inputClassName}
              />
            </Field>

            <Field label="Responsável">
              <input
                value={form.responsiblePerson}
                onChange={(event) => update("responsiblePerson", event.target.value)}
                placeholder="Equipe comercial"
                className={inputClassName}
              />
            </Field>

            <Field label="Link ou referência">
              <input
                value={form.referenceUrl}
                onChange={(event) => update("referenceUrl", event.target.value)}
                placeholder="https://"
                className={inputClassName}
              />
            </Field>

            <Field label="Observações" className="sm:col-span-2">
              <textarea
                value={form.notes}
                onChange={(event) => update("notes", event.target.value)}
                placeholder="Anote público, criativo, oferta ou hipótese da campanha."
                rows={4}
                className={`${inputClassName} min-h-28 resize-none py-3`}
              />
            </Field>
          </div>

          <div className="mt-6 flex flex-col gap-2 border-t border-white/65 pt-4 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="min-h-11 rounded-2xl border-white/70 bg-white/58"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="min-h-11 rounded-2xl bg-primary text-white"
            >
              <Plus className="size-4" />
              {saving ? "Salvando…" : "Cadastrar campanha"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={className}>
      <span className="mb-1.5 block text-[11px] font-bold text-foreground/52">{label}</span>
      {children}
    </label>
  );
}

function createInitialForm(): CampaignFormState {
  return {
    name: "",
    channel: "Instagram",
    objective: "Leads qualificados",
    status: "Planejada",
    startDate: "",
    endDate: "",
    investment: "",
    targetRegion: "",
    responsiblePerson: "",
    expectedLeads: "",
    referenceUrl: "",
    notes: "",
  };
}

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

const inputClassName =
  "min-h-11 w-full min-w-0 rounded-2xl border border-white/70 bg-white/62 px-3 text-sm font-semibold text-foreground outline-none transition placeholder:text-foreground/34 focus:border-primary/35 focus:ring-2 focus:ring-primary/15";
