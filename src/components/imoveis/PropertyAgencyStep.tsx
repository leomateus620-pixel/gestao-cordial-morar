import { useEffect, useMemo } from "react";
import { Building2, ClipboardCheck, Pencil, User2 } from "lucide-react";
import { AgencyChecklist, type ProviderChecklistState } from "@/components/agenciamentos/AgencyChecklist";
import {
  bonusPendingItems,
  checklistProgress,
  type ChecklistKey,
} from "@/lib/agenciamentos/checklist";
import { providersToImobiliaria } from "@/lib/agenciamentos/property-link.functions";
import type { PropertyFormValues } from "@/components/imoveis/PropertyForm";
import type {
  AgenciamentoChecklist,
  AgenciamentoFinalidade,
} from "@/types/agenciamento";
import type { PropertyCarteira } from "@/types/property";

export type AgencyStepState = {
  enabled: boolean;
  finalidade: AgenciamentoFinalidade;
  checklist: AgenciamentoChecklist;
  descricao: string;
  /** Enquanto false, a classificação acompanha a operação escolhida na Etapa 1. */
  finalidadeTouched?: boolean;
};

export function emptyAgencyStepState(operacao: "venda" | "aluguel"): AgencyStepState {
  return {
    enabled: true,
    finalidade: operacao === "aluguel" ? "aluguel" : "venda",
    checklist: {
      fotosHorizontal: false,
      fotosVertical: false,
      fotosDrive: false,
      placaInstalada: false,
      cadastradoMorar: false,
      cadastradoCordial: false,
      videoRealizado: false,
      validado: false,
    },
    descricao: "",
  };
}

