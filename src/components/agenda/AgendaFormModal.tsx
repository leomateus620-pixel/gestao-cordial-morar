import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  Mail,
  Plus,
  RefreshCcw,
  Save,
  Trash2,
  UserRoundCheck,
  X,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { agendaTitleSuggestion, validateAgendaEvent } from "@/services/agenda";
import { listAgendaAttendanceOptions } from "@/lib/agenda/agenda.functions";
import {
  agendaImobiliariaOptions,
  agendaPrioridadeOptions,
  agendaStatusOptions,
  agendaTipoOptions,
  type AgendaChecklistItem,
  type AgendaEvent,
  type AgendaEventInput,
  type AgendaGuest,
  type AgendaImobiliaria,
  type AgendaPrioridade,
  type AgendaStatus,
  type AgendaTipo,
} from "@/types/agenda";
import { cn } from "@/lib/utils";

type NamedOption = { id: string; nome: string };

type FormState = {
  tipo: AgendaTipo;
  titulo: string;
  descricao: string;
  data: string;
  horaInicio: string;
  horaFim: string;
  status: AgendaStatus;
  prioridade: AgendaPrioridade;
  clienteId: string;
  atendimentoId: string;
  imovelNome: string;
  imovelEndereco: string;
  imovelDescricao: string;
  imobiliaria: AgendaImobiliaria;
  responsavelPrincipalId: string;
  participantesIds: string[];
  participanteOutro: string;
  observacoes: string;
  checklist: AgendaChecklistItem[];
  convidados: AgendaGuest[];
  convidadoEmailInput: string;
  convidadoNomeInput: string;
};

const checklistSeed = ["Confirmar com o cliente", "Enviar endereço", "Levar documentos"];

const STEPS = [
  "Tipo e título",
  "Data e horário",
  "Vínculos e imóvel",
  "Responsáveis",
  "Convidados",
  "Checklist",
];

