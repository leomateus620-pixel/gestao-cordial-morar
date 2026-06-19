import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronRight, CircleAlert, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  formatPhoneBR,
  getAgenciamentoStatusLabel,
  validateAgenciamentoInput,
  type AgenciamentoValidationErrors,
} from "@/services/agenciamentos";
import {
  agenciamentoOrigemOptions,
  agenciamentoStatusOptions,
  agenciamentoTipoOptions,
  type Agenciamento,
  type AgenciamentoChecklist,
  type AgenciamentoContatoPreferencial,
  type AgenciamentoImobiliaria,
  type AgenciamentoInput,
  type AgenciamentoOrigem,
  type AgenciamentoStatus,
  type AgenciamentoTipoImovel,
} from "@/types/agenciamento";
import type { Corretor } from "@/types/corretor";
import { cn } from "@/lib/utils";

type FormState = {
  tipoImovel: AgenciamentoTipoImovel;
  endereco: string;
  bairro: string;
  cidade: string;
  imobiliaria: AgenciamentoImobiliaria;
  descricaoImovel: string;
  proprietarioNome: string;
  proprietarioTelefone: string;
  proprietarioContatoPreferencial: AgenciamentoContatoPreferencial;
  proprietarioObservacoes: string;
  corretorId: string;
  corretorNome: string;
  dataAgenciamento: string;
  origem: AgenciamentoOrigem;
  status: AgenciamentoStatus;
  checklist: AgenciamentoChecklist;
  driveFolderUrl: string;
  siteUrl: string;
  observacoesInternas: string;
};

type AgenciamentoFormModalProps = {
  open: boolean;
  agenciamento?: Agenciamento | null;
  corretores: Corretor[];
  currentBroker?: Corretor;
  canManage: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: AgenciamentoInput) => void;
};

const contactOptions: Array<{ value: AgenciamentoContatoPreferencial; label: string }> = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "ligacao", label: "Ligacao" },
  { value: "email", label: "E-mail" },
];

const imobiliariaOptions: Array<{ value: AgenciamentoImobiliaria; label: string }> = [
  { value: "cordial", label: "Cordial" },
  { value: "morar", label: "Morar" },
  { value: "ambas", label: "Ambas" },
];

const checklistLabels: Array<{ key: keyof AgenciamentoChecklist; label: string }> = [
  { key: "fotosRealizadas", label: "Fotos realizadas" },
  { key: "fotosDrive", label: "Fotos enviadas ao Drive" },
  { key: "placaInstalada", label: "Placa instalada" },
  { key: "cadastradoSite", label: "Imovel cadastrado no site" },
  { key: "videoRealizado", label: "Video realizado" },
  { key: "validado", label: "Agenciamento validado" },
];

const inputClassName =
  "h-11 w-full rounded-2xl border border-white/[0.65] bg-white/[0.72] px-3 text-sm outline-none transition-all placeholder:text-foreground/35 focus:border-primary/30 focus:bg-white/[0.86] focus:ring-2 focus:ring-primary/10";

