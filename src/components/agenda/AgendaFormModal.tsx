import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  BellRing,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  Cloud,
  Plus,
  RefreshCcw,
  Save,
  Trash2,
  UserRoundCheck,
  X,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { agendaTitleSuggestion, validateAgendaEvent } from "@/services/agenda";
import {
  agendaImobiliariaOptions,
  agendaPrioridadeOptions,
  agendaRecorrenciaOptions,
  agendaReminderOptions,
  agendaStatusOptions,
  agendaTipoOptions,
  type AgendaChecklistItem,
  type AgendaEvent,
  type AgendaEventInput,
  type AgendaImobiliaria,
  type AgendaPrioridade,
  type AgendaRecorrencia,
  type AgendaStatus,
  type AgendaTipo,
} from "@/types/agenda";
import { cn } from "@/lib/utils";

type NamedOption = { id: string; nome: string };
type PropertyOption = { id: string; titulo: string; endereco?: string };
type AtendimentoOption = { id: string; clienteNome?: string; imovelDescricao?: string };

type FormState = {
  tipo: AgendaTipo;
  titulo: string;
  descricao: string;
  data: string;
  horaInicio: string;
  horaFim: string;
  duracaoMin: string;
  diaInteiro: boolean;
  repeticao: AgendaRecorrencia;
  status: AgendaStatus;
  prioridade: AgendaPrioridade;
  clienteId: string;
  atendimentoId: string;
  imovelId: string;
  imovelDescricao: string;
  local: string;
  videoCallUrl: string;
  imobiliaria: AgendaImobiliaria;
  responsavelPrincipalId: string;
  participantesIds: string[];
  participanteOutro: string;
  lembreteAtivo: boolean;
  lembreteMin: string;
  lembretePersonalizado: string;
  emailAtivo: boolean;
  whatsappAtivo: boolean;
  observacoes: string;
  checklist: AgendaChecklistItem[];
};

const checklistSeed = [
  "Confirmar com cliente",
  "Separar documentos",
  "Enviar endereço",
  "Confirmar responsável",
  "Enviar mensagem de lembrete",
  "Registrar resultado depois",
];

