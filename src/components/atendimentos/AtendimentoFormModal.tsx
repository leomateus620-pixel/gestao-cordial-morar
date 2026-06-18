import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ChevronRight, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useApp } from "@/store/app-store";
import {
  formatCurrencyBR,
  formatPhoneBR,
  parseCurrencyBR,
  validateAtendimentoInput,
  type AtendimentoValidationResult,
} from "@/services/atendimentos";
import {
  atendimentoBrokerOptions,
  atendimentoContatoOptions,
  atendimentoDormitoriosOptions,
  atendimentoFinalidadeOptions,
  atendimentoImobiliariaOptions,
  atendimentoOrigemOptions,
  atendimentoPrioridadeOptions,
  atendimentoProximoPassoOptions,
  atendimentoStatusOptions,
  atendimentoTipoImovelOptions,
  type AtendimentoCreateInput,
  type AtendimentoFinalidade,
  type AtendimentoStatus,
  type ContatoPreferencialAtendimento,
  type DormitoriosAtendimento,
  type ImobiliariaAtendimento,
  type OrigemLeadAtendimento,
  type PrioridadeAtendimento,
  type ProximoPassoAtendimento,
  type TipoImovelInteresse,
} from "@/types/atendimento";
import { cn } from "@/lib/utils";

type FormState = {
  clienteId: string;
  clienteNome: string;
  telefone: string;
  email: string;
  contatoPreferencial: ContatoPreferencialAtendimento;
  origem: OrigemLeadAtendimento;
  imobiliaria: ImobiliariaAtendimento;
  corretorId: string;
  prioridade: PrioridadeAtendimento;
  status: AtendimentoStatus;
  finalidade: AtendimentoFinalidade;
  tipoImovel: TipoImovelInteresse;
  dormitorios: DormitoriosAtendimento;
  bairroInteresse: string;
  orcamentoMin: string;
  orcamentoMax: string;
  imovelId: string;
  imovelDescricao: string;
  proximoRetorno: string;
  proximoPasso: "" | ProximoPassoAtendimento;
  observacoes: string;
  historicoInicial: string;
  motivoPerda: string;
};

const initialForm: FormState = {
  clienteId: "",
  clienteNome: "",
  telefone: "",
  email: "",
  contatoPreferencial: "whatsapp",
  origem: "whatsapp",
  imobiliaria: "cordial",
  corretorId: "a_definir",
  prioridade: "media",
  status: "novo",
  finalidade: "compra",
  tipoImovel: "apartamento",
  dormitorios: "nao_aplica",
  bairroInteresse: "",
  orcamentoMin: "",
  orcamentoMax: "",
  imovelId: "",
  imovelDescricao: "",
  proximoRetorno: "",
  proximoPasso: "",
  observacoes: "",
  historicoInicial: "",
  motivoPerda: "",
};

const sections = ["Entrada", "Interesse", "Operação", "Próximo passo"] as const;