export function PropertyAgencyStep({
  values,
  destinos,
  state,
  onChange,
  onEditStep,
  canRegister,
  corretorNome,
  fotosProntas,
  providerStates,
  linkedId,
}: {
  values: PropertyFormValues;
  destinos: PropertyCarteira[];
  state: AgencyStepState;
  onChange: (next: AgencyStepState) => void;
  onEditStep: (step: number) => void;
  canRegister: boolean;
  corretorNome: string;
  fotosProntas: number;
  providerStates?: Partial<Record<"cordial" | "morar", ProviderChecklistState>>;
  linkedId?: string | null;
}) {
  const imobiliaria = useMemo(
    () => providersToImobiliaria(destinos, values.carteira),
    [destinos, values.carteira],
  );
  const progress = useMemo(
    () => checklistProgress(state.checklist, imobiliaria),
    [state.checklist, imobiliaria],
  );
  const bonusPending = useMemo(() => bonusPendingItems(state.checklist), [state.checklist]);

  // Espelha a operação do imóvel enquanto o usuário não corrigir manualmente.
  const operacaoFinalidade: AgenciamentoFinalidade =
    values.operacao === "aluguel" ? "aluguel" : "venda";
  useEffect(() => {
    if (state.finalidadeTouched || state.finalidade === operacaoFinalidade) return;
    onChange({ ...state, finalidade: operacaoFinalidade });
  }, [operacaoFinalidade, state, onChange]);

  function toggle(key: ChecklistKey, value: boolean) {
    onChange({ ...state, checklist: { ...state.checklist, [key]: value } });
  }

  const endereco =
    [values.logradouro, values.numero].filter(Boolean).join(", ") || "Endereço não informado";

  return (
    <div className="space-y-4">
      <label className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/[0.06] px-4 py-3">
        <input
          type="checkbox"
          checked={state.enabled && canRegister}
          disabled={!canRegister}
          onChange={(e) => onChange({ ...state, enabled: e.target.checked })}
          className="mt-0.5 size-5 shrink-0 accent-[hsl(var(--primary))]"
        />
        <span>
          <span className="block text-sm font-bold text-foreground">
            Registrar também o agenciamento deste imóvel
          </span>
          <span className="block text-[12px] leading-snug text-foreground/60">
            {canRegister
              ? "Cria a captação no menu Agenciamentos sem preencher tudo de novo."
              : "Seu perfil não registra agenciamentos. O imóvel será salvo normalmente."}
          </span>
        </span>
      </label>

      {state.enabled && canRegister ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
            <header className="flex items-center gap-2 text-sm font-bold text-foreground">
              <Building2 className="size-4 text-primary" /> Resumo do agenciamento
            </header>
            <dl className="space-y-2 text-[12px]">
              <SummaryRow label="Imóvel" value={`${values.tipo ?? "—"}${values.codigo ? ` · ${values.codigo}` : ""}`} onEdit={() => onEditStep(0)} />
              <SummaryRow
                label="Localização"
                value={`${endereco}${values.bairro ? ` · ${values.bairro}` : ""} · ${values.cidade ?? ""}/${values.uf ?? ""}`}
                onEdit={() => onEditStep(1)}
              />
              <SummaryRow
                label="Proprietário"
                value={values.proprietarioNome ? `${values.proprietarioNome}${values.proprietarioTelefone ? ` · ${values.proprietarioTelefone}` : ""}` : "Não informado"}
                onEdit={() => onEditStep(0)}
              />
              <SummaryRow label="Destinos" value={destinos.length ? destinos.map(labelProvider).join(" + ") : "Nenhum destino selecionado"} onEdit={() => onEditStep(0)} />
              <SummaryRow label="Fotos prontas" value={`${fotosProntas} foto(s) com marca aplicada`} onEdit={() => onEditStep(5)} />
            </dl>

            <div className="flex items-center gap-2 rounded-xl bg-foreground/[0.04] px-3 py-2 text-[12px] text-foreground/70">
              <User2 className="size-3.5" />
              Responsável: <strong className="font-semibold text-foreground">{corretorNome}</strong>
            </div>

            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-foreground/50">
                Classificação da bonificação
              </span>
              <select
                value={state.finalidade}
                onChange={(e) =>
                  onChange({
                    ...state,
                    finalidade: e.target.value as AgenciamentoFinalidade,
                    finalidadeTouched: true,
                  })
                }
                className="w-full rounded-2xl border border-white/60 bg-white/70 px-3 py-2 text-sm outline-none"
              >
                <option value="venda">Venda</option>
                <option value="aluguel">Aluguel</option>
              </select>
              <span className="mt-1 block text-[10px] text-foreground/45">
                Vem da operação do imóvel e pode ser corrigida depois no menu Agenciamentos.
              </span>
            </label>
          </section>

          <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
            <header className="flex items-center justify-between gap-2 text-sm font-bold text-foreground">
              <span className="flex items-center gap-2">
                <ClipboardCheck className="size-4 text-primary" /> Checklist operacional
              </span>
              <span className="text-xs font-extrabold tabular-nums text-primary">
                {progress.completed}/{progress.applicable} · {progress.percent}%
              </span>
            </header>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <span
                className="block h-full origin-left rounded-full bg-primary transition-transform"
                style={{ transform: `scaleX(${progress.percent / 100})` }}
              />
            </div>

            <AgencyChecklist
              checklist={state.checklist}
              imobiliaria={imobiliaria}
              onToggle={toggle}
              providerStates={providerStates ?? { cordial: "pending", morar: "pending" }}
            />

            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-foreground/50">
                Descrição do agenciamento
              </span>
              <textarea
                value={state.descricao}
                maxLength={800}
                rows={3}
                onChange={(e) => onChange({ ...state, descricao: e.target.value })}
                placeholder="Combinados com o proprietário, pendências de fotos, placa ou publicação."
                className="w-full rounded-2xl border border-white/60 bg-white/70 px-3 py-2 text-sm outline-none"
              />
              <span className="mt-1 block text-right text-[10px] text-foreground/45">
                {state.descricao.length}/800
              </span>
            </label>

            <p className="rounded-xl bg-foreground/[0.04] px-3 py-2 text-[12px] leading-snug text-foreground/70">
              {bonusPending.length === 0
                ? "Com os dados atuais, o agenciamento entra completo para o cálculo de bonificação."
                : `Com os dados atuais, o agenciamento ficará pendente por ${bonusPending.length} item(ns): ${bonusPending
                    .map((item) => item.label)
                    .join(", ")}.`}
            </p>
            {linkedId ? (
              <p className="text-[11px] text-foreground/50">
                Já existe um agenciamento vinculado a este imóvel; ele será atualizado, sem duplicar.
              </p>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}

function labelProvider(provider: PropertyCarteira): string {
  return provider === "morar" ? "Morar" : "Cordial";
}

function SummaryRow({
  label,
  value,
  onEdit,
}: {
  label: string;
  value: string;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <dt className="text-[10px] font-semibold uppercase tracking-wide text-foreground/45">{label}</dt>
        <dd className="truncate text-foreground/80">{value}</dd>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-foreground/[0.05] px-2.5 py-1 text-[10px] font-semibold text-foreground/60"
      >
        <Pencil className="size-3" /> Editar
      </button>
    </div>
  );
}