export function AgendaFormModal({
  open,
  event,
  onOpenChange,
  onSubmit,
  onDelete,
  canEdit,
  clients,
  people,
  currentUser,
}: {
  open: boolean;
  event?: AgendaEvent;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: AgendaEventInput) => void;
  onDelete?: (event: AgendaEvent) => Promise<void> | void;
  canEdit: boolean;
  clients: NamedOption[];
  people: NamedOption[];
  currentUser?: NamedOption;
}) {
  const [form, setForm] = useState<FormState>(() => initialForm(undefined, currentUser));
  const [errors, setErrors] = useState<ReturnType<typeof validateAgendaEvent>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mounted, setMounted] = useState(open);
  const [guestEmailError, setGuestEmailError] = useState<string | undefined>();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);


  const { data: attendanceOptions = [] } = useQuery({
    queryKey: ["agenda", "attendance-options"],
    queryFn: () => listAgendaAttendanceOptions(),
    enabled: open,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setForm(initialForm(event, currentUser));
    setErrors({});
  }, [currentUser, event, open]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open && mounted && !closing) {
      setClosing(true);
      const timer = window.setTimeout(() => setMounted(false), 200);
      return () => window.clearTimeout(timer);
    }
  }, [open, mounted, closing]);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    function onKey(keyEvent: KeyboardEvent) {
      if (keyEvent.key === "Escape") requestClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selectedClient = clients.find((client) => client.id === form.clienteId);
  const responsibleName =
    people.find((person) => person.id === form.responsavelPrincipalId)?.nome ??
    currentUser?.nome ??
    event?.responsavelPrincipalNome ??
    "Você";
  const hasErrors = Object.keys(errors).length > 0;
  const isEditing = Boolean(event);

  const selectedParticipants = useMemo(
    () => people.filter((person) => form.participantesIds.includes(person.id)),
    [form.participantesIds, people],
  );

  if (!mounted || typeof document === "undefined") return null;

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
        current.imovelNome || current.imovelDescricao,
      );
      const nextSuggestion = agendaTitleSuggestion(
        tipo,
        selectedClient?.nome,
        current.imovelNome || current.imovelDescricao,
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

  function updateAttendance(atendimentoId: string) {
    const attendance = attendanceOptions.find((item) => item.id === atendimentoId);
    setForm((current) => ({
      ...current,
      atendimentoId,
      imovelNome:
        current.imovelNome || attendance?.imovelCodigo || attendance?.imovelDescricao || "",
      imovelDescricao: current.imovelDescricao || attendance?.imovelDescricao || "",
      titulo:
        !isEditing && !current.titulo.trim() && attendance?.clienteNome
          ? agendaTitleSuggestion(current.tipo, attendance.clienteNome, attendance.imovelDescricao)
          : current.titulo,
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
      checklist: [
        ...current.checklist,
        {
          id: `check-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          label: "",
          done: false,
        },
      ],
    }));
  }

  function removeChecklistItem(id: string) {
    setForm((current) => ({
      ...current,
      checklist: current.checklist.filter((item) => item.id !== id),
    }));
  }

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  function addGuest() {
    const email = form.convidadoEmailInput.trim().toLowerCase();
    const nome = form.convidadoNomeInput.trim();
    if (!email) return setGuestEmailError("Informe um e-mail.");
    if (!EMAIL_RE.test(email)) return setGuestEmailError("E-mail inválido.");
    if (form.convidados.some((guest) => guest.email === email))
      return setGuestEmailError("E-mail já adicionado.");
    setGuestEmailError(undefined);
    setForm((current) => ({
      ...current,
      convidados: [
        ...current.convidados,
        { email, nome: nome || undefined, responseStatus: "needsAction" },
      ],
      convidadoEmailInput: "",
      convidadoNomeInput: "",
    }));
  }

  function removeGuest(email: string) {
    setForm((current) => ({
      ...current,
      convidados: current.convidados.filter((guest) => guest.email !== email),
    }));
  }

  async function submit(submitEvent: FormEvent) {
    submitEvent.preventDefault();
    if (!canEdit) return;
    const input = buildInput(form, selectedClient, responsibleName, selectedParticipants);
    const validation = validateAgendaEvent(input);
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setSaving(true);
    setSubmitError(null);
    try {
      await Promise.resolve(onSubmit(input));
      requestClose();
    } catch (error) {
      // mantém o formulário aberto e mostra o motivo real da falha
      setSubmitError(
        error instanceof Error && error.message
          ? error.message
          : "Não foi possível salvar o compromisso. Tente novamente.",
      );
    } finally {
      setSaving(false);
    }
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
          "sm:h-auto sm:max-h-[92vh] sm:max-w-[920px] sm:rounded-[2rem] sm:bg-background/96 sm:backdrop-blur-xl",
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
                Preencha o essencial: horário, imóvel e quem participa. Os lembretes são automáticos
                (1 dia, 1 hora e 30 minutos antes).
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

          <div className="no-scrollbar mt-3 flex gap-1.5 overflow-x-auto sm:mt-4">
            {STEPS.map((section, index) => (
              <span
                key={section}
                className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/65 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.08em] text-foreground/55"
              >
                <span className="grid size-4 place-items-center rounded-full bg-teal-700 text-[8px] text-white">
                  {index + 1}
                </span>
                {section}
              </span>
            ))}
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
                  onChange={(inputEvent) => updateType(inputEvent.target.value as AgendaTipo)}
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
                  onChange={(inputEvent) => update("titulo", inputEvent.target.value)}
                  className={inputClass(errors.titulo)}
                  placeholder="Ex.: Visita ao imóvel do Centro"
                  required
                />
              </Field>
              <Field label="Descrição curta">
                <textarea
                  value={form.descricao}
                  onChange={(inputEvent) => update("descricao", inputEvent.target.value)}
                  className={cn(inputClass(), "min-h-20 resize-none leading-5")}
                  placeholder="Objetivo e contexto rápido para quem participar."
                />
              </Field>
            </FormSection>

            <FormSection
              step="2"
              title="Data e horário"
              description="Informe o início e o fim. A duração é calculada automaticamente."
            >
              <Field label="Data" error={errors.inicio}>
                <input
                  type="date"
                  value={form.data}
                  onChange={(inputEvent) => update("data", inputEvent.target.value)}
                  className={inputClass(errors.inicio)}
                  required
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Início" error={errors.inicio}>
                  <input
                    type="time"
                    value={form.horaInicio}
                    onChange={(inputEvent) => update("horaInicio", inputEvent.target.value)}
                    className={inputClass(errors.inicio)}
                    required
                  />
                </Field>
                <Field label="Fim" error={errors.fim}>
                  <input
                    type="time"
                    value={form.horaFim}
                    onChange={(inputEvent) => update("horaFim", inputEvent.target.value)}
                    className={inputClass(errors.fim)}
                    required
                  />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Status">
                  <select
                    value={form.status}
                    onChange={(inputEvent) =>
                      update("status", inputEvent.target.value as AgendaStatus)
                    }
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
                    onChange={(inputEvent) =>
                      update("prioridade", inputEvent.target.value as AgendaPrioridade)
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
            </FormSection>

            <FormSection
              step="3"
              title="Vínculos e imóvel"
              description="Vincule um atendimento real e cadastre o imóvel do compromisso."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Cliente vinculado">
                  <select
                    value={form.clienteId}
                    onChange={(inputEvent) => updateClient(inputEvent.target.value)}
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
                    onChange={(inputEvent) => updateAttendance(inputEvent.target.value)}
                    className={inputClass()}
                  >
                    <option value="">Sem atendimento vinculado</option>
                    {attendanceOptions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {[item.clienteNome, item.finalidade, item.corretorNome]
                          .filter(Boolean)
                          .join(" · ")}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Nome / referência do imóvel">
                  <input
                    value={form.imovelNome}
                    onChange={(inputEvent) => update("imovelNome", inputEvent.target.value)}
                    className={inputClass()}
                    placeholder="Ex.: Residencial Aurora — Apto 302"
                  />
                </Field>
                <Field label="Endereço do imóvel">
                  <input
                    value={form.imovelEndereco}
                    onChange={(inputEvent) => update("imovelEndereco", inputEvent.target.value)}
                    className={inputClass()}
                    placeholder="Rua, número, bairro"
                  />
                </Field>
              </div>
              <Field label="Descrição do imóvel">
                <input
                  value={form.imovelDescricao}
                  onChange={(inputEvent) => update("imovelDescricao", inputEvent.target.value)}
                  className={inputClass()}
                  placeholder="Características, andar, ponto de referência"
                />
              </Field>
              <Field label="Imobiliária">
                <select
                  value={form.imobiliaria}
                  onChange={(inputEvent) =>
                    update("imobiliaria", inputEvent.target.value as AgendaImobiliaria)
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
              description="O responsável principal é quem está criando o compromisso."
            >
              <Field label="Responsável principal">
                <div className="flex items-center gap-2 rounded-2xl border border-white/65 bg-white/60 px-3 py-3 text-sm font-medium text-foreground/75">
                  <UserRoundCheck className="size-4 text-teal-700" />
                  {responsibleName}
                </div>
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
                  onChange={(inputEvent) => update("participanteOutro", inputEvent.target.value)}
                  className={inputClass()}
                  placeholder="Nome de participante externo"
                />
              </Field>
            </FormSection>

            <FormSection
              step="5"
              title="Convidados externos"
              description="O Google Agenda envia o convite por e-mail e cria o evento na agenda de cada convidado."
              className="lg:col-span-2"
            >
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <input
                  type="email"
                  value={form.convidadoEmailInput}
                  onChange={(inputEvent) => update("convidadoEmailInput", inputEvent.target.value)}
                  className={inputClass(guestEmailError)}
                  placeholder="email@exemplo.com"
                  onKeyDown={(keyEvent) => {
                    if (keyEvent.key === "Enter") {
                      keyEvent.preventDefault();
                      addGuest();
                    }
                  }}
                />
                <input
                  value={form.convidadoNomeInput}
                  onChange={(inputEvent) => update("convidadoNomeInput", inputEvent.target.value)}
                  className={inputClass()}
                  placeholder="Nome (opcional)"
                  onKeyDown={(keyEvent) => {
                    if (keyEvent.key === "Enter") {
                      keyEvent.preventDefault();
                      addGuest();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={addGuest}
                  className="flex items-center justify-center gap-2 rounded-2xl bg-teal-700 px-4 py-3 text-xs font-semibold text-white shadow-md shadow-teal-900/15 transition hover:bg-teal-800 active:scale-[0.98]"
                >
                  <Plus className="size-3.5" /> Adicionar
                </button>
              </div>
              {guestEmailError && (
                <p className="text-[11px] font-medium text-destructive">{guestEmailError}</p>
              )}
              {form.convidados.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {form.convidados.map((guest) => (
                    <span
                      key={guest.email}
                      className="inline-flex items-center gap-2 rounded-full bg-white/72 px-3 py-1.5 text-[11px] font-medium text-foreground/78 shadow-sm ring-1 ring-teal-700/15"
                    >
                      <Mail className="size-3 text-teal-700" />
                      <span className="max-w-[200px] truncate">
                        {guest.nome ? `${guest.nome} · ` : ""}
                        {guest.email}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeGuest(guest.email)}
                        className="text-foreground/35 transition hover:text-rose-600"
                        aria-label={`Remover ${guest.email}`}
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] leading-5 text-foreground/52">
                  Nenhum convidado adicionado. O convite sai da conta Google do responsável.
                </p>
              )}
            </FormSection>

            <FormSection
              step="6"
              title="Checklist e observações"
              description="Itens rápidos de preparação. Os lembretes são automáticos."
              className="lg:col-span-2"
            >
              <div className="grid gap-4 lg:grid-cols-2">
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
                          onChange={(inputEvent) =>
                            updateChecklist(item.id, { label: inputEvent.target.value })
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
                <Field label="Observações internas">
                  <textarea
                    value={form.observacoes}
                    onChange={(inputEvent) => update("observacoes", inputEvent.target.value)}
                    className={cn(inputClass(), "min-h-32 resize-none leading-5")}
                    placeholder="Informações úteis apenas para a equipe."
                  />
                </Field>
              </div>
            </FormSection>
          </fieldset>
        </div>

        {submitError && (
          <div
            role="alert"
            className="border-t border-rose-200/70 bg-rose-50/90 px-4 py-2.5 text-xs font-medium text-rose-800 sm:px-6"
          >
            {submitError}
          </div>
        )}

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
              <div className="flex flex-wrap items-center gap-1.5">
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
  responsibleName: string,
  participants: NamedOption[],
): AgendaEventInput {
  const inicio = localToIso(form.data, form.horaInicio);
  const fim = form.horaFim ? localToIso(form.data, form.horaFim) : addMinutesIso(inicio, 60);
  const customParticipant = form.participanteOutro.trim();

  return {
    titulo: form.titulo.trim(),
    descricao: optional(form.descricao),
    tipo: form.tipo,
    status: form.status,
    prioridade: form.prioridade,
    inicio,
    fim,
    duracaoMin: Math.max(1, minutesBetween(inicio, fim)),
    diaInteiro: false,
    repeticao: "nao",
    imobiliaria: form.imobiliaria,
    clienteId: optional(form.clienteId),
    clienteNome: client?.nome,
    atendimentoId: optional(form.atendimentoId),
    imovelNome: optional(form.imovelNome),
    imovelEndereco: optional(form.imovelEndereco),
    imovelDescricao: optional(form.imovelDescricao) ?? optional(form.imovelNome),
    local: optional(form.imovelEndereco),
    responsavelPrincipalId: optional(form.responsavelPrincipalId),
    responsavelPrincipalNome: responsibleName,
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
    // Lembretes são criados automaticamente pelo banco (1 dia, 1 hora e 30 min antes).
    lembretes: [],
    checklist: form.checklist
      .filter((item) => item.label.trim())
      .map((item) => ({ ...item, label: item.label.trim() })),
    observacoes: optional(form.observacoes),
    convidados: form.convidados.map((guest) => ({
      email: guest.email.trim().toLowerCase(),
      nome: guest.nome?.trim() || undefined,
      responseStatus: guest.responseStatus ?? "needsAction",
    })),
    googleCalendarSyncStatus: "preparado",
  };
}

function initialForm(event: AgendaEvent | undefined, currentUser?: NamedOption): FormState {
  const start = event ? new Date(event.inicio) : nextRoundedHour();
  const end = event?.fim ? new Date(event.fim) : new Date(start.getTime() + 60 * 60_000);
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
    status: event?.status ?? "agendado",
    prioridade: event?.prioridade ?? "media",
    clienteId: event?.clienteId ?? "",
    atendimentoId: event?.atendimentoId ?? "",
    imovelNome: event?.imovelNome ?? "",
    imovelEndereco: event?.imovelEndereco ?? event?.local ?? "",
    imovelDescricao: event?.imovelDescricao ?? "",
    imobiliaria: event?.imobiliaria ?? "cordial",
    responsavelPrincipalId: event?.responsavelPrincipalId ?? currentUser?.id ?? "",
    participantesIds:
      event?.participantes
        .filter((participant) => !participant.userId.startsWith("externo-"))
        .map((participant) => participant.userId) ?? [],
    participanteOutro: customParticipants,
    observacoes: event?.observacoes ?? "",
    checklist: event?.checklist.length
      ? event.checklist.map((item) => ({ ...item }))
      : checklistSeed.map((label, index) => ({ id: `check-${index}`, label, done: false })),
    convidados: event?.convidados ? event.convidados.map((guest) => ({ ...guest })) : [],
    convidadoEmailInput: "",
    convidadoNomeInput: "",
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