export function AtendimentoFormModal({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: AtendimentoCreateInput) => void;
}) {
  const clientes = useApp((state) => state.clientes);
  const imoveis = useApp((state) => state.imoveis);
  const [form, setForm] = useState<FormState>(initialForm);
  const [validation, setValidation] = useState<AtendimentoValidationResult["errors"]>({});
  const [saving, setSaving] = useState(false);
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<number | null>(null);

  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => onOpenChange(false), 170);
  }, [closing, onOpenChange]);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      return;
    }
    if (!mounted) return;
    setClosing(true);
    const timer = window.setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, 170);
    return () => window.clearTimeout(timer);
  }, [open, mounted]);

  useEffect(
    () => () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    },
    [],
  );

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
    if (validation[key as keyof AtendimentoCreateInput]) {
      setValidation((current) => ({ ...current, [key]: undefined }));
    }
  }

  function selectClient(clienteId: string) {
    update("clienteId", clienteId);
    if (!clienteId) return;
    const client = clientes.find((item) => item.id === clienteId);
    if (!client) return;
    const raw = client as typeof client & { fullName?: string; phone?: string };
    setForm((current) => ({
      ...current,
      clienteId,
      clienteNome: raw.fullName ?? client.nome,
      telefone: formatPhoneBR(raw.phone ?? client.telefone ?? client.whatsapp ?? ""),
      email: client.email ?? "",
      imobiliaria: client.imobiliaria,
    }));
  }

  function updateStatus(status: AtendimentoStatus) {
    setForm((current) => ({
      ...current,
      status,
      proximoPasso:
        status === "visita_agendada" && !current.proximoPasso
          ? "agendar_visita"
          : current.proximoPasso,
    }));
    setValidation((current) => ({ ...current, status: undefined }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const broker = atendimentoBrokerOptions.find((item) => item.id === form.corretorId);
    const selectedProperty = imoveis.find((item) => item.id === form.imovelId);
    const input: AtendimentoCreateInput = {
      clienteId: optional(form.clienteId),
      clienteNome: form.clienteNome,
      telefone: form.telefone,
      email: optional(form.email),
      contatoPreferencial: form.contatoPreferencial,
      origem: form.origem,
      imobiliaria: form.imobiliaria,
      corretorId: optional(form.corretorId),
      corretorNome: form.corretorId === "a_definir" ? undefined : broker?.label,
      finalidade: form.finalidade,
      tipoImovel: form.tipoImovel,
      dormitorios: form.dormitorios,
      bairroInteresse: optional(form.bairroInteresse),
      orcamentoMin: parseCurrencyBR(form.orcamentoMin),
      orcamentoMax: parseCurrencyBR(form.orcamentoMax),
      imovelId: optional(form.imovelId),
      imovelDescricao: optional(form.imovelDescricao) ?? selectedProperty?.titulo,
      prioridade: form.prioridade,
      status: form.status,
      proximoRetorno: form.proximoRetorno ? new Date(form.proximoRetorno).toISOString() : undefined,
      proximoPasso: form.proximoPasso || undefined,
      observacoes: optional(form.observacoes),
      historicoInicial: optional(form.historicoInicial),
      motivoPerda: form.status === "perdido" ? optional(form.motivoPerda) : undefined,
    };

    const result = validateAtendimentoInput(input);
    setValidation(result.errors);
    if (!result.ok) return;

    setSaving(true);
    onSubmit(input);
    setSaving(false);
    setForm(initialForm);
    setValidation({});
    requestClose();
  }

  const hasErrors = Object.keys(validation).length > 0;

  return createPortal(
    <div
      className={cn(
        "atendimento-modal-backdrop fixed inset-0 z-50 flex items-end justify-center bg-stone-950/48 p-0 sm:items-center sm:p-5 sm:bg-stone-950/32 sm:backdrop-blur-sm",
        closing && "atendimento-modal-backdrop--closing",
      )}
    >
      <button
        type="button"
        aria-label="Fechar atendimento"
        className="absolute inset-0 cursor-default"
        onClick={requestClose}
      />

      <form
        onSubmit={submit}
        className={cn(
          "atendimento-form-modal relative flex h-dvh max-h-dvh w-full flex-col overflow-hidden border border-white/65 bg-background shadow-2xl shadow-stone-950/25",
          "sm:h-auto sm:max-h-[90vh] sm:max-w-[920px] sm:rounded-[2rem]",
          closing && "atendimento-form-modal--closing",
        )}
      >
        <header className="border-b border-white/55 bg-white/58 px-5 py-3 sm:px-6 sm:py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.2em] text-teal-800/70 sm:text-[10px]">
                <span className="size-2 rounded-full bg-amber-400 shadow-[0_0_18px_rgba(251,191,36,0.65)]" />
                Pré-atendimento comercial
              </div>
              <h2 className="mt-1 text-lg font-semibold tracking-tight sm:text-xl">
                Novo atendimento
              </h2>
              <p className="mt-1 hidden max-w-2xl text-xs leading-5 text-foreground/58 sm:block">
                Registre o essencial na entrada. Cliente, imóvel e corretor podem ser vinculados
                agora ou complementados depois.
              </p>
            </div>
            <button
              type="button"
              aria-label="Fechar"
              onClick={requestClose}
              className="grid size-10 shrink-0 place-items-center rounded-full bg-white/70 text-foreground/65 shadow-sm transition hover:text-foreground active:scale-95"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto sm:mt-4">
            {sections.map((section, index) => (
              <span
                key={section}
                className="flex shrink-0 items-center gap-2 rounded-full bg-white/60 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-foreground/58 sm:text-[10px]"
              >
                <span className="grid size-5 place-items-center rounded-full bg-teal-700 text-[9px] text-white">
                  {index + 1}
                </span>
                {section}
              </span>
            ))}
          </div>
        </header>

        <div className="no-scrollbar flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          {hasErrors && (
            <div className="mb-4 rounded-2xl border border-destructive/20 bg-destructive/8 px-4 py-3 text-xs font-medium text-destructive">
              Revise os campos destacados antes de salvar.
              {validation.orcamento && <span className="mt-1 block">{validation.orcamento}</span>}
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <FormSection
              step="1"
              title="Entrada do contato"
              description="Quem entrou em contato, como prefere falar e de onde veio."
            >
              <Field label="Vincular cliente existente (opcional)">
                <select
                  value={form.clienteId}
                  onChange={(event) => selectClient(event.target.value)}
                  className={inputClass()}
                >
                  <option value="">Novo contato, sem cadastro</option>
                  {clientes.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.nome}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Nome do contato" error={validation.clienteNome}>
                <input
                  value={form.clienteNome}
                  onChange={(event) => update("clienteNome", event.target.value)}
                  className={inputClass(validation.clienteNome)}
                  autoComplete="name"
                  autoFocus
                  required
                />
              </Field>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Telefone" error={validation.telefone}>
                  <input
                    value={form.telefone}
                    onChange={(event) => update("telefone", formatPhoneBR(event.target.value))}
                    className={inputClass(validation.telefone)}
                    inputMode="tel"
                    placeholder="(55) 99999-9999"
                    required
                  />
                </Field>
                <Field label="E-mail" error={validation.email}>
                  <input
                    value={form.email}
                    onChange={(event) => update("email", event.target.value)}
                    className={inputClass(validation.email)}
                    inputMode="email"
                    placeholder="Opcional"
                  />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Contato preferencial">
                  <TypedSelect
                    value={form.contatoPreferencial}
                    onChange={(value) =>
                      update("contatoPreferencial", value as ContatoPreferencialAtendimento)
                    }
                    options={atendimentoContatoOptions}
                  />
                </Field>
                <Field label="Origem do lead" error={validation.origem}>
                  <TypedSelect
                    value={form.origem}
                    onChange={(value) => update("origem", value as OrigemLeadAtendimento)}
                    options={atendimentoOrigemOptions}
                  />
                </Field>
              </div>
            </FormSection>

            <FormSection
              step="2"
              title="Interesse comercial"
              description="Dados estruturados para entender demanda, região e ticket."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Finalidade" error={validation.finalidade}>
                  <TypedSelect
                    value={form.finalidade}
                    onChange={(value) => update("finalidade", value as AtendimentoFinalidade)}
                    options={atendimentoFinalidadeOptions}
                  />
                </Field>
                <Field label="Tipo de imóvel" error={validation.tipoImovel}>
                  <TypedSelect
                    value={form.tipoImovel}
                    onChange={(value) => update("tipoImovel", value as TipoImovelInteresse)}
                    options={atendimentoTipoImovelOptions}
                  />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Dormitórios">
                  <TypedSelect
                    value={form.dormitorios}
                    onChange={(value) => update("dormitorios", value as DormitoriosAtendimento)}
                    options={atendimentoDormitoriosOptions}
                  />
                </Field>
                <Field label="Região/Bairro">
                  <input
                    value={form.bairroInteresse}
                    onChange={(event) => update("bairroInteresse", event.target.value)}
                    className={inputClass()}
                    placeholder="Centro, Cruzeiro..."
                  />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Orçamento mínimo">
                  <input
                    value={form.orcamentoMin}
                    onChange={(event) =>
                      update("orcamentoMin", formatCurrencyBR(event.target.value))
                    }
                    className={inputClass(validation.orcamento)}
                    inputMode="numeric"
                    placeholder="R$ 0"
                  />
                </Field>
                <Field label="Orçamento máximo">
                  <input
                    value={form.orcamentoMax}
                    onChange={(event) =>
                      update("orcamentoMax", formatCurrencyBR(event.target.value))
                    }
                    className={inputClass(validation.orcamento)}
                    inputMode="numeric"
                    placeholder="R$ 0"
                  />
                </Field>
              </div>

              <Field label="Descrição livre do interesse">
                <textarea
                  value={form.imovelDescricao}
                  onChange={(event) => update("imovelDescricao", event.target.value)}
                  className={cn(inputClass(), "min-h-20 resize-none leading-5")}
                  placeholder="Características desejadas, referência do anúncio ou contexto da busca."
                />
              </Field>

              <Field label="Vincular imóvel existente (opcional)">
                <select
                  value={form.imovelId}
                  onChange={(event) => update("imovelId", event.target.value)}
                  className={inputClass()}
                >
                  <option value="">Nenhum imóvel vinculado</option>
                  {imoveis.map((property) => (
                    <option key={property.id} value={property.id}>
                      {property.titulo}
                    </option>
                  ))}
                </select>
              </Field>
            </FormSection>

            <FormSection
              step="3"
              title="Vínculo operacional"
              description="Direcione o atendimento sem bloquear a entrada por falta de corretor."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Imobiliária" error={validation.imobiliaria}>
                  <TypedSelect
                    value={form.imobiliaria}
                    onChange={(value) => update("imobiliaria", value as ImobiliariaAtendimento)}
                    options={atendimentoImobiliariaOptions}
                  />
                </Field>
                <Field label="Corretor responsável">
                  <select
                    value={form.corretorId}
                    onChange={(event) => update("corretorId", event.target.value)}
                    className={inputClass()}
                  >
                    {atendimentoBrokerOptions.map((broker) => (
                      <option key={broker.id} value={broker.id}>
                        {broker.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Prioridade" error={validation.prioridade}>
                  <TypedSelect
                    value={form.prioridade}
                    onChange={(value) => update("prioridade", value as PrioridadeAtendimento)}
                    options={atendimentoPrioridadeOptions}
                  />
                </Field>
                <Field label="Status" error={validation.status}>
                  <TypedSelect
                    value={form.status}
                    onChange={(value) => updateStatus(value as AtendimentoStatus)}
                    options={atendimentoStatusOptions}
                  />
                </Field>
              </div>

              {form.status === "perdido" && (
                <Field label="Motivo da perda" error={validation.motivoPerda}>
                  <input
                    value={form.motivoPerda}
                    onChange={(event) => update("motivoPerda", event.target.value)}
                    className={inputClass(validation.motivoPerda)}
                    placeholder="Preço, localização, crédito, desistência..."
                  />
                </Field>
              )}
            </FormSection>

            <FormSection
              step="4"
              title="Próximo passo"
              description="Deixe o atendimento pronto para o corretor continuar."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Próximo retorno">
                  <input
                    type="datetime-local"
                    value={form.proximoRetorno}
                    onInput={(event) =>
                      update("proximoRetorno", (event.target as HTMLInputElement).value)
                    }
                    className={inputClass()}
                  />
                </Field>
                <Field label="Tipo de próximo passo">
                  <select
                    value={form.proximoPasso}
                    onChange={(event) =>
                      update("proximoPasso", event.target.value as FormState["proximoPasso"])
                    }
                    className={inputClass()}
                  >
                    <option value="">A definir</option>
                    {atendimentoProximoPassoOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="Observações internas">
                <textarea
                  value={form.observacoes}
                  onChange={(event) => update("observacoes", event.target.value)}
                  className={cn(inputClass(), "min-h-20 resize-none leading-5")}
                  placeholder="Informações úteis para a equipe comercial."
                />
              </Field>

              <Field label="Histórico inicial">
                <textarea
                  value={form.historicoInicial}
                  onChange={(event) => update("historicoInicial", event.target.value)}
                  className={cn(inputClass(), "min-h-20 resize-none leading-5")}
                  placeholder="Resumo do primeiro contato. O sistema também registrará a criação automaticamente."
                />
              </Field>
            </FormSection>
          </div>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-white/60 bg-white/62 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-4">
          <button
            type="button"
            onClick={requestClose}
            className="rounded-2xl bg-white/75 px-4 py-3 text-sm font-semibold text-foreground/70 shadow-sm transition hover:text-foreground active:scale-[0.98]"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 rounded-2xl bg-teal-700 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-teal-900/20 transition hover:bg-teal-800 active:scale-[0.98] disabled:opacity-70"
          >
            {saving ? "Salvando..." : "Salvar atendimento"}
            {!saving && <ChevronRight className="size-4" />}
          </button>
        </footer>
      </form>
    </div>,
    document.body,
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
    <section className="rounded-3xl border border-white/55 bg-white/40 p-4 shadow-sm shadow-stone-950/5">
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

function TypedSelect<T extends string>({
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
    "w-full rounded-2xl border bg-white/72 px-3 py-3 text-sm text-foreground outline-none transition",
    "placeholder:text-foreground/35 focus:border-teal-700/45 focus:ring-4 focus:ring-teal-700/10",
    error ? "border-destructive/35" : "border-white/65",
  );
}

function optional(value: string) {
  const trimmed = value.trim();
  return trimmed || undefined;
}