function toDateInput(value?: string) {
  if (!value) return new Date().toISOString().slice(0, 10);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function initialForm(
  agenciamento: Agenciamento | null | undefined,
  currentBroker?: Corretor,
): FormState {
  return {
    tipoImovel: agenciamento?.tipoImovel ?? "casa",
    endereco: agenciamento?.endereco ?? "",
    bairro: agenciamento?.bairro ?? "",
    cidade: agenciamento?.cidade ?? "Porto Alegre",
    imobiliaria: agenciamento?.imobiliaria ?? currentBroker?.imobiliaria ?? "cordial",
    descricaoImovel: agenciamento?.descricaoImovel ?? "",
    proprietarioNome: agenciamento?.proprietarioNome ?? "",
    proprietarioTelefone: agenciamento?.proprietarioTelefone ?? "",
    proprietarioContatoPreferencial: agenciamento?.proprietarioContatoPreferencial ?? "whatsapp",
    proprietarioObservacoes: agenciamento?.proprietarioObservacoes ?? "",
    corretorId: agenciamento?.corretorId ?? currentBroker?.id ?? "",
    corretorNome: agenciamento?.corretorNome ?? currentBroker?.nome ?? "",
    dataAgenciamento: toDateInput(agenciamento?.dataAgenciamento),
    origem: agenciamento?.origem ?? "indicacao",
    status: agenciamento?.status ?? "novo",
    checklist: agenciamento?.checklist ?? {
      fotosRealizadas: false,
      fotosDrive: false,
      placaInstalada: false,
      cadastradoSite: false,
      videoRealizado: false,
      validado: false,
    },
    driveFolderUrl: agenciamento?.driveFolderUrl ?? "",
    siteUrl: agenciamento?.siteUrl ?? "",
    observacoesInternas: agenciamento?.observacoesInternas ?? "",
  };
}

export function AgenciamentoFormModal({
  open,
  agenciamento,
  corretores,
  currentBroker,
  canManage,
  onOpenChange,
  onSubmit,
}: AgenciamentoFormModalProps) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(() => initialForm(agenciamento, currentBroker));
  const [errors, setErrors] = useState<AgenciamentoValidationErrors>({});
  const isEditing = Boolean(agenciamento);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      setForm(initialForm(agenciamento, currentBroker));
      setErrors({});
    }
  }, [agenciamento, currentBroker, open]);

  useEffect(() => {
    if (!open && mounted && !closing) {
      setClosing(true);
      const timer = window.setTimeout(() => setMounted(false), 180);
      return () => window.clearTimeout(timer);
    }
  }, [closing, mounted, open]);

  useEffect(() => {
    if (!mounted || typeof document === "undefined") return;
    const previous = document.body.style.overflow;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  const selectedBroker = useMemo(
    () => corretores.find((corretor) => corretor.id === form.corretorId),
    [corretores, form.corretorId],
  );

  if (!mounted || typeof document === "undefined") return null;

  function requestClose() {
    if (closing) return;
    setClosing(true);
    window.setTimeout(() => onOpenChange(false), 170);
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    if (errors[key as keyof AgenciamentoInput]) {
      setErrors((current) => ({ ...current, [key]: undefined }));
    }
  }

  function updateChecklist(key: keyof AgenciamentoChecklist, value: boolean) {
    if (key === "validado" && !canManage) return;
    setForm((current) => ({
      ...current,
      status: key === "validado" && value ? "validado" : current.status,
      checklist: { ...current.checklist, [key]: value },
    }));
    setErrors((current) => ({ ...current, permissaoValidacao: undefined }));
  }

  function selectBroker(corretorId: string) {
    const corretor = corretores.find((item) => item.id === corretorId);
    setForm((current) => ({
      ...current,
      corretorId,
      corretorNome: corretor?.nome ?? current.corretorNome,
      imobiliaria: corretor?.imobiliaria ?? current.imobiliaria,
    }));
    setErrors((current) => ({ ...current, corretorId: undefined }));
  }

  function toInput(): AgenciamentoInput {
    const corretorNome = selectedBroker?.nome ?? form.corretorNome;
    const dataAgenciamento = form.dataAgenciamento
      ? new Date(`${form.dataAgenciamento}T12:00:00.000`).toISOString()
      : "";
    return {
      id: agenciamento?.id,
      tipoImovel: form.tipoImovel,
      endereco: form.endereco.trim(),
      bairro: form.bairro.trim(),
      cidade: form.cidade.trim(),
      imobiliaria: form.imobiliaria,
      descricaoImovel: form.descricaoImovel.trim(),
      proprietarioNome: form.proprietarioNome.trim(),
      proprietarioTelefone: formatPhoneBR(form.proprietarioTelefone),
      proprietarioContatoPreferencial: form.proprietarioContatoPreferencial,
      proprietarioObservacoes: form.proprietarioObservacoes.trim(),
      corretorId: form.corretorId,
      corretorNome,
      dataAgenciamento,
      origem: form.origem,
      status: form.checklist.validado ? "validado" : form.status,
      checklist: form.checklist,
      driveFolderUrl: form.driveFolderUrl.trim(),
      siteUrl: form.siteUrl.trim(),
      observacoesInternas: form.observacoesInternas.trim(),
      criadoPorId: agenciamento?.criadoPorId,
      criadoPorNome: agenciamento?.criadoPorNome,
      validadoPorId: agenciamento?.validadoPorId,
      validadoPorNome: agenciamento?.validadoPorNome,
      validadoEm: agenciamento?.validadoEm,
    };
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = toInput();
    const nextErrors = validateAgenciamentoInput(input, canManage);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setSaving(true);
    window.setTimeout(() => {
      onSubmit(input);
      setSaving(false);
      requestClose();
    }, 120);
  }

  const content = (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 px-0 py-0 backdrop-blur-sm sm:items-center sm:px-4 sm:py-6",
        closing ? "animate-out fade-out duration-200" : "animate-in fade-in duration-200",
      )}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className={cn(
          "flex max-h-[100dvh] w-full max-w-5xl flex-col overflow-hidden rounded-t-[2rem] bg-[#f7f3ed] shadow-[0_30px_100px_-38px_rgba(0,0,0,0.55)] ring-1 ring-white/55 sm:max-h-[92dvh] sm:rounded-[2rem]",
          closing
            ? "animate-out slide-out-to-bottom-6 zoom-out-95 duration-200"
            : "animate-in slide-in-from-bottom-5 zoom-in-95 duration-200",
        )}
      >
        <div className="border-b border-white/60 bg-white/45 px-4 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary/70">
                {isEditing ? "Editar agenciamento" : "Novo agenciamento"}
              </p>
              <h2 className="mt-1 text-xl font-black tracking-tight sm:text-2xl">
                {isEditing ? "Atualizar checklist e dados" : "Cadastrar imovel captado"}
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-foreground/55">
                Registre os dados essenciais e acompanhe fotos, placa, Drive, site e validacao.
              </p>
            </div>
            <button
              type="button"
              onClick={requestClose}
              className="grid size-10 shrink-0 place-items-center rounded-2xl bg-white/70 text-foreground/55 ring-1 ring-foreground/5 transition-all hover:text-primary active:scale-95"
              aria-label="Fechar formulario"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
          {errors.permissaoValidacao && (
            <div className="mb-4 flex items-center gap-2 rounded-2xl bg-[rgba(217,120,45,0.12)] px-3 py-2 text-xs font-semibold text-[var(--system-accent-dark)]">
              <CircleAlert className="size-4" />
              {errors.permissaoValidacao}
            </div>
          )}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.78fr)]">
            <div className="space-y-4">
              <FormSection title="Dados do imovel" step="01">
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Tipo de imovel" error={errors.tipoImovel}>
                    <Select
                      value={form.tipoImovel}
                      onValueChange={(value) =>
                        update("tipoImovel", value as AgenciamentoTipoImovel)
                      }
                    >
                      <SelectTrigger className="h-11 rounded-2xl border-white/[0.65] bg-white/[0.72]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {agenciamentoTipoOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Imobiliaria" error={errors.imobiliaria}>
                    <Select
                      value={form.imobiliaria}
                      onValueChange={(value) =>
                        update("imobiliaria", value as AgenciamentoImobiliaria)
                      }
                    >
                      <SelectTrigger className="h-11 rounded-2xl border-white/[0.65] bg-white/[0.72]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {imobiliariaOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                <Field label="Endereco do imovel" error={errors.endereco}>
                  <input
                    value={form.endereco}
                    onChange={(event) => update("endereco", event.target.value)}
                    className={inputClassName}
                    placeholder="Rua, numero, complemento"
                  />
                </Field>

                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Bairro/regiao">
                    <input
                      value={form.bairro}
                      onChange={(event) => update("bairro", event.target.value)}
                      className={inputClassName}
                      placeholder="Centro"
                    />
                  </Field>
                  <Field label="Cidade">
                    <input
                      value={form.cidade}
                      onChange={(event) => update("cidade", event.target.value)}
                      className={inputClassName}
                      placeholder="Porto Alegre"
                    />
                  </Field>
                </div>

                <Field label="Descricao curta">
                  <textarea
                    value={form.descricaoImovel}
                    onChange={(event) => update("descricaoImovel", event.target.value)}
                    className={cn(inputClassName, "h-auto min-h-20 resize-none py-3")}
                    placeholder="Resumo rapido para a gestao entender o imovel."
                  />
                </Field>
              </FormSection>

              <FormSection title="Proprietario" step="02">
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Nome do proprietario" error={errors.proprietarioNome}>
                    <input
                      value={form.proprietarioNome}
                      onChange={(event) => update("proprietarioNome", event.target.value)}
                      className={inputClassName}
                      placeholder="Nome completo"
                    />
                  </Field>
                  <Field label="Telefone" error={errors.proprietarioTelefone}>
                    <input
                      value={form.proprietarioTelefone}
                      onChange={(event) =>
                        update("proprietarioTelefone", formatPhoneBR(event.target.value))
                      }
                      className={inputClassName}
                      placeholder="(51) 99999-9999"
                    />
                  </Field>
                </div>

                <div className="grid gap-3 md:grid-cols-[0.8fr_1.2fr]">
                  <Field label="Contato preferencial">
                    <Select
                      value={form.proprietarioContatoPreferencial}
                      onValueChange={(value) =>
                        update(
                          "proprietarioContatoPreferencial",
                          value as AgenciamentoContatoPreferencial,
                        )
                      }
                    >
                      <SelectTrigger className="h-11 rounded-2xl border-white/[0.65] bg-white/[0.72]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {contactOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Observacoes do proprietario">
                    <input
                      value={form.proprietarioObservacoes}
                      onChange={(event) => update("proprietarioObservacoes", event.target.value)}
                      className={inputClassName}
                      placeholder="Preferencias de contato, restricoes, combinados..."
                    />
                  </Field>
                </div>
              </FormSection>

              <FormSection title="Responsavel e data" step="03">
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Corretor responsavel" error={errors.corretorId}>
                    <Select
                      value={form.corretorId}
                      onValueChange={selectBroker}
                      disabled={!canManage}
                    >
                      <SelectTrigger className="h-11 rounded-2xl border-white/[0.65] bg-white/[0.72]">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {corretores.map((corretor) => (
                          <SelectItem key={corretor.id} value={corretor.id}>
                            {corretor.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Data do agenciamento" error={errors.dataAgenciamento}>
                    <input
                      type="date"
                      value={form.dataAgenciamento}
                      onChange={(event) => update("dataAgenciamento", event.target.value)}
                      className={inputClassName}
                    />
                  </Field>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Origem" error={errors.origem}>
                    <Select
                      value={form.origem}
                      onValueChange={(value) => update("origem", value as AgenciamentoOrigem)}
                    >
                      <SelectTrigger className="h-11 rounded-2xl border-white/[0.65] bg-white/[0.72]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {agenciamentoOrigemOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Status" error={errors.status}>
                    <Select
                      value={form.status}
                      onValueChange={(value) => update("status", value as AgenciamentoStatus)}
                    >
                      <SelectTrigger className="h-11 rounded-2xl border-white/[0.65] bg-white/[0.72]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {agenciamentoStatusOptions.map((option) => (
                          <SelectItem
                            key={option.value}
                            value={option.value}
                            disabled={option.value === "validado" && !canManage}
                          >
                            {getAgenciamentoStatusLabel(option.value)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </FormSection>
            </div>

            <div className="space-y-4">
              <FormSection title="Checklist operacional" step="04">
                <div className="space-y-2">
                  {checklistLabels.map((item) => {
                    const adminOnly = item.key === "validado";
                    return (
                      <label
                        key={item.key}
                        className={cn(
                          "flex items-center justify-between gap-3 rounded-2xl bg-white/[0.62] px-3 py-3 ring-1 ring-white/70",
                          adminOnly && !canManage && "opacity-65",
                        )}
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold">{item.label}</span>
                          {adminOnly && (
                            <span className="mt-0.5 block text-[11px] text-foreground/48">
                              Apenas administradores
                            </span>
                          )}
                        </span>
                        <Switch
                          checked={form.checklist[item.key]}
                          disabled={adminOnly && !canManage}
                          onCheckedChange={(checked) => updateChecklist(item.key, checked)}
                        />
                      </label>
                    );
                  })}
                </div>
              </FormSection>

              <FormSection title="Links e observacoes" step="05">
                <Field label="Link da pasta do Drive" error={errors.driveFolderUrl}>
                  <input
                    value={form.driveFolderUrl}
                    onChange={(event) => update("driveFolderUrl", event.target.value)}
                    className={inputClassName}
                    placeholder="https://drive.google.com/..."
                  />
                </Field>
                <Field label="Link do imovel no site" error={errors.siteUrl}>
                  <input
                    value={form.siteUrl}
                    onChange={(event) => update("siteUrl", event.target.value)}
                    className={inputClassName}
                    placeholder="https://..."
                  />
                </Field>
                <Field label="Observacoes internas">
                  <textarea
                    value={form.observacoesInternas}
                    onChange={(event) => update("observacoesInternas", event.target.value)}
                    className={cn(inputClassName, "h-auto min-h-28 resize-none py-3")}
                    placeholder="Pendencias, combinados, validacoes e contexto para gestao."
                  />
                </Field>
              </FormSection>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-white/60 bg-white/45 px-4 py-3 sm:flex-row sm:items-center sm:justify-end sm:px-6">
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-2xl border-white/[0.65] bg-white/[0.66]"
            onClick={requestClose}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            className="h-11 rounded-2xl bg-primary text-white"
            disabled={saving}
          >
            {saving ? <Check className="size-4" /> : <Save className="size-4" />}
            {isEditing ? "Salvar alteracoes" : "Cadastrar agenciamento"}
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </form>
    </div>
  );

  return createPortal(content, document.body);
}

function FormSection({
  title,
  step,
  children,
}: {
  title: string;
  step: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[1.35rem] border border-white/60 bg-white/[0.48] p-4 shadow-[0_14px_34px_-28px_rgba(23,27,33,0.24)]">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-xl bg-primary/10 font-mono text-[11px] font-black text-primary">
          {step}
        </span>
        <h3 className="text-sm font-bold tracking-tight">{title}</h3>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/45">
        {label}
      </span>
      {children}
      {error && <span className="mt-1 block text-[11px] font-semibold text-red-600">{error}</span>}
    </label>
  );
}
