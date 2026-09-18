import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Camera,
  CircleAlert,
  ExternalLink,
  ImagePlus,
  Link2,
  Loader2,
  MapPin,
  RefreshCcw,
  Save,
  Trash2,
  UserRoundCheck,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  addAgendaLink,
  clearAgendaReference,
  listAgendaAttachments,
  registerAgendaPhoto,
  signAgendaAttachmentUrls,
} from "@/lib/agenda/agenda-attachments.functions";
import { validateAgendaEvent } from "@/services/agenda";
import {
  agendaPrioridadeOptions,
  agendaStatusOptions,
  type AgendaEvent,
  type AgendaEventInput,
  type AgendaPrioridade,
  type AgendaStatus,
} from "@/types/agenda";
import { cn } from "@/lib/utils";

const BUCKET = "agenda-attachments";
const MAX_BYTES = 25 * 1024 * 1024;
const STEPS = ["Dados", "Data e horário", "Imóvel"];

type FormState = {
  titulo: string;
  data: string;
  horaInicio: string;
  status: AgendaStatus;
  prioridade: AgendaPrioridade;
  link: string;
  endereco: string;
};

export function AgendaPhotoFormModal({
  open,
  event,
  onOpenChange,
  onSubmit,
  onDelete,
  canEdit,
  currentUser,
}: {
  open: boolean;
  event?: AgendaEvent;
  onOpenChange: (open: boolean) => void;
  /** Cria/atualiza o compromisso e devolve o registro salvo (precisamos do id). */
  onSubmit: (input: AgendaEventInput) => Promise<AgendaEvent | undefined> | AgendaEvent | undefined;
  onDelete?: (event: AgendaEvent) => Promise<void> | void;
  canEdit: boolean;
  currentUser?: { id: string; nome: string };
}) {
  const queryClient = useQueryClient();
  const loadAttachments = useServerFn(listAgendaAttachments);
  const signUrls = useServerFn(signAgendaAttachmentUrls);
  const savePhoto = useServerFn(registerAgendaPhoto);
  const saveLink = useServerFn(addAgendaLink);
  const clearRef = useServerFn(clearAgendaReference);

  const [form, setForm] = useState<FormState>(() => initialForm(event));
  const [errors, setErrors] = useState<ReturnType<typeof validateAgendaEvent>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [stage, setStage] = useState<"idle" | "saving" | "uploading">("idle");
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [removedPhoto, setRemovedPhoto] = useState(false);
  const [dragging, setDragging] = useState(false);
  /** Evita criar um segundo compromisso quando só o upload falhou. */
  const savedEventId = useRef<string | undefined>(event?.id);

  const isEditing = Boolean(event);
  const eventId = event?.id;

  const referenceQuery = useQuery({
    queryKey: ["agenda", "attachments", eventId ?? "novo"],
    queryFn: () => loadAttachments({ data: { eventId: eventId! } }),
    enabled: open && Boolean(eventId),
    staleTime: 30_000,
  });
  const references = (referenceQuery.data ?? []).filter(
    (item) => item.purpose === "property_reference",
  );
  const existingPhoto = references.find((item) => item.kind === "foto");
  const existingLink = references.find((item) => item.kind === "link");

  const photoUrlQuery = useQuery({
    queryKey: ["agenda", "attachments", "urls", existingPhoto?.filePath ?? ""],
    queryFn: () => signUrls({ data: { paths: [existingPhoto!.filePath as string] } }),
    enabled: Boolean(existingPhoto?.filePath) && !removedPhoto,
    staleTime: 10 * 60_000,
  });
  const existingPhotoUrl = existingPhoto?.filePath
    ? photoUrlQuery.data?.[existingPhoto.filePath]
    : undefined;

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setForm(initialForm(event));
    setErrors({});
    setSubmitError(null);
    setPhotoError(null);
    setFile(null);
    setLocalPreview(null);
    setRemovedPhoto(false);
    setConfirmingDelete(false);
    savedEventId.current = event?.id;
  }, [event, open]);

  // Preenche o link já salvo quando os anexos chegam (somente na edição).
  useEffect(() => {
    if (!open || !existingLink?.url) return;
    setForm((current) => (current.link ? current : { ...current, link: existingLink.url ?? "" }));
  }, [existingLink?.url, open]);

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

  useEffect(
    () => () => {
      if (localPreview) URL.revokeObjectURL(localPreview);
    },
    [localPreview],
  );

  const responsibleName =
    (isEditing ? event?.responsavelPrincipalNome : currentUser?.nome) ??
    currentUser?.nome ??
    "Você";
  const linkValid = isHttpUrl(form.link);
  const summary = useMemo(() => {
    const [year, month, day] = form.data.split("-");
    const quando = year && month && day ? `${day}/${month} às ${form.horaInicio || "--:--"}` : "";
    return ["Fotos de imóveis", quando, form.endereco.trim(), responsibleName]
      .filter(Boolean)
      .join(" · ");
  }, [form.data, form.endereco, form.horaInicio, responsibleName]);

  if (!mounted || typeof document === "undefined") return null;

  function requestClose() {
    if (closing || stage !== "idle") return;
    setClosing(true);
    window.setTimeout(() => onOpenChange(false), 170);
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function pickFile(next: File | null) {
    setPhotoError(null);
    if (!next) return;
    if (!next.type.startsWith("image/")) {
      setPhotoError("Escolha um arquivo de imagem.");
      return;
    }
    if (next.size > MAX_BYTES) {
      setPhotoError("A imagem passa de 25 MB.");
      return;
    }
    if (localPreview) URL.revokeObjectURL(localPreview);
    setFile(next);
    setLocalPreview(URL.createObjectURL(next));
    setRemovedPhoto(false);
  }

  function removePhoto() {
    if (localPreview) URL.revokeObjectURL(localPreview);
    setFile(null);
    setLocalPreview(null);
    setPhotoError(null);
    if (existingPhoto) setRemovedPhoto(true);
  }

  function onDrop(dropEvent: DragEvent<HTMLDivElement>) {
    dropEvent.preventDefault();
    setDragging(false);
    pickFile(dropEvent.dataTransfer.files?.[0] ?? null);
  }

  /** Grava link e foto de referência já com o compromisso existente. */
  async function persistReferences(id: string) {
    const trimmed = form.link.trim();
    if (trimmed && trimmed !== (existingLink?.url ?? "")) {
      await saveLink({ data: { eventId: id, url: trimmed, purpose: "property_reference" } });
    } else if (!trimmed && existingLink) {
      await clearRef({ data: { eventId: id, kind: "link" } });
    }

    if (file) {
      setStage("uploading");
      const path = `${id}/${crypto.randomUUID()}-${safeName(file.name)}`;
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw new Error(uploadError.message);
      await savePhoto({
        data: {
          eventId: id,
          filePath: path,
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          purpose: "property_reference",
        },
      });
    } else if (removedPhoto && existingPhoto) {
      await clearRef({ data: { eventId: id, kind: "foto" } });
    }
    await queryClient.invalidateQueries({ queryKey: ["agenda", "attachments"] });
  }

  async function submit(submitEvent: FormEvent) {
    submitEvent.preventDefault();
    if (!canEdit || stage !== "idle") return;
    const input = buildInput(form, event, currentUser, responsibleName);
    const validation = validateAgendaEvent(input);
    if (form.link.trim() && !linkValid) {
      validation.local = "Use um link começando com http:// ou https://";
    }
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setStage("saving");
    setSubmitError(null);
    setPhotoError(null);
    try {
      let id = savedEventId.current;
      // Retry após falha de imagem: o compromisso já existe, não criamos outro.
      if (!id || isEditing) {
        const saved = await Promise.resolve(onSubmit(input));
        id = saved?.id ?? id;
        savedEventId.current = id;
      }
      if (!id) throw new Error("Não foi possível identificar o compromisso salvo.");
      await persistReferences(id);
      setStage("idle");
      requestClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao salvar.";
      if (savedEventId.current && !isEditing) {
        setSubmitError(
          `Agendamento criado, mas não foi possível salvar a imagem. Tente novamente. (${message})`,
        );
      } else {
        setSubmitError(message);
      }
      setStage("idle");
    }
  }

  async function handleDelete() {
    if (!event || !onDelete || deleting) return;
    setDeleting(true);
    setSubmitError(null);
    try {
      await Promise.resolve(onDelete(event));
      setConfirmingDelete(false);
      requestClose();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Não foi possível excluir.");
    } finally {
      setDeleting(false);
    }
  }

  const previewSrc = localPreview ?? (removedPhoto ? null : existingPhotoUrl) ?? null;
  const previewName = file?.name ?? (removedPhoto ? undefined : existingPhoto?.fileName ?? undefined);
  const busy = stage !== "idle";

  return createPortal(
    <div
      className={cn(
        "agenda-modal-backdrop fixed inset-0 z-50 flex items-end justify-center bg-stone-950/52 p-0 sm:items-center sm:bg-stone-950/34 sm:p-5 sm:backdrop-blur-sm",
        closing && "agenda-modal-backdrop--closing",
      )}
    >
      <button
        type="button"
        aria-label="Fechar sessão de fotos"
        className="absolute inset-0 cursor-default"
        onClick={requestClose}
      />

      <form
        onSubmit={submit}
        className={cn(
          "agenda-form-modal relative flex h-dvh max-h-dvh w-full flex-col overflow-hidden border border-white/65 bg-background shadow-2xl shadow-stone-950/25",
          "sm:h-auto sm:max-h-[92vh] sm:max-w-[900px] sm:rounded-[2rem] sm:bg-background/96 sm:backdrop-blur-xl",
          closing && "agenda-form-modal--closing",
        )}
      >
        <header className="border-b border-white/55 bg-white/62 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 sm:px-6 sm:py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-500/12 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-violet-800">
                <Camera className="size-3.5" />
                Fotos de imóveis
              </span>
              <h2 className="mt-1.5 text-lg font-semibold tracking-tight sm:text-xl">
                {isEditing ? "Sessão de fotos" : "Nova sessão de fotos"}
              </h2>
              <p className="mt-1 text-xs leading-5 text-foreground/58">
                Defina horário, endereço e a referência do imóvel.
              </p>
              {summary && (
                <p className="mt-1.5 truncate text-[11px] font-semibold text-teal-900/80">
                  {summary}
                </p>
              )}
            </div>
            <button
              type="button"
              aria-label="Fechar"
              onClick={requestClose}
              className="grid size-11 shrink-0 place-items-center rounded-full bg-white/72 text-foreground/65 shadow-sm transition duration-200 hover:text-foreground active:scale-95"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="no-scrollbar mt-3 flex gap-1.5 overflow-x-auto">
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
              Somente administradores, o criador, o responsável ou um participante podem editar esta
              sessão.
            </div>
          )}

          <fieldset disabled={!canEdit || busy} className="space-y-4 disabled:opacity-75">
            <div className="grid gap-4 lg:grid-cols-2">
              <Section step="1" title="Dados" description="Identificação rápida da sessão.">
                <Field label="Título" error={errors.titulo}>
                  <input
                    value={form.titulo}
                    onChange={(inputEvent) => update("titulo", inputEvent.target.value)}
                    className={inputClass(errors.titulo)}
                    placeholder="Ex.: Fotos casa Bairro Cruzeiro"
                    required
                  />
                </Field>
                <p className="flex items-center gap-1.5 rounded-2xl bg-white/60 px-3 py-2 text-[11px] leading-5 text-foreground/60">
                  <UserRoundCheck className="size-3.5 shrink-0 text-teal-700" />
                  <span className="min-w-0">
                    Responsável: <strong className="font-semibold">{responsibleName}</strong>
                    <span className="ml-1 text-foreground/45">· Definido automaticamente</span>
                  </span>
                </p>
              </Section>

              <Section
                step="2"
                title="Data e horário"
                description="Duração e lembretes seguem automáticos."
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Data" error={errors.inicio}>
                    <input
                      type="date"
                      value={form.data}
                      onChange={(inputEvent) => update("data", inputEvent.target.value)}
                      className={inputClass(errors.inicio)}
                      required
                    />
                  </Field>
                  <Field label="Horário de início">
                    <input
                      type="time"
                      value={form.horaInicio}
                      onChange={(inputEvent) => update("horaInicio", inputEvent.target.value)}
                      className={inputClass()}
                      required
                    />
                  </Field>
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
              </Section>
            </div>

            <Section
              step="3"
              title="Referência do imóvel"
              description="Link, foto/print e endereço — visíveis somente aqui no Gestão."
            >
              <div className="grid gap-3 lg:grid-cols-2">
                <div className="space-y-3">
                  <Field label="Link do imóvel" error={errors.local}>
                    <input
                      value={form.link}
                      onChange={(inputEvent) => update("link", inputEvent.target.value)}
                      className={inputClass(errors.local)}
                      placeholder="https://..."
                      inputMode="url"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                  </Field>
                  {linkValid && (
                    <a
                      href={form.link.trim()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-teal-800 transition duration-200 hover:underline"
                    >
                      <ExternalLink className="size-3.5" />
                      Abrir link
                    </a>
                  )}

                  <Field label="Endereço do imóvel">
                    <input
                      value={form.endereco}
                      onChange={(inputEvent) => update("endereco", inputEvent.target.value)}
                      className={inputClass()}
                      placeholder="Rua, número, bairro ou ponto de referência"
                    />
                  </Field>
                  <p className="flex items-center gap-1.5 text-[10.5px] text-foreground/45">
                    <MapPin className="size-3.5 shrink-0 text-teal-700/60" />
                    O endereço aparece no card da agenda.
                  </p>
                </div>

                <div className="space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-foreground/52">
                    Foto ou print do imóvel
                  </span>
                  {previewSrc ? (
                    <div className="overflow-hidden rounded-2xl border border-white/65 bg-white/60">
                      <img
                        src={previewSrc}
                        alt={previewName ?? "Referência do imóvel"}
                        className="aspect-video w-full object-cover"
                      />
                      <div className="flex items-center gap-2 px-3 py-2">
                        <span className="min-w-0 flex-1 truncate text-[11px] text-foreground/60">
                          {stage === "uploading"
                            ? "Salvando imagem..."
                            : (previewName ?? "Imagem de referência")}
                        </span>
                        <label className="cursor-pointer rounded-full bg-white/80 px-2.5 py-1.5 text-[10px] font-bold text-teal-800 transition duration-200 hover:bg-white">
                          Trocar
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(inputEvent) =>
                              pickFile(inputEvent.target.files?.[0] ?? null)
                            }
                          />
                        </label>
                        <button
                          type="button"
                          onClick={removePhoto}
                          className="grid size-8 place-items-center rounded-full text-foreground/45 transition duration-200 hover:text-rose-600"
                          aria-label="Remover imagem"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      onDragOver={(dragEvent) => {
                        dragEvent.preventDefault();
                        setDragging(true);
                      }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={onDrop}
                    >
                      <label
                        className={cn(
                          "flex aspect-video cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed bg-white/55 text-center transition duration-200",
                          dragging
                            ? "border-teal-700/60 bg-white/75"
                            : "border-teal-700/30 hover:bg-white/70",
                        )}
                      >
                        <ImagePlus className="size-5 text-teal-700" />
                        <span className="text-xs font-semibold text-teal-800">
                          Adicionar foto ou print
                        </span>
                        <span className="text-[10.5px] text-foreground/45">
                          Clique, arraste ou use a câmera
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(inputEvent) => pickFile(inputEvent.target.files?.[0] ?? null)}
                        />
                      </label>
                    </div>
                  )}
                  {photoError && (
                    <p role="alert" className="text-[11px] font-medium text-destructive">
                      {photoError}
                    </p>
                  )}
                </div>
              </div>
            </Section>
          </fieldset>

          {submitError && (
            <p
              role="alert"
              className="mt-4 flex items-start gap-2 rounded-2xl border border-destructive/20 bg-destructive/8 px-4 py-3 text-xs font-medium text-destructive"
            >
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              {submitError}
            </p>
          )}
        </div>

        <footer className="flex items-center gap-2 border-t border-white/55 bg-white/62 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
          {isEditing && onDelete && canEdit && (
            <button
              type="button"
              onClick={() => (confirmingDelete ? handleDelete() : setConfirmingDelete(true))}
              disabled={deleting || busy}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-2.5 text-[11px] font-bold transition duration-200",
                confirmingDelete
                  ? "bg-rose-600 text-white"
                  : "bg-white/70 text-rose-700 hover:bg-white",
              )}
            >
              {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              {confirmingDelete ? "Confirmar exclusão" : "Excluir"}
            </button>
          )}
          <button
            type="button"
            onClick={requestClose}
            disabled={busy}
            className="ml-auto rounded-full px-3 py-2.5 text-[11px] font-semibold text-foreground/60 transition duration-200 hover:text-foreground"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!canEdit || busy}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-teal-700 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-teal-900/20 transition duration-200 hover:bg-teal-800 disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : submitError ? (
              <RefreshCcw className="size-4" />
            ) : (
              <Save className="size-4" />
            )}
            {busy
              ? stage === "uploading"
                ? "Salvando imagem..."
                : "Salvando..."
              : submitError
                ? "Tentar novamente"
                : isEditing
                  ? "Salvar alterações"
                  : "Agendar fotos"}
          </button>
        </footer>
      </form>
    </div>,
    document.body,
  );
}

