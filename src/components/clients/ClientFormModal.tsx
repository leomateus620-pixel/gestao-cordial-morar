import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Check, ChevronRight, X } from "lucide-react";
import {
  bedroomOptions,
  brokerOptions,
  clientPurposeOptions,
  clientStatusOptions,
  clientTypeOptions,
  contactPreferenceOptions,
  leadOriginOptions,
  propertyTypeOptions,
  realEstateBrandOptions,
  type BedroomOption,
  type ClientCreateInput,
  type ClientPurpose,
  type ClientStatus,
  type ClientType,
  type ContactPreference,
  type LeadOrigin,
  type PropertyType,
  type RealEstateBrand,
} from "@/types/client";
import {
  formatCurrencyBR,
  formatPhoneBR,
  parseCurrencyBR,
  validateClientInput,
  type ClientValidationResult,
} from "@/services/clients";
import { cn } from "@/lib/utils";

type FormState = {
  fullName: string;
  phone: string;
  email: string;
  clientType: ClientType;
  contactPreference: ContactPreference;
  leadOrigin: LeadOrigin;
  brand: RealEstateBrand;
  assignedBrokerId: string;
  customBrokerName: string;
  status: ClientStatus;
  purpose: ClientPurpose;
  propertyType: PropertyType;
  bedrooms: BedroomOption;
  neighborhood: string;
  minBudget: string;
  maxBudget: string;
  document: string;
  approximateIncome: string;
  profession: string;
  notes: string;
  restrictions: string;
  nextStep: string;
  nextFollowUpAt: string;
};

const initialForm: FormState = {
  fullName: "",
  phone: "",
  email: "",
  clientType: "comprador",
  contactPreference: "whatsapp",
  leadOrigin: "whatsapp",
  brand: "cordial",
  assignedBrokerId: "ricardo",
  customBrokerName: "",
  status: "novo",
  purpose: "compra",
  propertyType: "apartamento",
  bedrooms: "nao_aplica",
  neighborhood: "",
  minBudget: "",
  maxBudget: "",
  document: "",
  approximateIncome: "",
  profession: "",
  notes: "",
  restrictions: "",
  nextStep: "",
  nextFollowUpAt: "",
};

const sections = ["Identificação", "Origem e vínculo", "Interesse", "Complementares"] as const;

