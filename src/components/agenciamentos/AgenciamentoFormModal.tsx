import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BadgeCheck,
  Building2,
  CalendarDays,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  Globe2,
  HardDrive,
  Link2,
  Loader2,
  LockKeyhole,
  Save,
  Signpost,
  UserRound,
  Video,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatPhoneBR,
  getAgenciamentoStatusLabel,
  getAgenciamentoTipoLabel,
  getChecklistCompletedCount,
  getChecklistCompletionPercent,
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

type CurrentUserBroker = {
  id: string;
  nome: string;
};

type AgenciamentoFormModalProps = {
  open: boolean;
  agenciamento?: Agenciamento | null;
  corretores: Corretor[];
  currentBroker?: Corretor;
  currentUserBroker?: CurrentUserBroker;
  canManage: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: AgenciamentoInput) => Promise<boolean | void> | boolean | void;
};

type FormStep = 0 | 1 | 2 | 3;
type ValidationKey = keyof AgenciamentoValidationErrors;

const steps: Array<{
  title: string;
  shortTitle: string;
  description: string;
  icon: LucideIcon;
}> = [
  { title: "Imóvel", shortTitle: "Imóvel", description: "Identificação e localização", icon: Building2 },
  { title: "Proprietário", shortTitle: "Proprietário", description: "Contato e observações", icon: UserRound },
  { title: "Responsabilidade", shortTitle: "Responsável", description: "Corretor, data e status", icon: CalendarDays },
  { title: "Checklist e revisão", shortTitle: "Checklist", description: "Pendências antes de salvar", icon: ClipboardCheck },
];

const stepFieldKeys: Record<FormStep, ValidationKey[]> = {
  0: ["tipoImovel", "imobiliaria", "endereco"],
  1: ["proprietarioNome", "proprietarioTelefone"],
  2: ["corretorId", "dataAgenciamento", "origem", "status"],
  3: ["permissaoValidacao"],
};

const fieldIds: Partial<Record<ValidationKey, string>> = {
  tipoImovel: "ag-tipo-imovel",
  imobiliaria: "ag-imobiliaria",
  endereco: "ag-endereco",
  proprietarioNome: "ag-proprietario-nome",
  proprietarioTelefone: "ag-proprietario-telefone",
  corretorId: "ag-corretor",
  dataAgenciamento: "ag-data",
  origem: "ag-origem",
  status: "ag-status",
};

const contactOptions: Array<{ value: AgenciamentoContatoPreferencial; label: string }> = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "ligacao", label: "Ligação" },
  { value: "email", label: "E-mail" },
];

const imobiliariaOptions: Array<{ value: AgenciamentoImobiliaria; label: string }> = [
  { value: "cordial", label: "Cordial" },
  { value: "morar", label: "Morar" },
  { value: "ambas", label: "Cordial + Morar" },
];

const checklistItems: Array<{ key: Exclude<keyof AgenciamentoChecklist, "validado">; label: string; helper: string; icon: LucideIcon }> = [
  { key: "fotosRealizadas", label: "Fotos realizadas", helper: "A sessão de fotos do imóvel foi concluída.", icon: Camera },
  { key: "fotosDrive", label: "Fotos enviadas ao Drive", helper: "Os arquivos estão disponíveis para a equipe.", icon: HardDrive },
  { key: "placaInstalada", label: "Placa instalada", helper: "O imóvel já está sinalizado no local.", icon: Signpost },
  { key: "cadastradoSite", label: "Imóvel cadastrado no site", helper: "O anúncio foi publicado na carteira digital.", icon: Globe2 },
  { key: "videoRealizado", label: "Vídeo realizado", helper: "O material em vídeo está pronto para uso.", icon: Video },
];

const inputBaseClassName =
  "h-11 w-full rounded-xl border bg-background px-3.5 text-sm text-foreground outline-none transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-muted-foreground focus:ring-2 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground";

const selectBaseClassName =
  "h-11 rounded-xl bg-background text-foreground shadow-none transition-[border-color,box-shadow,background-color] duration-150 focus:ring-2";