function Section({
  step,
  title,
  description,
  children,
}: {
  step: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-white/55 bg-white/42 p-4 shadow-sm shadow-stone-950/5">
      <div className="mb-3.5 flex items-start gap-3">
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

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
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

function inputClass(error?: string) {
  return cn(
    "min-h-11 w-full rounded-2xl border bg-white/74 px-3 py-3 text-sm text-foreground outline-none transition duration-200 disabled:cursor-not-allowed",
    "placeholder:text-foreground/35 focus:border-teal-700/45 focus:ring-4 focus:ring-teal-700/10",
    error ? "border-destructive/35" : "border-white/65",
  );
}

function isHttpUrl(value: string) {
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    return Boolean(parsed.hostname.includes("."));
  } catch {
    return false;
  }
}

function safeName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .slice(-80);
}

function initialForm(event?: AgendaEvent): FormState {
  const start = event ? new Date(event.inicio) : nextRoundedHour();
  return {
    titulo: event?.titulo ?? "",
    data: localDate(start),
    horaInicio: localTime(start),
    status: event?.status ?? "agendado",
    prioridade: event?.prioridade ?? "media",
    link: "",
    endereco: event?.imovelEndereco ?? event?.local ?? "",
  };
}

function buildInput(
  form: FormState,
  event: AgendaEvent | undefined,
  currentUser: { id: string; nome: string } | undefined,
  responsibleName: string,
): AgendaEventInput {
  const inicio = localToIso(form.data, form.horaInicio);
  return {
    // O servidor fixa tipo/imobiliária/responsável para esta rota; enviamos coerente.
    tipo: event?.tipo === "video" ? "video" : "fotos",
    titulo: form.titulo.trim(),
    descricao: undefined,
    status: form.status,
    prioridade: form.prioridade,
    inicio,
    fim: inicio ? addMinutesIso(inicio, 60) : undefined,
    duracaoMin: 60,
    diaInteiro: false,
    repeticao: event?.repeticao ?? "nao",
    imobiliaria: "ambas",
    clienteId: event?.clienteId,
    clienteNome: event?.clienteNome,
    atendimentoId: event?.atendimentoId,
    imovelId: event?.imovelId,
    imovelNome: event?.imovelNome,
    imovelEndereco: form.endereco.trim() || undefined,
    imovelDescricao: event?.imovelDescricao,
    agenciamentoId: event?.agenciamentoId,
    local: form.endereco.trim() || undefined,
    responsavelPrincipalId: event?.responsavelPrincipalId ?? currentUser?.id,
    responsavelPrincipalNome: responsibleName,
    participantes: event?.participantes ?? [],
    convidados: event?.convidados ?? [],
    // Lembretes automáticos (1 dia, 1 hora e 30 min) são mantidos pelo servidor.
    lembretes: [],
    checklist: event?.checklist ?? [],
    observacoes: event?.observacoes,
    googleCalendarSyncStatus: "preparado",
  };
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

function addMinutesIso(start: string, minutes: number) {
  return new Date(new Date(start).getTime() + minutes * 60_000).toISOString();
}