export function ClientFormModal({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (client: ClientCreateInput) => void | Promise<void>;
}) {
  const [form, setForm] = useState<FormState>(initialForm);
  const [validation, setValidation] = useState<ClientValidationResult["errors"]>({});
  const [saving, setSaving] = useState(false);
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<number | null>(null);

  const brokerName = useMemo(() => {
    if (form.assignedBrokerId === "outro") return form.customBrokerName.trim() || "Outro";
    return brokerOptions.find((broker) => broker.id === form.assignedBrokerId)?.label;
  }, [form.assignedBrokerId, form.customBrokerName]);

  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      onOpenChange(false);
    }, 160);
  }, [closing, onOpenChange]);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      return;
    }
    if (!mounted) return;
    // External close — play exit animation then unmount.
    setClosing(true);
    const t = window.setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, 160);
    return () => window.clearTimeout(t);
  }, [open, mounted]);

  useEffect(() => {
    return () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!mounted || typeof document === "undefined") return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
    };

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [mounted, requestClose]);

  if (!mounted) return null;

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    if (validation[key as keyof ClientCreateInput]) {
      setValidation((current) => ({ ...current, [key]: undefined }));
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;

    const input: ClientCreateInput = {
      fullName: form.fullName,
      phone: form.phone,
      email: optional(form.email),
      clientType: form.clientType,
      contactPreference: form.contactPreference,
      leadOrigin: form.leadOrigin,
      brand: form.brand,
      assignedBrokerId: optional(form.assignedBrokerId),
      assignedBrokerName: brokerName,
      purpose: form.purpose,
      propertyType: form.propertyType,
      bedrooms: form.bedrooms,
      neighborhood: optional(form.neighborhood),
      minBudget: parseCurrencyBR(form.minBudget),
      maxBudget: parseCurrencyBR(form.maxBudget),
      approximateIncome: parseCurrencyBR(form.approximateIncome),
      document: optional(form.document),
      profession: optional(form.profession),
      notes: optional(form.notes),
      restrictions: optional(form.restrictions),
      nextStep: optional(form.nextStep),
      nextFollowUpAt: optional(form.nextFollowUpAt),
      status: form.status,
    };

    const result = validateClientInput(input);
    setValidation(result.errors);

    if (!result.ok) return;

    setSaving(true);
    try {
      await onSubmit(input);
      setForm(initialForm);
      setValidation({});
      requestClose();
    } catch {
      // erro já comunicado pelo chamador via toast; manter formulário aberto
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={cn(
        "client-modal-backdrop fixed inset-0 z-50 flex items-end justify-center bg-stone-950/45 p-0 sm:items-center sm:p-6 sm:bg-stone-950/30 sm:backdrop-blur-sm",
        closing && "client-modal-backdrop--closing",
      )}
    >
      <button
        type="button"
        aria-label="Fechar cadastro"
        className="absolute inset-0 cursor-default"
        onClick={requestClose}
      />

      <form
        onSubmit={submit}
        className={cn(
          "client-form-modal relative flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-[2rem] border border-white/65 bg-background shadow-2xl shadow-stone-950/25 sm:max-h-[88vh] sm:max-w-[920px] sm:rounded-[2rem]",
          closing && "client-form-modal--closing",
        )}
      >
        <header className="border-b border-white/55 bg-white/55 px-5 py-3 sm:px-6 sm:py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-teal-800/70">
                <span className="size-2 rounded-full bg-amber-400 shadow-[0_0_18px_rgba(251,191,36,0.65)]" />
                Cadastro inteligente
              </div>
              <h2 className="mt-1 text-lg font-semibold tracking-tight sm:text-xl">Novo cliente</h2>
              <p className="mt-1 hidden max-w-2xl text-xs leading-5 text-foreground/58 sm:block">
                Preencha o essencial agora e deixe dados opcionais prontos para enriquecer
                relatórios futuros.
              </p>
            </div>
            <button
              type="button"
              aria-label="Fechar"
              onClick={requestClose}
              className="grid size-10 shrink-0 place-items-center rounded-full bg-white/65 text-foreground/65 shadow-sm transition hover:text-foreground active:scale-95"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto sm:mt-4">
            {sections.map((section, index) => (
              <span
                key={section}
                className="flex shrink-0 items-center gap-2 rounded-full bg-white/58 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-foreground/58"
              >
                <span className="grid size-5 place-items-center rounded-full bg-teal-700 text-[9px] text-white">
                  {index + 1}
                </span>
                {section}
              </span>
            ))}
          </div>
        </header>

        <div className="no-scrollbar flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {validation.budget && (
            <div className="mb-4 rounded-2xl border border-destructive/20 bg-destructive/8 px-4 py-3 text-xs font-medium text-destructive">
              {validation.budget}
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <FormSection
              step="1"
              title="Identificação"
              description="Dados de contato e perfil inicial do cliente."
            >
              <Field label="Nome completo" error={validation.fullName}>
                <input
                  value={form.fullName}
                  onChange={(event) => update("fullName", event.target.value)}
                  className={inputClass(validation.fullName)}
                  autoComplete="name"
                  required
                />
              </Field>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Telefone" error={validation.phone}>
                  <input
                    value={form.phone}
                    onChange={(event) => update("phone", formatPhoneBR(event.target.value))}
                    className={inputClass(validation.phone)}
                    inputMode="tel"
                    placeholder="(11) 99999-9999"
                    required
                  />
                </Field>
                <Field label="E-mail" error={validation.email}>
                  <input
                    value={form.email}
                    onChange={(event) => update("email", event.target.value)}
                    className={inputClass(validation.email)}
                    inputMode="email"
                    placeholder="opcional"
                  />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Tipo de cliente" error={validation.clientType}>
                  <Select
                    value={form.clientType}
                    onChange={(value) => update("clientType", value as ClientType)}
                    options={clientTypeOptions}
                  />
                </Field>
                <Field label="Contato preferencial">
                  <Select
                    value={form.contactPreference}
                    onChange={(value) => update("contactPreference", value as ContactPreference)}
                    options={contactPreferenceOptions}
                  />
                </Field>
              </div>
            </FormSection>

            <FormSection
              step="2"
              title="Origem e vínculo comercial"
              description="Quem trouxe o lead, por qual marca e com qual status."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Origem do lead" error={validation.leadOrigin}>
                  <Select
                    value={form.leadOrigin}
                    onChange={(value) => update("leadOrigin", value as LeadOrigin)}
                    options={leadOriginOptions}
                  />
                </Field>
                <Field label="Imobiliária" error={validation.brand}>
                  <Select
                    value={form.brand}
                    onChange={(value) => update("brand", value as RealEstateBrand)}
                    options={realEstateBrandOptions}
                  />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Corretor responsável">
                  <select
                    value={form.assignedBrokerId}
                    onChange={(event) => update("assignedBrokerId", event.target.value)}
                    className={inputClass()}
                  >
                    {brokerOptions.map((broker) => (
                      <option key={broker.id} value={broker.id}>
                        {broker.label}
                      </option>
                    ))}
                  </select>
                </Field>
                {form.assignedBrokerId === "outro" ? (
                  <Field label="Nome do corretor">
                    <input
                      value={form.customBrokerName}
                      onChange={(event) => update("customBrokerName", event.target.value)}
                      className={inputClass()}
                      placeholder="Nome"
                    />
                  </Field>
                ) : (
                  <Field label="Status atual" error={validation.status}>
                    <Select
                      value={form.status}
                      onChange={(value) => update("status", value as ClientStatus)}
                      options={clientStatusOptions}
                    />
                  </Field>
                )}
              </div>

              {form.assignedBrokerId === "outro" && (
                <Field label="Status atual" error={validation.status}>
                  <Select
                    value={form.status}
                    onChange={(value) => update("status", value as ClientStatus)}
                    options={clientStatusOptions}
                  />
                </Field>
              )}
            </FormSection>

            <FormSection
              step="3"
              title="Interesse do cliente"
              description="Campos estruturados para relatórios de nicho, valor e demanda."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Finalidade" error={validation.purpose}>
                  <Select
                    value={form.purpose}
                    onChange={(value) => update("purpose", value as ClientPurpose)}
                    options={clientPurposeOptions}
                  />
                </Field>
                <Field label="Tipo de imóvel" error={validation.propertyType}>
                  <Select
                    value={form.propertyType}
                    onChange={(value) => update("propertyType", value as PropertyType)}
                    options={propertyTypeOptions}
                  />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Dormitórios">
                  <Select
                    value={form.bedrooms}
                    onChange={(value) => update("bedrooms", value as BedroomOption)}
                    options={bedroomOptions}
                  />
                </Field>
                <Field label="Região/Bairro">
                  <input
                    value={form.neighborhood}
                    onChange={(event) => update("neighborhood", event.target.value)}
                    className={inputClass()}
                    placeholder="Centro, Cruzeiro..."
                  />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Orçamento mínimo">
                  <input
                    value={form.minBudget}
                    onChange={(event) => update("minBudget", formatCurrencyBR(event.target.value))}
                    className={inputClass()}
                    inputMode="numeric"
                    placeholder={form.purpose === "aluguel" ? "Valor mensal" : "Valor total"}
                  />
                </Field>
                <Field label="Orçamento máximo">
                  <input
                    value={form.maxBudget}
                    onChange={(event) => update("maxBudget", formatCurrencyBR(event.target.value))}
                    className={inputClass()}
                    inputMode="numeric"
                    placeholder={form.purpose === "aluguel" ? "Valor mensal" : "Valor total"}
                  />
                </Field>
              </div>
            </FormSection>

            <FormSection
              step="4"
              title="Dados complementares"
              description="Opcional: nada aqui trava o cadastro inicial."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="CPF/CNPJ">
                  <input
                    value={form.document}
                    onChange={(event) => update("document", event.target.value)}
                    className={inputClass()}
                    placeholder="Opcional"
                  />
                </Field>
                <Field label="Renda aproximada">
                  <input
                    value={form.approximateIncome}
                    onChange={(event) =>
                      update("approximateIncome", formatCurrencyBR(event.target.value))
                    }
                    className={inputClass()}
                    inputMode="numeric"
                    placeholder="Opcional"
                  />
                </Field>
              </div>

              <Field label="Profissão">
                <input
                  value={form.profession}
                  onChange={(event) => update("profession", event.target.value)}
                  className={inputClass()}
                  placeholder="Opcional"
                />
              </Field>

              <Field label="Observações / interesse complementar">
                <textarea
                  value={form.notes}
                  onChange={(event) => update("notes", event.target.value)}
                  className={cn(inputClass(), "min-h-24 resize-none leading-5")}
                  placeholder="Detalhes que ainda não viraram campo estruturado."
                />
              </Field>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Restrições">
                  <input
                    value={form.restrictions}
                    onChange={(event) => update("restrictions", event.target.value)}
                    className={inputClass()}
                    placeholder="Opcional"
                  />
                </Field>
                <Field label="Próximo retorno">
                  <input
                    type="date"
                    value={form.nextFollowUpAt}
                    onChange={(event) => update("nextFollowUpAt", event.target.value)}
                    className={inputClass()}
                  />
                </Field>
              </div>

              <Field label="Próximo passo">
                <input
                  value={form.nextStep}
                  onChange={(event) => update("nextStep", event.target.value)}
                  className={inputClass()}
                  placeholder="Enviar opções, agendar visita..."
                />
              </Field>
            </FormSection>
          </div>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-white/60 bg-white/55 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
          <button
            type="button"
            onClick={requestClose}
            className="rounded-2xl bg-white/70 px-4 py-3 text-sm font-semibold text-foreground/70 shadow-sm transition hover:text-foreground active:scale-[0.98]"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 rounded-2xl bg-teal-700 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-teal-900/20 transition hover:bg-teal-800 active:scale-[0.98] disabled:opacity-70"
          >
            {saving ? "Salvando..." : "Salvar cadastro"}
            {saving ? null : <ChevronRight className="size-4" />}
          </button>
        </footer>
      </form>
    </div>
  );
}

function FormSection({
  step,
  title,
  description,
  children,
}: {
  step: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-white/55 bg-white/38 p-4 shadow-sm shadow-stone-950/5">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-2xl bg-teal-700 text-xs font-bold text-white shadow-md shadow-teal-900/15">
          {step}
        </span>
        <div>
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
          <p className="mt-0.5 text-[11px] leading-5 text-foreground/52">{description}</p>
        </div>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-foreground/52">
        {label}
        {error && <span className="normal-case tracking-normal text-destructive">{error}</span>}
      </span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function Select<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: string) => void;
  options: readonly { value: T; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={inputClass()}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function inputClass(error?: string) {
  return cn(
    "w-full rounded-2xl border bg-white/70 px-3 py-3 text-sm text-foreground outline-none transition",
    "placeholder:text-foreground/35 focus:border-teal-700/45 focus:ring-4 focus:ring-teal-700/10",
    error ? "border-destructive/35" : "border-white/65",
  );
}

function optional(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}