export function AgendaFormModal({
  open,
  event,
  onOpenChange,
  onSubmit,
  canEdit,
  clients,
  atendimentos,
  properties,
  people,
  currentUser,
}: {
  open: boolean;
  event?: AgendaEvent;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: AgendaEventInput) => void;
  canEdit: boolean;
  clients: NamedOption[];
  atendimentos: AtendimentoOption[];
  properties: PropertyOption[];
  people: NamedOption[];
  currentUser?: NamedOption;
}) {
  const [form, setForm] = useState<FormState>(() => initialForm(undefined, currentUser));
  const [errors, setErrors] = useState<ReturnType<typeof validateAgendaEvent>>({});
  const [closing, setClosing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(initialForm(event, currentUser));
    setErrors({});
    setClosing(false);
  }, [currentUser, event, open]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const selectedClient = clients.find((client) => client.id === form.clienteId);
  const selectedProperty = properties.find((property) => property.id === form.imovelId);
  const selectedResponsible = people.find((person) => person.id === form.responsavelPrincipalId);
  const hasErrors = Object.keys(errors).length > 0;
  const isEditing = Boolean(event);

  const selectedParticipants = useMemo(
    () => people.filter((person) => form.participantesIds.includes(person.id)),
    [form.participantesIds, people],
  );

  if (!open || typeof document === "undefined") return null;

  function requestClose() {
    if (closing) return;
    setClosing(true);
    window.setTimeout(() => onOpenChange(false), 170);
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateType(tipo: AgendaTipo) {
    setForm((current) => {
      const currentSuggestion = agendaTitleSuggestion(
        current.tipo,
        selectedClient?.nome,
        current.imovelDescricao || selectedProperty?.titulo,
      );
      const nextSuggestion = agendaTitleSuggestion(
        tipo,
        selectedClient?.nome,
        current.imovelDescricao || selectedProperty?.titulo,
      );
      return {
        ...current,
        tipo,
        titulo:
          !isEditing && (!current.titulo.trim() || current.titulo === currentSuggestion)
            ? nextSuggestion
            : current.titulo,
      };
    });
  }

  function updateClient(clienteId: string) {
    const client = clients.find((item) => item.id === clienteId);
    setForm((current) => ({
      ...current,
      clienteId,
      titulo:
        !isEditing &&
        current.tipo === "retorno" &&
        (!current.titulo.trim() || current.titulo.startsWith("Retorno para"))
          ? agendaTitleSuggestion("retorno", client?.nome)
          : current.titulo,
    }));
  }

  function updateProperty(imovelId: string) {
    const property = properties.find((item) => item.id === imovelId);
    setForm((current) => ({
      ...current,
      imovelId,
      imovelDescricao: current.imovelDescricao || property?.titulo || "",
      local: current.local || property?.endereco || "",
    }));
  }

  function toggleParticipant(userId: string) {
    setForm((current) => ({
      ...current,
      participantesIds: current.participantesIds.includes(userId)
        ? current.participantesIds.filter((id) => id !== userId)
        : [...current.participantesIds, userId],
    }));
  }

  function updateChecklist(id: string, patch: Partial<AgendaChecklistItem>) {
    setForm((current) => ({
      ...current,
      checklist: current.checklist.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));
  }

  function addChecklistItem() {
    setForm((current) => ({
      ...current,
      checklist: [...current.checklist, { id: `check-${Date.now()}`, label: "", done: false }],
    }));
  }

  function removeChecklistItem(id: string) {
    setForm((current) => ({
      ...current,
      checklist: current.checklist.filter((item) => item.id !== id),
    }));
  }

  function submit(submitEvent: FormEvent) {
    submitEvent.preventDefault();
    if (!canEdit) return;
    const input = buildInput(
      form,
      selectedClient,
      selectedProperty,
      selectedResponsible,
      selectedParticipants,
    );
    const validation = validateAgendaEvent(input);
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setSaving(true);
    onSubmit(input);
    setSaving(false);
    requestClose();
  }

  return createPortal(
    <div
      className={cn(
        "agenda-modal-backdrop fixed inset-0 z-50 flex items-end justify-center bg-stone-950/52 p-0 sm:items-center sm:p-5 sm:bg-stone-950/34 sm:backdrop-blur-sm",
        closing && "agenda-modal-backdrop--closing",
      )}
    >
      <button
        type="button"
        aria-label="Fechar compromisso"
        className="absolute inset-0 cursor-default"
        onClick={requestClose}
      />

      <form
        onSubmit={submit}
        className={cn(
          "agenda-form-modal relative flex h-dvh max-h-dvh w-full flex-col overflow-hidden border border-white/65 bg-background shadow-2xl shadow-stone-950/25",
          "sm:h-auto sm:max-h-[92vh] sm:max-w-[920px] sm:rounded-[2rem]",
          closing && "agenda-form-modal--closing",
        )}
      >
        <header className="border-b border-white/55 bg-white/62 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.2em] text-teal-800/70 sm:text-[10px]">
                <span className="size-2 rounded-full bg-orange-400 shadow-[0_0_18px_rgba(251,146,60,0.6)]" />
                {isEditing ? "Detalhe operacional" : "Central de compromissos"}
              </div>
              <h2 className="mt-1 text-lg font-semibold tracking-tight sm:text-xl">
                {isEditing ? "Editar compromisso" : "Novo compromisso"}
              </h2>
              <p className="mt-1 hidden max-w-2xl text-xs leading-5 text-foreground/58 sm:block">
                Organize o compromisso, os vínculos, os responsáveis e os lembretes em um só lugar.
              </p>
            </div>
            <button
              type="button"
              aria-label="Fechar"
              onClick={requestClose}
              className="grid size-10 shrink-0 place-items-center rounded-full bg-white/72 text-foreground/65 shadow-sm transition hover:text-foreground active:scale-95"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto sm:mt-4">
            {["Tipo e título", "Data e horário", "Vínculos", "Responsáveis", "Lembretes"].map(
              (section, index) => (
                <span
                  key={section}
                  className="flex shrink-0 items-center gap-2 rounded-full bg-white/65 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.1em] text-foreground/58"
                >
                  <span className="grid size-5 place-items-center rounded-full bg-teal-700 text-[9px] text-white">
                    {index + 1}
                  </span>
                  {section}
                </span>
              ),
            )}
          </div>
        </header>

        <div className="no-scrollbar flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          {!canEdit && (
            <div className="mb-4 flex items-start gap-2 rounded-2xl border border-amber-500/20 bg-amber-500/9 px-4 py-3 text-xs text-amber-900">
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              Somente administradores, o criador, o responsável ou um participante podem editar este
              compromisso.
            </div>
          )}
          {hasErrors && (
            <div className="mb-4 rounded-2xl border border-destructive/20 bg-destructive/8 px-4 py-3 text-xs font-medium text-destructive">
              Revise os campos destacados antes de salvar.
            </div>
          )}

          <fieldset disabled={!canEdit} className="grid gap-4 lg:grid-cols-2 disabled:opacity-75">
            <FormSection
              step="1"
              title="Tipo e título"
              description="Defina o objetivo do compromisso e dê contexto para a equipe."
            >
              <Field label="Tipo de compromisso">
                <select
                  value={form.tipo}
                  onChange={(event) => updateType(event.target.value as AgendaTipo)}
                  className={inputClass()}
                >
                  {agendaTipoOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Título" error={errors.titulo}>
                <input
                  value={form.titulo}
                  onChange={(event) => update("titulo", event.target.value)}
                  className={inputClass(errors.titulo)}
                  placeholder="Ex.: Fotos do imóvel no Centro"
                  required
                />
              </Field>
              <Field label="Descrição curta">
                <textarea
                  value={form.descricao}
                  onChange={(event) => update("descricao", event.target.value)}
                  className={cn(inputClass(), "min-h-20 resize-none leading-5")}
                  placeholder="Objetivo e contexto rápido para quem participar."
                />
              </Field>
            </FormSection>

            <FormSection
              step="2"
              title="Data, horário e duração"
              description="Horários claros evitam sobreposição e esquecimento."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Data" error={errors.inicio}>
                  <input
                    type="date"
                    value={form.data}
                    onChange={(event) => update("data", event.target.value)}
                    className={inputClass(errors.inicio)}
                    required
                  />
                </Field>
                <Field label="Dia inteiro">
                  <ToggleLine
                    checked={form.diaInteiro}
                    onCheckedChange={(checked) => update("diaInteiro", checked)}
                    label={form.diaInteiro ? "Ativado" : "Não"}
                  />
                </Field>
              </div>
              {!form.diaInteiro && (
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Início" error={errors.inicio}>
                    <input
                      type="time"
                      value={form.horaInicio}
                      onChange={(event) => update("horaInicio", event.target.value)}
                      className={inputClass(errors.inicio)}
                      required
                    />
                  </Field>
                  <Field label="Fim" error={errors.fim}>
                    <input
                      type="time"
                      value={form.horaFim}
                      onChange={(event) => update("horaFim", event.target.value)}
                      className={inputClass(errors.fim)}
                    />
                  </Field>
                  <Field label="Duração (min)" error={errors.duracao}>
                    <input
                      type="number"
                      min="1"
                      value={form.duracaoMin}
                      onChange={(event) => update("duracaoMin", event.target.value)}
                      className={inputClass(errors.duracao)}
                    />
                  </Field>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Repetir">
                  <select
                    value={form.repeticao}
                    onChange={(event) =>
                      update("repeticao", event.target.value as AgendaRecorrencia)
                    }
                    className={inputClass()}
                  >
                    {agendaRecorrenciaOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Status">
                  <select
                    value={form.status}
                    onChange={(event) => update("status", event.target.value as AgendaStatus)}
                    className={inputClass()}
                  >
                    {agendaStatusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Prioridade">
                  <select
                    value={form.prioridade}
                    onChange={(event) =>
                      update("prioridade", event.target.value as AgendaPrioridade)
                    }
                    className={inputClass()}
                  >
                    {agendaPrioridadeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              {form.repeticao === "personalizado" && (
                <FutureNote>
                  Recorrência personalizada está estruturada para uma fase futura.
                </FutureNote>
              )}
            </FormSection>

            <FormSection
              step="3"
              title="Vínculos comerciais"
              description="Todos os vínculos são opcionais; endereço e descrição livre continuam disponíveis."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Cliente vinculado">
                  <select
                    value={form.clienteId}
                    onChange={(event) => updateClient(event.target.value)}
                    className={inputClass()}
                  >
                    <option value="">Sem cliente vinculado</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.nome}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Atendimento vinculado">
                  <select
                    value={form.atendimentoId}
                    onChange={(event) => update("atendimentoId", event.target.value)}
                    className={inputClass()}
                  >
                    <option value="">Sem atendimento vinculado</option>
                    {atendimentos.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.clienteNome || item.imovelDescricao || item.id}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Imóvel vinculado">
                <select
                  value={form.imovelId}
                  onChange={(event) => updateProperty(event.target.value)}
                  className={inputClass()}
                >
                  <option value="">Sem imóvel cadastrado</option>
                  {properties.map((property) => (
                    <option key={property.id} value={property.id}>
                      {property.titulo}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Descrição livre do imóvel">
                <input
                  value={form.imovelDescricao}
                  onChange={(event) => update("imovelDescricao", event.target.value)}
                  className={inputClass()}
                  placeholder="Referência, nome do prédio ou características"
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Endereço/local">
                  <input
                    value={form.local}
                    onChange={(event) => update("local", event.target.value)}
                    className={inputClass()}
                    placeholder="Rua, número ou sala"
                  />
                </Field>
                <Field label="Link de videochamada">
                  <input
                    type="url"
                    value={form.videoCallUrl}
                    onChange={(event) => update("videoCallUrl", event.target.value)}
                    className={inputClass()}
                    placeholder="https://meet..."
                  />
                </Field>
              </div>
              <Field label="Imobiliária">
                <select
                  value={form.imobiliaria}
                  onChange={(event) =>
                    update("imobiliaria", event.target.value as AgendaImobiliaria)
                  }
                  className={inputClass()}
                >
                  {agendaImobiliariaOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
            </FormSection>

            <FormSection
              step="4"
              title="Responsáveis"
              description="Admins podem complementar responsáveis e participantes depois da criação."
            >
              <Field label="Responsável principal" error={errors.responsavel}>
                <select
                  value={form.responsavelPrincipalId}
                  onChange={(event) => update("responsavelPrincipalId", event.target.value)}
                  className={inputClass(errors.responsavel)}
                >
                  <option value="">A definir</option>
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.nome}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Participantes adicionais / quem acompanha">
                <div className="grid gap-2 sm:grid-cols-2">
                  {people.map((person) => (
                    <label
                      key={person.id}
                      className="flex items-center gap-2 rounded-2xl bg-white/55 px-3 py-2.5 text-xs font-medium text-foreground/68 ring-1 ring-white/65"
                    >
                      <Checkbox
                        checked={form.participantesIds.includes(person.id)}
                        onCheckedChange={() => toggleParticipant(person.id)}
                      />
                      <span className="truncate">{person.nome}</span>
                    </label>
                  ))}
                </div>
              </Field>
              <Field label="Outro acompanhante">
                <input
                  value={form.participanteOutro}
                  onChange={(event) => update("participanteOutro", event.target.value)}
                  className={inputClass()}
                  placeholder="Nome de participante externo"
                />
              </Field>
              <div className="rounded-2xl border border-teal-700/10 bg-teal-700/6 px-3 py-2.5 text-[10px] leading-5 text-teal-900/70">
                <UserRoundCheck className="mr-1 inline size-3.5" />
                Permissão preparada: administradores editam qualquer evento; corretores editam
                eventos próprios ou em que participam.
              </div>
            </FormSection>

            <FormSection
              step="5"
              title="Lembretes e notificações"
              description="Canais externos ficam preparados, sem chamadas de API nesta fase."
              className="lg:col-span-2"
            >
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-3">
                  <Field label="Lembrete interno">
                    <div className="flex items-center gap-3 rounded-2xl bg-white/55 px-3 py-2 ring-1 ring-white/65">
                      <Switch
                        checked={form.lembreteAtivo}
                        onCheckedChange={(checked) => update("lembreteAtivo", checked)}
                      />
                      <select
                        value={form.lembreteMin}
                        onChange={(event) => update("lembreteMin", event.target.value)}
                        className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                        disabled={!form.lembreteAtivo}
                      >
                        {agendaReminderOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </Field>
                  {form.lembreteMin === "-1" && form.lembreteAtivo && (
                    <Field label="Antecedência personalizada (min)">
                      <input
                        type="number"
                        min="1"
                        value={form.lembretePersonalizado}
                        onChange={(event) => update("lembretePersonalizado", event.target.value)}
                        className={inputClass()}
                      />
                    </Field>
                  )}
                  <ToggleLine
                    checked={form.emailAtivo}
                    onCheckedChange={(checked) => update("emailAtivo", checked)}
                    label="Notificar por e-mail"
                    detail="Estrutura local, sem envio real"
                  />
                  <ToggleLine
                    checked={form.whatsappAtivo}
                    onCheckedChange={(checked) => update("whatsappAtivo", checked)}
                    label="Notificar por WhatsApp"
                    detail="Canal futuro, sem API"
                    future
                  />
                  <div className="flex items-center gap-3 rounded-2xl border border-dashed border-sky-600/20 bg-sky-600/6 px-3 py-3 text-xs text-sky-900/72">
                    <Cloud className="size-4 shrink-0" />
                    <span>
                      <strong>Google Agenda:</strong> preparado para sincronização futura.
                    </span>
                  </div>
                  <Field label="Observações internas">
                    <textarea
                      value={form.observacoes}
                      onChange={(event) => update("observacoes", event.target.value)}
                      className={cn(inputClass(), "min-h-24 resize-none leading-5")}
                      placeholder="Informações úteis apenas para a equipe."
                    />
                  </Field>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-foreground/52">
                      Checklist do compromisso
                    </span>
                    <button
                      type="button"
                      onClick={addChecklistItem}
                      className="flex items-center gap-1 rounded-full bg-teal-700/9 px-2.5 py-1.5 text-[10px] font-semibold text-teal-800"
                    >
                      <Plus className="size-3" /> Adicionar
                    </button>
                  </div>
                  <div className="space-y-2">
                    {form.checklist.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-2 rounded-2xl bg-white/55 px-3 py-2 ring-1 ring-white/65"
                      >
                        <Checkbox
                          checked={item.done}
                          onCheckedChange={(checked) =>
                            updateChecklist(item.id, { done: checked === true })
                          }
                        />
                        <input
                          value={item.label}
                          onChange={(event) =>
                            updateChecklist(item.id, { label: event.target.value })
                          }
                          className={cn(
                            "min-w-0 flex-1 bg-transparent text-xs outline-none",
                            item.done && "text-foreground/38 line-through",
                          )}
                          placeholder="Novo item"
                        />
                        <button
                          type="button"
                          onClick={() => removeChecklistItem(item.id)}
                          className="text-foreground/30 transition hover:text-rose-600"
                          aria-label="Remover item"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </FormSection>
          </fieldset>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-white/60 bg-white/68 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={requestClose}
              className="rounded-2xl bg-white/80 px-4 py-3 text-sm font-semibold text-foreground/70 shadow-sm transition hover:text-foreground active:scale-[0.98]"
            >
              {canEdit ? "Cancelar" : "Fechar"}
            </button>
            {isEditing && canEdit && (
              <div className="hidden items-center gap-1.5 lg:flex">
                <QuickAction
                  label="Concluir"
                  icon={Check}
                  onClick={() => update("status", "concluido")}
                  active={form.status === "concluido"}
                />
                <QuickAction
                  label="Reagendar"
                  icon={RefreshCcw}
                  onClick={() => update("status", "reagendado")}
                  active={form.status === "reagendado"}
                />
                <QuickAction
                  label="Cancelar"
                  icon={X}
                  onClick={() => update("status", "cancelado")}
                  active={form.status === "cancelado"}
                  danger
                />
              </div>
            )}
          </div>
          {canEdit && (
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 rounded-2xl bg-teal-700 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-teal-900/20 transition hover:bg-teal-800 active:scale-[0.98] disabled:opacity-70"
            >
              {saving ? "Salvando..." : "Salvar compromisso"}
              {saving ? (
                <Clock3 className="size-4 animate-pulse" />
              ) : isEditing ? (
                <Save className="size-4" />
              ) : (
                <ChevronRight className="size-4" />
              )}
            </button>
          )}
        </footer>
      </form>
    </div>,
    document.body,
  );
}

function buildInput(
  form: FormState,
  client: NamedOption | undefined,
  property: PropertyOption | undefined,
  responsible: NamedOption | undefined,
  participants: NamedOption[],
): AgendaEventInput {
  const inicio = localToIso(form.data, form.diaInteiro ? "00:00" : form.horaInicio);
  const explicitEnd = form.horaFim
    ? localToIso(form.data, form.diaInteiro ? "23:59" : form.horaFim)
    : undefined;
  const duration = Math.max(1, Number(form.duracaoMin) || 60);
  const fim = explicitEnd ?? addMinutesIso(inicio, duration);
  const reminderMinutes =
    form.lembreteMin === "-1" ? Number(form.lembretePersonalizado) : Number(form.lembreteMin);
  const customParticipant = form.participanteOutro.trim();

  return {
    titulo: form.titulo.trim(),
    descricao: optional(form.descricao),
    tipo: form.tipo,
    status: form.status,
    prioridade: form.prioridade,
    inicio,
    fim,
    duracaoMin: form.diaInteiro ? 1439 : explicitEnd ? minutesBetween(inicio, fim) : duration,
    diaInteiro: form.diaInteiro,
    repeticao: form.repeticao,
    imobiliaria: form.imobiliaria,
    clienteId: optional(form.clienteId),
    clienteNome: client?.nome,
    atendimentoId: optional(form.atendimentoId),
    imovelId: optional(form.imovelId),
    imovelDescricao: optional(form.imovelDescricao) ?? property?.titulo,
    local: optional(form.local) ?? property?.endereco,
    videoCallUrl: optional(form.videoCallUrl),
    responsavelPrincipalId: optional(form.responsavelPrincipalId),
    responsavelPrincipalNome: responsible?.nome,
    participantes: [
      ...participants.map((participant) => ({
        userId: participant.id,
        nome: participant.nome,
        papel: "acompanhante" as const,
      })),
      ...(customParticipant
        ? [
            {
              userId: `externo-${Date.now()}`,
              nome: customParticipant,
              papel: "participante" as const,
            },
          ]
        : []),
    ],
    lembretes: [
      ...(form.lembreteAtivo
        ? [
            {
              id: `interno-${Date.now()}`,
              tipo: "interno" as const,
              antecedenciaMin: Math.max(1, reminderMinutes || 30),
              ativo: true,
            },
          ]
        : []),
      ...(form.emailAtivo
        ? [
            {
              id: `email-${Date.now()}`,
              tipo: "email" as const,
              antecedenciaMin: Math.max(1, reminderMinutes || 30),
              ativo: true,
            },
          ]
        : []),
      ...(form.whatsappAtivo
        ? [
            {
              id: `whatsapp-${Date.now()}`,
              tipo: "whatsapp" as const,
              antecedenciaMin: Math.max(1, reminderMinutes || 30),
              ativo: true,
              canalFuturo: true,
            },
          ]
        : []),
    ],
    checklist: form.checklist
      .filter((item) => item.label.trim())
      .map((item) => ({ ...item, label: item.label.trim() })),
    observacoes: optional(form.observacoes),
    googleCalendarSyncStatus: "preparado",
  };
}

function initialForm(event: AgendaEvent | undefined, currentUser?: NamedOption): FormState {
  const start = event ? new Date(event.inicio) : nextRoundedHour();
  const end = event?.fim ? new Date(event.fim) : new Date(start.getTime() + 60 * 60_000);
  const internalReminder = event?.lembretes.find(
    (reminder) => reminder.tipo === "interno" && reminder.ativo,
  );
  const reminderValue = internalReminder?.antecedenciaMin ?? 30;
  const knownReminder = agendaReminderOptions.some((option) => option.value === reminderValue);
  const customParticipants =
    event?.participantes
      .filter((participant) => participant.userId.startsWith("externo-"))
      .map((participant) => participant.nome)
      .join(", ") ?? "";
  return {
    tipo: event?.tipo ?? "visita",
    titulo: event?.titulo ?? "",
    descricao: event?.descricao ?? "",
    data: localDate(start),
    horaInicio: localTime(start),
    horaFim: localTime(end),
    duracaoMin: String(event?.duracaoMin ?? 60),
    diaInteiro: event?.diaInteiro ?? false,
    repeticao: event?.repeticao ?? "nao",
    status: event?.status ?? "agendado",
    prioridade: event?.prioridade ?? "media",
    clienteId: event?.clienteId ?? "",
    atendimentoId: event?.atendimentoId ?? "",
    imovelId: event?.imovelId ?? "",
    imovelDescricao: event?.imovelDescricao ?? "",
    local: event?.local ?? "",
    videoCallUrl: event?.videoCallUrl ?? "",
    imobiliaria: event?.imobiliaria ?? "cordial",
    responsavelPrincipalId: event?.responsavelPrincipalId ?? currentUser?.id ?? "",
    participantesIds:
      event?.participantes
        .filter((participant) => !participant.userId.startsWith("externo-"))
        .map((participant) => participant.userId) ?? [],
    participanteOutro: customParticipants,
    lembreteAtivo: Boolean(internalReminder),
    lembreteMin: knownReminder ? String(reminderValue) : "-1",
    lembretePersonalizado: knownReminder ? "45" : String(reminderValue),
    emailAtivo:
      event?.lembretes.some((reminder) => reminder.tipo === "email" && reminder.ativo) ?? false,
    whatsappAtivo:
      event?.lembretes.some((reminder) => reminder.tipo === "whatsapp" && reminder.ativo) ?? false,
    observacoes: event?.observacoes ?? "",
    checklist: event?.checklist.length
      ? event.checklist.map((item) => ({ ...item }))
      : checklistSeed.map((label, index) => ({ id: `check-${index}`, label, done: false })),
  };
}

function FormSection({
  step,
  title,
  description,
  children,
  className,
}: {
  step: string;
  title: string;
  description: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-3xl border border-white/55 bg-white/42 p-4 shadow-sm shadow-stone-950/5",
        className,
      )}
    >
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

function ToggleLine({
  checked,
  onCheckedChange,
  label,
  detail,
  future,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  detail?: string;
  future?: boolean;
}) {
  return (
    <label className="flex items-center gap-3 rounded-2xl bg-white/55 px-3 py-2.5 ring-1 ring-white/65">
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-foreground/72">{label}</span>
        {detail && <span className="block text-[9px] text-foreground/42">{detail}</span>}
      </span>
      {future && (
        <span className="rounded-full bg-orange-400/14 px-2 py-1 text-[8px] font-bold uppercase tracking-wider text-orange-800">
          Futuro
        </span>
      )}
    </label>
  );
}

function FutureNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-dashed border-teal-700/20 bg-teal-700/6 px-3 py-2 text-[10px] text-teal-900/65">
      <BellRing className="size-3.5" />
      {children}
    </div>
  );
}

function QuickAction({
  label,
  icon: Icon,
  onClick,
  active,
  danger,
}: {
  label: string;
  icon: typeof Check;
  onClick: () => void;
  active: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[10px] font-semibold transition",
        active
          ? danger
            ? "bg-rose-600 text-white"
            : "bg-teal-700 text-white"
          : "bg-white/70 text-foreground/55 hover:text-foreground",
      )}
    >
      <Icon className="size-3" />
      {label}
    </button>
  );
}

function inputClass(error?: string) {
  return cn(
    "w-full rounded-2xl border bg-white/74 px-3 py-3 text-sm text-foreground outline-none transition disabled:cursor-not-allowed",
    "placeholder:text-foreground/35 focus:border-teal-700/45 focus:ring-4 focus:ring-teal-700/10",
    error ? "border-destructive/35" : "border-white/65",
  );
}

function nextRoundedHour() {
  const date = new Date();
  date.setMinutes(0, 0, 0);
  date.setHours(date.getHours() + 1);
  return date;
}

function localDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function localTime(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function localToIso(date: string, time: string) {
  const value = new Date(`${date}T${time || "00:00"}:00`);
  return Number.isNaN(value.getTime()) ? "" : value.toISOString();
}

function minutesBetween(start: string, end: string) {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000);
}

function addMinutesIso(start: string, minutes: number) {
  return new Date(new Date(start).getTime() + minutes * 60_000).toISOString();
}

function optional(value: string) {
  const trimmed = value.trim();
  return trimmed || undefined;
}