function toDateInput(value?: string) {
  if (!value) return new Date().toISOString().slice(0, 10);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function initialForm(agenciamento: Agenciamento | null | undefined, currentBroker?: Corretor, currentUserBroker?: CurrentUserBroker): FormState {
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
    corretorId: agenciamento?.corretorId ?? currentBroker?.id ?? currentUserBroker?.id ?? "",
    corretorNome: agenciamento?.corretorNome ?? currentBroker?.nome ?? currentUserBroker?.nome ?? "",
    dataAgenciamento: toDateInput(agenciamento?.dataAgenciamento),
    origem: agenciamento?.origem ?? "indicacao",
    status: agenciamento?.status ?? "novo",
    checklist: {
      fotosRealizadas: agenciamento?.checklist.fotosRealizadas ?? false,
      fotosDrive: agenciamento?.checklist.fotosDrive ?? false,
      placaInstalada: agenciamento?.checklist.placaInstalada ?? false,
      cadastradoSite: agenciamento?.checklist.cadastradoSite ?? false,
      videoRealizado: agenciamento?.checklist.videoRealizado ?? false,
      validado: agenciamento?.checklist.validado ?? false,
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
  currentUserBroker,
  canManage,
  onOpenChange,
  onSubmit,
}: AgenciamentoFormModalProps) {
  const initial = initialForm(agenciamento, currentBroker, currentUserBroker);
  const [form, setForm] = useState<FormState>(initial);
  const [initialValue, setInitialValue] = useState<FormState>(initial);
  const [step, setStep] = useState<FormStep>(0);
  const [furthestStep, setFurthestStep] = useState<FormStep>(0);
  const [errors, setErrors] = useState<AgenciamentoValidationErrors>({});
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [referencesOpen, setReferencesOpen] = useState(false);
  const isEditing = Boolean(agenciamento);

  useEffect(() => {
    if (!open) return;
    const next = initialForm(agenciamento, currentBroker, currentUserBroker);
    setForm(next);
    setInitialValue(next);
    setStep(0);
    setFurthestStep(0);
    setErrors({});
    setSubmitError(null);
    setSaving(false);
    setConfirmCloseOpen(false);
    setReferencesOpen(Boolean(next.driveFolderUrl || next.siteUrl || next.observacoesInternas));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, agenciamento?.id]);

  const selectedBroker = useMemo(() => corretores.find((corretor) => corretor.id === form.corretorId), [corretores, form.corretorId]);
  const isDirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initialValue), [form, initialValue]);
  const checklistCompleted = getChecklistCompletedCount(form.checklist);
  const checklistProgress = getChecklistCompletionPercent(form.checklist);
  const progress = ((step + 1) / steps.length) * 100;

  function requestClose() {
    if (saving) return;
    if (isDirty) {
      setConfirmCloseOpen(true);
      return;
    }
    onOpenChange(false);
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setSubmitError(null);
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function updateChecklist(key: keyof AgenciamentoChecklist, value: boolean) {
    if (key === "validado" && !canManage) return;
    setForm((current) => ({
      ...current,
      status: key === "validado" && value ? "validado" : current.status,
      checklist: { ...current.checklist, [key]: value },
    }));
    setSubmitError(null);
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
    setSubmitError(null);
  }

  function toInput(): AgenciamentoInput {
    const corretorNome = selectedBroker?.nome ?? form.corretorNome;
    const dataAgenciamento = form.dataAgenciamento ? new Date(`${form.dataAgenciamento}T12:00:00.000`).toISOString() : "";
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

  function validateStep(targetStep: FormStep) {
    const allErrors = validateAgenciamentoInput(toInput(), canManage);
    const nextErrors = selectErrors(allErrors, stepFieldKeys[targetStep]);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      focusFirstError(nextErrors);
      return false;
    }
    return true;
  }

  function continueForm() {
    if (step === 3 || !validateStep(step)) return;
    const next = (step + 1) as FormStep;
    setStep(next);
    setFurthestStep((current) => Math.max(current, next) as FormStep);
    setErrors({});
  }

  function previousStep() {
    if (step === 0) return;
    setStep((step - 1) as FormStep);
    setErrors({});
    setSubmitError(null);
  }

  function goToStep(next: FormStep) {
    if (next > furthestStep || next === step) return;
    setStep(next);
    setErrors({});
    setSubmitError(null);
  }

  async function saveForm() {
    if (saving) return;
    const input = toInput();
    const nextErrors = validateAgenciamentoInput(input, canManage);
    setErrors(nextErrors);
    setSubmitError(null);
    if (Object.keys(nextErrors).length > 0) {
      const firstErrorStep = getFirstErrorStep(nextErrors);
      setStep(firstErrorStep);
      window.setTimeout(() => focusFirstError(nextErrors), 60);
      return;
    }

    setSaving(true);
    try {
      const result = await onSubmit(input);
      if (result === false) {
        setSubmitError("Não foi possível salvar. Revise os dados e tente novamente.");
        return;
      }
      setInitialValue(form);
      onOpenChange(false);
    } catch {
      setSubmitError("Não foi possível salvar. Seus dados foram mantidos para uma nova tentativa.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (nextOpen) onOpenChange(true);
          else requestClose();
        }}
      >
        <DialogContent
          aria-busy={saving}
          className="left-0 top-0 flex h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-muted p-0 shadow-2xl duration-200 data-[state=closed]:slide-out-to-bottom-3 data-[state=open]:slide-in-from-bottom-3 data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100 motion-reduce:data-[state=closed]:animate-none motion-reduce:data-[state=open]:animate-none sm:left-1/2 sm:top-1/2 sm:h-[min(46rem,calc(100dvh-2rem))] sm:w-[min(61rem,calc(100vw-2rem))] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-[1.4rem] sm:border sm:border-border [&>button]:hidden"
          onEscapeKeyDown={(event) => {
            if (saving) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (saving || isDirty) event.preventDefault();
          }}
        >
          <DialogHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b border-border bg-background px-4 py-4 text-left sm:px-6 sm:py-5">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-primary">{isEditing ? "Editar agenciamento" : "Novo agenciamento"}</p>
              <DialogTitle className="mt-1 truncate text-xl font-extrabold tracking-tight sm:text-2xl">
                {isEditing ? "Atualizar imóvel captado" : "Cadastrar imóvel captado"}
              </DialogTitle>
              <DialogDescription className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                Avance pelas etapas. Os campos marcados com * são obrigatórios.
              </DialogDescription>
            </div>
            <button
              type="button"
              onClick={requestClose}
              disabled={saving}
              className="grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-background text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-accent hover:text-accent-foreground active:scale-95 disabled:opacity-45"
              aria-label="Fechar formulário"
            >
              <X className="size-5" />
            </button>
          </DialogHeader>

          <div className="shrink-0 border-b border-border bg-background px-4 py-3 md:hidden">
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 truncate text-xs font-bold text-foreground">Etapa {step + 1} de {steps.length} · {steps[step].shortTitle}</p>
              <span className="shrink-0 text-[11px] font-semibold text-primary">{Math.round(progress)}%</span>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <span className="block h-full origin-left rounded-full bg-primary transition-transform duration-200 motion-reduce:transition-none" style={{ transform: `scaleX(${progress / 100})` }} />
            </div>
          </div>

          <div className="flex min-h-0 flex-1">
            <aside className="hidden w-[16.5rem] shrink-0 border-r border-border bg-background/70 p-4 md:block">
              <nav aria-label="Etapas do cadastro" className="space-y-1.5">
                {steps.map((item, index) => {
                  const Icon = item.icon;
                  const stepIndex = index as FormStep;
                  const active = step === stepIndex;
                  const visited = stepIndex <= furthestStep;
                  const completed = stepIndex < step;
                  return (
                    <button
                      key={item.title}
                      type="button"
                      onClick={() => goToStep(stepIndex)}
                      disabled={!visited || saving}
                      aria-current={active ? "step" : undefined}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition-[background-color,border-color,color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99] disabled:cursor-not-allowed",
                        active ? "border-primary/25 bg-card text-card-foreground shadow-sm" : visited ? "border-transparent text-muted-foreground hover:bg-card" : "border-transparent text-muted-foreground/55",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border text-[11px] font-extrabold",
                          active && "border-primary bg-primary text-primary-foreground",
                          completed && "border-primary bg-primary text-primary-foreground",
                          !active && !completed && "border-border bg-background text-muted-foreground",
                        )}
                      >
                        {completed ? <Check className="size-3.5" /> : index + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 text-sm font-bold"><Icon className="size-3.5" />{item.title}</span>
                        <span className="mt-0.5 block text-[11px] leading-snug text-current opacity-70">{item.description}</span>
                      </span>
                    </button>
                  );
                })}
              </nav>
              <div className="mt-5 rounded-xl border border-primary/15 bg-primary/5 p-3">
                <p className="text-[11px] font-bold text-primary">Progresso do cadastro</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Seus dados são mantidos ao voltar entre as etapas.</p>
              </div>
            </aside>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 pb-28 sm:px-6 md:pb-6">
              <div className="mx-auto max-w-[40rem] animate-in fade-in slide-in-from-bottom-1 duration-200 motion-reduce:animate-none">
                {step === 0 && <PropertyStep form={form} errors={errors} update={update} />}
                {step === 1 && <OwnerStep form={form} errors={errors} update={update} />}
                {step === 2 && <ResponsibilityStep form={form} errors={errors} corretores={corretores} canManage={canManage} selectBroker={selectBroker} update={update} />}
                {step === 3 && <ReviewStep form={form} errors={errors} canManage={canManage} checklistCompleted={checklistCompleted} checklistProgress={checklistProgress} referencesOpen={referencesOpen} setReferencesOpen={setReferencesOpen} update={update} updateChecklist={updateChecklist} />}
                {submitError && (
                  <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/10 px-3.5 py-3 text-sm font-semibold text-destructive">
                    <CircleAlert className="mt-0.5 size-4 shrink-0" />{submitError}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="fixed inset-x-0 bottom-0 z-10 shrink-0 border-t border-border bg-background/95 px-4 py-3 backdrop-blur-xl sm:absolute md:static md:px-6" style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.75rem)" }}>
            <div className="mx-auto flex max-w-[61rem] items-center justify-between gap-3">
              <p className="hidden text-xs font-semibold text-muted-foreground md:block">{isDirty ? "Alterações ainda não salvas" : "Preencha no seu ritmo"}</p>
              <div className="grid w-full grid-cols-2 gap-2 md:ml-auto md:flex md:w-auto">
                {step === 0 ? (
                  <Button type="button" variant="ghost" onClick={requestClose} disabled={saving} className="h-11 rounded-xl text-muted-foreground">Cancelar</Button>
                ) : (
                  <Button type="button" variant="outline" onClick={previousStep} disabled={saving} className="h-11 rounded-xl shadow-none transition-[background-color,transform] duration-150 active:scale-[0.98]"><ChevronLeft className="size-4" />Voltar</Button>
                )}
                {step < 3 ? (
                  <Button type="button" onClick={continueForm} disabled={saving} className="h-11 rounded-xl transition-[background-color,transform] duration-150 active:scale-[0.985]">Continuar<ChevronRight className="size-4" /></Button>
                ) : (
                  <Button type="button" onClick={saveForm} disabled={saving} className="h-11 rounded-xl transition-[background-color,transform] duration-150 active:scale-[0.985]">
                    {saving ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" /> : isEditing ? <Save className="size-4" /> : <Check className="size-4" />}
                    {saving ? "Salvando..." : isEditing ? "Salvar alterações" : "Cadastrar agenciamento"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmCloseOpen} onOpenChange={setConfirmCloseOpen}>
        <AlertDialogContent className="w-[calc(100%_-_2rem)] max-w-md rounded-2xl border-border bg-background p-5 shadow-2xl duration-200 motion-reduce:data-[state=closed]:animate-none motion-reduce:data-[state=open]:animate-none sm:p-6">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-extrabold tracking-tight">Descartar alterações?</AlertDialogTitle>
            <AlertDialogDescription className="leading-relaxed text-muted-foreground">Os dados preenchidos neste agenciamento ainda não foram salvos.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-10 rounded-xl shadow-none">Continuar preenchendo</AlertDialogCancel>
            <AlertDialogAction className="h-10 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { setConfirmCloseOpen(false); onOpenChange(false); }}>Descartar e fechar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function PropertyStep({ form, errors, update }: { form: FormState; errors: AgenciamentoValidationErrors; update: <K extends keyof FormState>(key: K, value: FormState[K]) => void }) {
  return (
    <StepSection icon={Building2} title="Dados do imóvel" description="Comece pelas informações que identificam a captação.">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="ag-tipo-imovel" label="Tipo de imóvel" required error={errors.tipoImovel}>
          <Select value={form.tipoImovel} onValueChange={(value) => update("tipoImovel", value as AgenciamentoTipoImovel)}>
            <SelectTrigger id="ag-tipo-imovel" aria-required="true" aria-invalid={Boolean(errors.tipoImovel)} aria-describedby={descriptionIds("ag-tipo-imovel", errors.tipoImovel)} className={controlClass(errors.tipoImovel, true)}><SelectValue /></SelectTrigger>
            <SelectContent>{agenciamentoTipoOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field id="ag-imobiliaria" label="Imobiliária" required error={errors.imobiliaria}>
          <Select value={form.imobiliaria} onValueChange={(value) => update("imobiliaria", value as AgenciamentoImobiliaria)}>
            <SelectTrigger id="ag-imobiliaria" aria-required="true" aria-invalid={Boolean(errors.imobiliaria)} aria-describedby={descriptionIds("ag-imobiliaria", errors.imobiliaria)} className={controlClass(errors.imobiliaria, true)}><SelectValue /></SelectTrigger>
            <SelectContent>{imobiliariaOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
      </div>
      <Field id="ag-endereco" label="Endereço" required error={errors.endereco}>
        <input id="ag-endereco" value={form.endereco} onChange={(event) => update("endereco", event.target.value)} className={controlClass(errors.endereco)} placeholder="Rua, número e complemento" autoComplete="street-address" aria-required="true" aria-invalid={Boolean(errors.endereco)} aria-describedby={descriptionIds("ag-endereco", errors.endereco)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="ag-bairro" label="Bairro ou região"><input id="ag-bairro" value={form.bairro} onChange={(event) => update("bairro", event.target.value)} className={controlClass()} placeholder="Centro" autoComplete="address-level3" /></Field>
        <Field id="ag-cidade" label="Cidade"><input id="ag-cidade" value={form.cidade} onChange={(event) => update("cidade", event.target.value)} className={controlClass()} placeholder="Porto Alegre" autoComplete="address-level2" /></Field>
      </div>
      <Field id="ag-descricao" label="Descrição curta" helper="Use um resumo objetivo para a equipe reconhecer o imóvel.">
        <textarea id="ag-descricao" value={form.descricaoImovel} onChange={(event) => update("descricaoImovel", event.target.value)} className={cn(controlClass(), "h-auto min-h-24 resize-y py-3")} placeholder="Ex.: apartamento de 2 dormitórios, posição solar norte..." maxLength={400} aria-describedby="ag-descricao-helper" />
      </Field>
    </StepSection>
  );
}

function OwnerStep({ form, errors, update }: { form: FormState; errors: AgenciamentoValidationErrors; update: <K extends keyof FormState>(key: K, value: FormState[K]) => void }) {
  return (
    <StepSection icon={UserRound} title="Contato do proprietário" description="Registre como o responsável pelo imóvel prefere ser contatado.">
      <Field id="ag-proprietario-nome" label="Nome do proprietário" required error={errors.proprietarioNome}>
        <input id="ag-proprietario-nome" value={form.proprietarioNome} onChange={(event) => update("proprietarioNome", event.target.value)} className={controlClass(errors.proprietarioNome)} placeholder="Nome completo" autoComplete="name" aria-required="true" aria-invalid={Boolean(errors.proprietarioNome)} aria-describedby={descriptionIds("ag-proprietario-nome", errors.proprietarioNome)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="ag-proprietario-telefone" label="Telefone" required error={errors.proprietarioTelefone} helper="Informe DDD e número.">
          <input id="ag-proprietario-telefone" type="tel" inputMode="tel" value={form.proprietarioTelefone} onChange={(event) => update("proprietarioTelefone", formatPhoneBR(event.target.value))} className={controlClass(errors.proprietarioTelefone)} placeholder="(51) 99999-9999" autoComplete="tel" aria-required="true" aria-invalid={Boolean(errors.proprietarioTelefone)} aria-describedby={descriptionIds("ag-proprietario-telefone", errors.proprietarioTelefone, true)} />
        </Field>
        <Field id="ag-contato-preferencial" label="Contato preferencial">
          <Select value={form.proprietarioContatoPreferencial} onValueChange={(value) => update("proprietarioContatoPreferencial", value as AgenciamentoContatoPreferencial)}>
            <SelectTrigger id="ag-contato-preferencial" className={controlClass(undefined, true)}><SelectValue /></SelectTrigger>
            <SelectContent>{contactOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
      </div>
      <Field id="ag-proprietario-observacoes" label="Observações" helper="Preferências de horário, restrições de contato ou combinados importantes.">
        <textarea id="ag-proprietario-observacoes" value={form.proprietarioObservacoes} onChange={(event) => update("proprietarioObservacoes", event.target.value)} className={cn(controlClass(), "h-auto min-h-28 resize-y py-3")} placeholder="Ex.: prefere contato por WhatsApp após as 18h." maxLength={600} aria-describedby="ag-proprietario-observacoes-helper" />
      </Field>
    </StepSection>
  );
}

function ResponsibilityStep({ form, errors, corretores, canManage, selectBroker, update }: { form: FormState; errors: AgenciamentoValidationErrors; corretores: Corretor[]; canManage: boolean; selectBroker: (id: string) => void; update: <K extends keyof FormState>(key: K, value: FormState[K]) => void }) {
  return (
    <StepSection icon={CalendarDays} title="Responsabilidade e andamento" description="Defina quem acompanha a captação e em qual etapa ela está.">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="ag-corretor" label="Corretor responsável" required error={errors.corretorId} helper={canManage ? "Administradores podem atribuir o registro a outro corretor." : "Definido automaticamente pelo perfil conectado."}>
          <Select value={form.corretorId} onValueChange={selectBroker} disabled={!canManage}>
            <SelectTrigger id="ag-corretor" aria-required="true" aria-invalid={Boolean(errors.corretorId)} aria-describedby={descriptionIds("ag-corretor", errors.corretorId, true)} className={controlClass(errors.corretorId, true)}><SelectValue placeholder="Selecione o corretor" /></SelectTrigger>
            <SelectContent>{corretores.map((corretor) => <SelectItem key={corretor.id} value={corretor.id}>{corretor.nome}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field id="ag-data" label="Data do agenciamento" required error={errors.dataAgenciamento}>
          <input id="ag-data" type="date" value={form.dataAgenciamento} onChange={(event) => update("dataAgenciamento", event.target.value)} className={controlClass(errors.dataAgenciamento)} aria-required="true" aria-invalid={Boolean(errors.dataAgenciamento)} aria-describedby={descriptionIds("ag-data", errors.dataAgenciamento)} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="ag-origem" label="Origem" required error={errors.origem}>
          <Select value={form.origem} onValueChange={(value) => update("origem", value as AgenciamentoOrigem)}>
            <SelectTrigger id="ag-origem" aria-required="true" aria-invalid={Boolean(errors.origem)} aria-describedby={descriptionIds("ag-origem", errors.origem)} className={controlClass(errors.origem, true)}><SelectValue /></SelectTrigger>
            <SelectContent>{agenciamentoOrigemOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field id="ag-status" label="Status atual" required error={errors.status} helper="Use o status que melhor representa a próxima ação.">
          <Select value={form.status} onValueChange={(value) => update("status", value as AgenciamentoStatus)}>
            <SelectTrigger id="ag-status" aria-required="true" aria-invalid={Boolean(errors.status)} aria-describedby={descriptionIds("ag-status", errors.status, true)} className={controlClass(errors.status, true)}><SelectValue /></SelectTrigger>
            <SelectContent>{agenciamentoStatusOptions.map((option) => <SelectItem key={option.value} value={option.value} disabled={option.value === "validado" && !canManage}>{getAgenciamentoStatusLabel(option.value)}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
      </div>
      {!canManage && <div className="flex items-start gap-2.5 rounded-xl border border-primary/15 bg-primary/5 px-3.5 py-3 text-xs leading-relaxed text-muted-foreground"><LockKeyhole className="mt-0.5 size-4 shrink-0 text-primary" />A validação final continua protegida para a administração. Você pode registrar todas as demais etapas do checklist.</div>}
    </StepSection>
  );
}

function ReviewStep({ form, errors, canManage, checklistCompleted, checklistProgress, referencesOpen, setReferencesOpen, update, updateChecklist }: { form: FormState; errors: AgenciamentoValidationErrors; canManage: boolean; checklistCompleted: number; checklistProgress: number; referencesOpen: boolean; setReferencesOpen: (open: boolean) => void; update: <K extends keyof FormState>(key: K, value: FormState[K]) => void; updateChecklist: (key: keyof AgenciamentoChecklist, value: boolean) => void }) {
  return (
    <div className="space-y-5">
      <StepSection icon={ClipboardCheck} title="Checklist operacional" description="Marque apenas o que já foi concluído. Você pode atualizar o restante depois.">
        <div className="rounded-xl border border-primary/15 bg-primary/5 px-3.5 py-3">
          <div className="flex items-center justify-between gap-3 text-xs font-semibold"><span className="text-muted-foreground">Progresso atual</span><span className="font-extrabold text-primary tabular-nums">{checklistCompleted}/6 · {checklistProgress}%</span></div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background" aria-hidden="true"><span className="block h-full origin-left rounded-full bg-primary transition-transform duration-200 motion-reduce:transition-none" style={{ transform: `scaleX(${checklistProgress / 100})` }} /></div>
        </div>
        <div className="grid gap-2">
          {checklistItems.map((item) => <ChecklistButton key={item.key} checked={form.checklist[item.key]} icon={item.icon} label={item.label} helper={item.helper} onClick={() => updateChecklist(item.key, !form.checklist[item.key])} />)}
        </div>
        <div className={cn("rounded-xl border px-3.5 py-3 transition-colors duration-150", form.checklist.validado ? "border-primary/25 bg-primary/10" : "border-border bg-card")}>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
            <div className="flex min-w-0 items-start gap-3"><LockKeyhole aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" /><span className="min-w-0"><span className="flex flex-wrap items-center gap-2 text-sm font-bold text-foreground">Agenciamento validado<span className="rounded-full border border-border bg-background px-2 py-0.5 text-[9px] font-extrabold text-muted-foreground">Somente administrador</span></span><span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">Confirma a conferência administrativa antes da publicação final.</span></span></div>
            <button type="button" onClick={() => updateChecklist("validado", !form.checklist.validado)} disabled={!canManage} role="switch" aria-checked={form.checklist.validado} aria-label="Agenciamento validado, somente administrador" className={cn("relative h-7 w-12 shrink-0 rounded-full border transition-[background-color,border-color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-45", form.checklist.validado ? "border-primary bg-primary" : "border-border bg-muted")}><span className={cn("absolute top-1 grid size-5 place-items-center rounded-full bg-background shadow-sm transition-transform duration-150", form.checklist.validado ? "translate-x-5" : "translate-x-1")}>{form.checklist.validado && <Check className="size-3 text-primary" />}</span></button>
          </div>
          {errors.permissaoValidacao && <p className="mt-2 text-xs font-semibold text-destructive" role="alert">{errors.permissaoValidacao}</p>}
        </div>
      </StepSection>

      <section aria-labelledby="ag-review-title" className="space-y-3">
        <div><h3 id="ag-review-title" className="text-base font-extrabold tracking-tight">Revise antes de salvar</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Volte às etapas anteriores se algum dado precisar de ajuste.</p></div>
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          <ReviewRow icon={Building2} label="Imóvel" value={`${getAgenciamentoTipoLabel(form.tipoImovel)} · ${form.endereco || "Endereço pendente"}`} />
          <ReviewRow icon={UserRound} label="Proprietário" value={`${form.proprietarioNome || "Nome pendente"} · ${form.proprietarioTelefone || "Telefone pendente"}`} />
          <ReviewRow icon={CalendarDays} label="Responsabilidade" value={`${form.corretorNome || "Corretor pendente"} · ${form.dataAgenciamento || "Data pendente"}`} />
          <ReviewRow icon={BadgeCheck} label="Situação" value={`${getAgenciamentoStatusLabel(form.status)} · ${checklistProgress}% do checklist`} />
        </div>
      </section>

      <Collapsible open={referencesOpen} onOpenChange={setReferencesOpen}>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <CollapsibleTrigger asChild><button type="button" className="flex min-h-12 w-full items-center justify-between gap-3 px-3.5 py-3 text-left transition-colors duration-150 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"><span className="flex min-w-0 items-center gap-2.5"><Link2 className="size-4 shrink-0 text-primary" /><span><span className="block text-sm font-bold">Links e observações complementares</span><span className="mt-0.5 block text-[11px] text-muted-foreground">Campos opcionais</span></span></span><ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none", referencesOpen && "rotate-180")} /></button></CollapsibleTrigger>
          <CollapsibleContent className="border-t border-border px-3.5 py-4 data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down motion-reduce:animate-none"><div className="space-y-4">
            <Field id="ag-drive-url" label="Pasta do Drive"><input id="ag-drive-url" type="url" inputMode="url" value={form.driveFolderUrl} onChange={(event) => update("driveFolderUrl", event.target.value)} className={controlClass()} placeholder="https://drive.google.com/..." autoComplete="url" /></Field>
            <Field id="ag-site-url" label="Imóvel no site"><input id="ag-site-url" type="url" inputMode="url" value={form.siteUrl} onChange={(event) => update("siteUrl", event.target.value)} className={controlClass()} placeholder="https://..." autoComplete="url" /></Field>
            <Field id="ag-observacoes-internas" label="Observações internas"><textarea id="ag-observacoes-internas" value={form.observacoesInternas} onChange={(event) => update("observacoesInternas", event.target.value)} className={cn(controlClass(), "h-auto min-h-24 resize-y py-3")} placeholder="Informações úteis apenas para a equipe." maxLength={800} /></Field>
          </div></CollapsibleContent>
        </div>
      </Collapsible>
    </div>
  );
}

function ChecklistButton({ checked, icon: Icon, label, helper, onClick }: { checked: boolean; icon: LucideIcon; label: string; helper: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} role="switch" aria-checked={checked} className={cn("grid min-h-16 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-xl border px-3.5 py-3 text-left transition-[background-color,border-color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99]", checked ? "border-primary/25 bg-primary/10" : "border-border bg-card hover:bg-accent")}>
      <span className="flex min-w-0 items-start gap-3"><Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" /><span className="min-w-0"><span className="block text-sm font-bold text-foreground">{label}</span><span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{helper}</span></span></span>
      <span className={cn("grid size-7 shrink-0 place-items-center rounded-full border transition-colors duration-150", checked ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground")} aria-hidden="true">{checked && <Check className="size-4" />}</span>
    </button>
  );
}

function StepSection({ icon: Icon, title, description, children }: { icon: LucideIcon; title: string; description: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`section-${title.toLowerCase().replaceAll(" ", "-")}`}>
      <div className="mb-5 flex items-start gap-3"><Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" /><div className="min-w-0"><h3 id={`section-${title.toLowerCase().replaceAll(" ", "-")}`} className="text-lg font-extrabold tracking-tight">{title}</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">{description}</p></div></div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({ id, label, required, error, helper, children }: { id: string; label: string; required?: boolean; error?: string; helper?: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1.5 block text-xs font-bold text-foreground">{label}{required && <span className="ml-1 text-destructive" aria-hidden="true">*</span>}</label>
      {children}
      {helper && !error && <p id={`${id}-helper`} className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{helper}</p>}
      {error && <p id={`${id}-error`} className="mt-1.5 text-[11px] font-semibold text-destructive" role="alert">{error}</p>}
    </div>
  );
}

function ReviewRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return <div className="flex items-start gap-3 px-3.5 py-3"><Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" /><div className="min-w-0"><p className="text-[11px] font-semibold text-muted-foreground">{label}</p><p className="mt-0.5 break-words text-xs font-bold leading-relaxed text-foreground">{value}</p></div></div>;
}

function controlClass(error?: string, select = false) {
  return cn(select ? selectBaseClassName : inputBaseClassName, error ? "border-destructive focus:border-destructive focus:ring-destructive/15" : "border-border focus:border-primary/50 focus:ring-primary/15");
}

function descriptionIds(id: string, error?: string, helper = false) {
  return [helper ? `${id}-helper` : undefined, error ? `${id}-error` : undefined].filter(Boolean).join(" ") || undefined;
}

function selectErrors(source: AgenciamentoValidationErrors, keys: ValidationKey[]) {
  const result: AgenciamentoValidationErrors = {};
  keys.forEach((key) => {
    if (source[key]) result[key] = source[key];
  });
  return result;
}

function focusFirstError(errors: AgenciamentoValidationErrors) {
  const firstKey = Object.keys(errors)[0] as ValidationKey | undefined;
  const fieldId = firstKey ? fieldIds[firstKey] : undefined;
  if (!fieldId) return;
  window.requestAnimationFrame(() => document.getElementById(fieldId)?.focus());
}

function getFirstErrorStep(errors: AgenciamentoValidationErrors): FormStep {
  const keys = Object.keys(errors) as ValidationKey[];
  const step = ([0, 1, 2, 3] as FormStep[]).find((item) => stepFieldKeys[item].some((key) => keys.includes(key)));
  return step ?? 3;
}