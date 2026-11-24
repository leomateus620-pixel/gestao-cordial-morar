import { SpouseFields } from "./SpouseFields";
import { emptySpouse, type GuarantorSpouse } from "@/lib/rentals/guarantor-spouse";
import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Home,
  User,
  ShieldCheck,
  FileText,
  KeyRound,
  Plus,
  Trash2,
  Paperclip,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRentalDocuments } from "@/hooks/useRentalDocuments";
import { focusRentalField, RentalContractWorkflow } from "./RentalContractGenerator";
import { RentalEntryInspection } from "./RentalEntryInspection";
import { RentalDocuments } from "./RentalDocuments";
import {
  rentalInputFromWorkspace,
  workspaceBaseIssues,
  workspaceInputFromContract,
  type RentalWorkspaceDraft,
  type RentalWorkspaceInput,
  type RentalTemplateOptions,
} from "@/lib/rentals/contract-workflow";
import { sha256Hex } from "@/lib/rentals/contract-letterhead";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { parseBRLNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  RENTAL_DOCUMENT_CATEGORIES,
  type RentalBrand,
  type RentalContractFull,
  type RentalContractInput,
  type RentalDocumentCategory,
  type RentalGuaranteeType,
  type RentalProperty,
  type RentalPropertyType,
  type RentalContractStatus,
  type RentalTenant,
} from "@/types/rental";

const DOC_ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,application/pdf,image/*,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const moneyText = (value?: number | null) => (value == null ? "" : String(value).replace(".", ","));
const numberOrNull = (value: string) => {
  const parsed = value.trim() ? parseBRLNumber(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

const inputCls =
  "w-full rounded-xl border border-border/70 bg-background px-3.5 py-2.5 text-sm font-medium text-foreground shadow-sm transition outline-none placeholder:text-foreground/40 hover:border-border focus:border-primary focus:ring-2 focus:ring-primary/25 disabled:opacity-50";

function Field({
  label,
  fieldId,
  children,
  className = "",
}: {
  label: string;
  fieldId?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={`block ${className}`} data-rental-field={fieldId}>
      <label
        htmlFor={id}
        className="text-[11px] font-semibold uppercase tracking-wide text-foreground/75"
      >
        {label}
      </label>
      <div className="mt-1.5">
        {isValidElement(children)
          ? cloneElement(children as ReactElement<{ id?: string }>, { id })
          : children}
      </div>
    </div>
  );
}

function SectionCard({
  icon: Icon,
  title,
  subtitle,
  action,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[0_1px_0_rgba(255,255,255,0.6)_inset,0_10px_28px_-18px_rgba(15,23,42,0.25)]">
      <div className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-primary/70 via-primary/40 to-transparent" />
      <header className="flex items-start justify-between gap-3 border-b border-border/50 bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-4" />
          </div>
          <div>
            <h3 className="text-[12px] font-bold uppercase tracking-[0.12em] text-foreground">
              {title}
            </h3>
            {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        {action}
      </header>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

type Mode = "existing" | "new";

function ModeToggle({
  value,
  onChange,
  disableExisting,
}: {
  value: Mode;
  onChange: (m: Mode) => void;
  disableExisting?: boolean;
}) {
  const baseBtn = "relative flex-1 rounded-full px-3 py-1.5 text-xs font-semibold transition";
  return (
    <div className="inline-flex w-full max-w-[220px] rounded-full bg-muted/70 p-1">
      <button
        type="button"
        onClick={() => onChange("existing")}
        disabled={disableExisting}
        className={`${baseBtn} ${
          value === "existing"
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-foreground/65 hover:text-foreground"
        } disabled:cursor-not-allowed disabled:opacity-40`}
      >
        Existente
      </button>
      <button
        type="button"
        onClick={() => onChange("new")}
        className={`${baseBtn} ${
          value === "new"
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-foreground/65 hover:text-foreground"
        }`}
      >
        Novo
      </button>
    </div>
  );
}

const PROPERTY_TYPES: { id: RentalPropertyType; label: string }[] = [
  { id: "apartamento", label: "Apartamento" },
  { id: "casa", label: "Casa" },
  { id: "sala_comercial", label: "Sala comercial" },
  { id: "terreno", label: "Terreno" },
  { id: "kitnet", label: "Kitnet" },
  { id: "outro", label: "Outro" },
];

// -------- Tenant entry --------
type TenantEntry = {
  key: string;
  mode: Mode;
  existingId: string;
  editExisting: boolean;
  nome: string;
  telefone: string;
  email: string;
  cpfCnpj: string;
  profissao: string;
  renda: string;
  endereco: string;
};

function newTenantEntry(): TenantEntry {
  return {
    key: crypto.randomUUID(),
    mode: "new",
    existingId: "",
    editExisting: false,
    nome: "",
    telefone: "",
    email: "",
    cpfCnpj: "",
    profissao: "",
    renda: "",
    endereco: "",
  };
}

function tenantDataFromEntry(t: TenantEntry) {
  const renda = t.renda ? parseBRLNumber(t.renda) : NaN;
  return {
    nome: t.nome,
    cpfCnpj: t.cpfCnpj || null,
    telefone: t.telefone,
    email: t.email || null,
    dataNascimento: null,
    endereco: t.endereco || null,
    profissao: t.profissao || null,
    rendaAproximada: Number.isFinite(renda) ? renda : null,
    observacoes: null,
  };
}

function tenantEntryToInput(t: TenantEntry) {
  return {
    existingId: t.mode === "existing" ? t.existingId || null : null,
    data: tenantDataFromEntry(t),
  };
}

// -------- Guarantee entry --------
type GuaranteeTipo = Exclude<RentalGuaranteeType, "sem_garantia">;
type GuaranteeEntry = {
  key: string;
  tipo: GuaranteeTipo;
  // fiador — id existente (para atualizar em vez de duplicar)
  guarantorId: string | null;
  guarNome: string;
  guarCpfCnpj: string;
  guarTel: string;
  guarEmail: string;
  guarVinculo: string;
  guarEndereco: string;
  guarProfissao: string;
  // caução
  valorCaucao: string;
  // seguro
  seguroSeguradora: string;
  seguroApolice: string;
  seguroValor: string;
  conjuge: GuarantorSpouse;
};

function newGuaranteeEntry(tipo: GuaranteeTipo = "fiador"): GuaranteeEntry {
  return {
    key: crypto.randomUUID(),
    tipo,
    guarantorId: null,
    guarNome: "",
    guarCpfCnpj: "",
    guarTel: "",
    guarEmail: "",
    guarVinculo: "",
    guarEndereco: "",
    guarProfissao: "",
    valorCaucao: "",
    seguroSeguradora: "",
    seguroApolice: "",
    seguroValor: "",
    conjuge: emptySpouse(),
  };
}

function guaranteeEntryToInput(
  g: GuaranteeEntry,
): NonNullable<RentalWorkspaceInput["guarantees"]>[number] {
  if (g.tipo === "fiador") {
    const data = {
      nome: g.guarNome,
      cpfCnpj: g.guarCpfCnpj || null,
      telefone: g.guarTel || null,
      email: g.guarEmail || null,
      endereco: g.guarEndereco || null,
      profissao: g.guarProfissao || null,
      vinculo: g.guarVinculo || null,
      observacoes: null,
    };

    return {
      tipo: "fiador",
      guarantor: g.guarantorId ? { existingId: g.guarantorId, data } : { data },
      conjuge: g.conjuge.enabled ? g.conjuge : null,
    };
  }
  if (g.tipo === "caucao") {
    const v = parseBRLNumber(g.valorCaucao);
    return {
      tipo: "caucao",
      valorCaucao: Number.isFinite(v) ? v : null,
    };
  }
  const sv = parseBRLNumber(g.seguroValor);
  return {
    tipo: "seguro_fianca",
    seguroSeguradora: g.seguroSeguradora || null,
    seguroApolice: g.seguroApolice || null,
    seguroValorMensal: Number.isFinite(sv) ? sv : null,
  };
}

const GUAR_TIPO_OPTS: { id: GuaranteeTipo; label: string }[] = [
  { id: "fiador", label: "Fiador" },
  { id: "caucao", label: "Caução" },
  { id: "seguro_fianca", label: "Seguro fiança" },
];

export function RentalFormModal({
  open,
  onOpenChange,
  properties,
  tenants,
  onSubmit,
  isSaving,
  initial,
  workspaceId,
  draft,
  resumeForm,
  focusField,
  returnToInspections,
  onSaveDraft,
  onConfirmed,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  properties: RentalProperty[];
  tenants: RentalTenant[];
  onSubmit: (input: RentalContractInput) => Promise<RentalContractFull | unknown>;
  isSaving: boolean;
  initial?: RentalContractFull | null;
  workspaceId: string;
  draft?: RentalWorkspaceDraft | null;
  resumeForm: boolean;
  focusField?: string;
  returnToInspections?: boolean;
  onSaveDraft: (data: {
    id: string;
    input: RentalWorkspaceInput;
    revision: number;
  }) => Promise<{ id: string; revision: number }>;
  onConfirmed: () => Promise<void>;
}) {
  const isEdit = !!initial;
  const isDraft = !initial;
  const content = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState("dados");
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!open || !viewport) return;
    const resize = () => {
      const keyboard = window.innerHeight - viewport.height > 120;
      setKeyboardOpen(keyboard);
      sheet.current?.style.setProperty(
        "--rental-sheet-height",
        keyboard ? `${viewport.height}px` : "100dvh",
      );
      if (keyboard && document.activeElement instanceof HTMLElement)
        document.activeElement.scrollIntoView({ block: "nearest" });
    };
    viewport.addEventListener("resize", resize);
    resize();
    return () => viewport.removeEventListener("resize", resize);
  }, [open]);
  const lastLoaded = useRef<string | null>(null);
  const saveLock = useRef<Promise<number> | null>(null);
  const [template, setTemplate] = useState<RentalTemplateOptions>({});
  const draftRevision = useRef(0);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);
  const [savedInput, setSavedInput] = useState<string | null>(null);
  const activeSaveLock = useRef<Promise<void> | null>(null);
  const [propMode, setPropMode] = useState<Mode>("new");
  const [propId, setPropId] = useState("");
  const [apelido, setApelido] = useState("");
  const [tipo, setTipo] = useState<RentalPropertyType>("apartamento");
  const [logradouro, setLogradouro] = useState("");
  const [numero, setNumero] = useState("");
  const [complemento, setComplemento] = useState("");
  const [cep, setCep] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [quartos, setQuartos] = useState("");
  const [banheiros, setBanheiros] = useState("");
  const [vagas, setVagas] = useState("");
  const [areaM2, setAreaM2] = useState("");
  const [propNome, setPropNome] = useState("");
  const [propCpf, setPropCpf] = useState("");
  const [propEmail, setPropEmail] = useState("");
  const [propTelefone, setPropTelefone] = useState("");

  const [tenantEntries, setTenantEntries] = useState<TenantEntry[]>([newTenantEntry()]);
  const [guaranteeEntries, setGuaranteeEntries] = useState<GuaranteeEntry[]>([]);

  const [valor, setValor] = useState("");
  const [comissao, setComissao] = useState("");
  const comissaoPct = (() => {
    const base = parseBRLNumber(valor);
    const com = parseBRLNumber(comissao);
    if (!Number.isFinite(base) || base <= 0 || !Number.isFinite(com) || com < 0) return null;
    return (com / base) * 100;
  })();
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [dia, setDia] = useState("10");
  const [status, setStatus] = useState<RentalContractStatus>("pendente_assinatura");
  const [obs, setObs] = useState("");
  const [brand, setBrand] = useState<RentalBrand>("cordial");
  const [error, setError] = useState<string | null>(null);
  function updateTenant(key: string, patch: Partial<TenantEntry>) {
    setTenantEntries((prev) => prev.map((t) => (t.key === key ? { ...t, ...patch } : t)));
  }
  function removeTenant(key: string) {
    const index = tenantEntries.findIndex((tenant) => tenant.key === key);
    setTenantEntries((prev) => (prev.length <= 1 ? prev : prev.filter((t) => t.key !== key)));
    setTemplate((prev) => ({ ...prev, tenants: prev.tenants?.filter((_, i) => i !== index) }));
  }
  function addTenant() {
    setTenantEntries((prev) => [...prev, newTenantEntry()]);
  }

  function updateGuarantee(key: string, patch: Partial<GuaranteeEntry>) {
    setGuaranteeEntries((prev) => prev.map((g) => (g.key === key ? { ...g, ...patch } : g)));
  }
  function removeGuarantee(key: string) {
    const index = guaranteeEntries.findIndex((guarantee) => guarantee.key === key);
    setGuaranteeEntries((prev) => prev.filter((g) => g.key !== key));
    setTemplate((prev) => ({
      ...prev,
      guarantors: prev.guarantors?.filter((_, i) => i !== index),
    }));
  }
  function addGuarantee(t: GuaranteeTipo) {
    setGuaranteeEntries((prev) => [...prev, newGuaranteeEntry(t)]);
  }

  function applyProperty(data: RentalWorkspaceInput["property"]["data"]) {
    setApelido(data.apelido);
    setTipo(data.tipo);
    setLogradouro(data.logradouro);
    setNumero(data.numero ?? "");
    setComplemento(data.complemento ?? "");
    setCep(data.cep ?? "");
    setBairro(data.bairro ?? "");
    setCidade(data.cidade ?? "");
    setUf(data.uf ?? "");
    setQuartos(data.quartos?.toString() ?? "");
    setBanheiros(data.banheiros?.toString() ?? "");
    setVagas(data.vagas?.toString() ?? "");
    setAreaM2(moneyText(data.areaM2));
    setPropNome(data.proprietarioNome ?? "");
    setPropCpf(data.proprietarioCpf ?? "");
    setPropEmail(data.proprietarioEmail ?? "");
    setPropTelefone(data.proprietarioTelefone ?? "");
  }

  useEffect(() => {
    if (!open) return;
    const hydrationKey = workspaceId + (initial ? ":active" : ":draft");
    if (lastLoaded.current === hydrationKey) return;
    lastLoaded.current = hydrationKey;
    const data = initial ? workspaceInputFromContract(initial) : draft?.input;
    if (!data) return;
    setSavedInput(null);
    setHydratedKey(hydrationKey);
    draftRevision.current = draft?.revision ?? 0;
    setSaveState(draft ? "saved" : "idle");
    setPropMode(data.property.existingId ? "existing" : "new");
    setPropId(data.property.existingId ?? "");
    applyProperty(data.property.data);
    setTenantEntries(
      data.tenants.map(({ existingId, data: t }) => ({
        ...newTenantEntry(),
        mode: existingId ? "existing" : "new",
        existingId: existingId ?? "",
        editExisting: true,
        nome: t.nome,
        cpfCnpj: t.cpfCnpj ?? "",
        telefone: t.telefone,
        email: t.email ?? "",
        endereco: t.endereco ?? "",
        profissao: t.profissao ?? "",
        renda: moneyText(t.rendaAproximada),
      })),
    );
    setGuaranteeEntries(
      data.guarantees.map((g, index) => ({
        ...newGuaranteeEntry(g.tipo),
        guarantorId: g.guarantor?.existingId ?? null,
        guarNome: g.guarantor?.data.nome ?? "",
        guarCpfCnpj: g.guarantor?.data.cpfCnpj ?? "",
        guarTel: g.guarantor?.data.telefone ?? "",
        guarEmail: g.guarantor?.data.email ?? "",
        guarVinculo: g.guarantor?.data.vinculo ?? "",
        guarEndereco: g.guarantor?.data.endereco ?? "",
        guarProfissao: g.guarantor?.data.profissao ?? "",
        valorCaucao: data.money?.[`deposit-${index}`] ?? moneyText(g.valorCaucao),
        seguroSeguradora: g.seguroSeguradora ?? "",
        seguroApolice: g.seguroApolice ?? "",
        seguroValor: data.money?.[`premium-${index}`] ?? moneyText(g.seguroValorMensal),
        conjuge: g.conjuge ?? emptySpouse(),
      })),
    );
    setValor(data.money?.rent ?? moneyText(data.valorMensal));
    setComissao(data.money?.commission ?? moneyText(data.comissaoMensal));
    setDataInicio(data.dataInicio);
    setDataFim(data.dataFim);
    setDia(data.money?.due ?? String(data.diaVencimento));
    setStatus(data.status);
    setObs(data.observacoes ?? "");
    setBrand(data.brand);
    setTemplate(data.template);
  }, [initial, draft, open, workspaceId]);

  function focusFieldInForm(field: string) {
    if (focusRentalField(content.current, field)) {
      setStage("dados");
      return;
    }
    if (field.startsWith("tenant-")) {
      const index = Number(field.split("-")[1]);
      const tenant = tenantEntries[index];
      if (tenant?.mode === "existing" && tenant.existingId) {
        updateTenant(tenant.key, { editExisting: true });
        window.requestAnimationFrame(() => focusRentalField(content.current, field));
        return;
      }
      focusRentalField(content.current, `tenant-${index}-select`);
    }
  }

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      if (focusField) focusFieldInForm(focusField);
      else if (returnToInspections) scrollToSection("vistorias");
    });
    return () => window.cancelAnimationFrame(frame);
    // A route opening or resuming the form restores the requested field or section.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspaceId, focusField, returnToInspections]);

  const input: RentalWorkspaceInput = {
    brand,
    property: {
      existingId: propMode === "existing" ? propId || null : null,
      data: {
        apelido,
        tipo,
        logradouro,
        numero,
        complemento,
        cep,
        bairro,
        cidade,
        uf,
        quartos: quartos ? Number(quartos) : null,
        banheiros: banheiros ? Number(banheiros) : null,
        vagas: vagas ? Number(vagas) : null,
        areaM2: numberOrNull(areaM2),
        valorSugerido: numberOrNull(valor),
        status: initial?.property.status ?? "alugado",
        observacoes: initial?.property.observacoes,
        brand: initial?.property.brand ?? brand,
        proprietarioNome: propNome,
        proprietarioCpf: propCpf,
        proprietarioEmail: propEmail,
        proprietarioTelefone: propTelefone,
      },
    },
    tenants: tenantEntries.map(tenantEntryToInput),
    guarantees: guaranteeEntries.map(guaranteeEntryToInput),
    valorMensal: numberOrNull(valor) ?? 0,
    comissaoMensal: comissao.trim() ? (numberOrNull(comissao) ?? -1) : null,
    dataInicio,
    dataFim,
    diaVencimento: Number(dia) || 0,
    status,
    observacoes: obs || null,
    template,
    money: Object.fromEntries([
      ["rent", valor],
      ["commission", comissao],
      ["due", dia],
      ...guaranteeEntries.flatMap((g, i) =>
        g.tipo === "caucao"
          ? [[`deposit-${i}`, g.valorCaucao]]
          : g.tipo === "seguro_fianca"
            ? [[`premium-${i}`, g.seguroValor]]
            : [],
      ),
    ]),
  };

  const inputKey = JSON.stringify(input);
  const dirty = savedInput !== null && savedInput !== inputKey;
  useEffect(() => {
    if (open && savedInput === null && hydratedKey) setSavedInput(inputKey);
  }, [open, hydratedKey, inputKey, savedInput]);

  function persistDraft() {
    if (saveLock.current) return saveLock.current;
    setError(null);
    setSaveState("saving");
    const request = onSaveDraft({ id: workspaceId, input, revision: draftRevision.current })
      .then((result) => {
        draftRevision.current = result.revision;
        setSavedInput(inputKey);
        setSaveState("saved");
        return result.revision;
      })
      .catch((cause) => {
        setSaveState("idle");
        throw cause;
      })
      .finally(() => {
        saveLock.current = null;
      });
    saveLock.current = request;
    return request;
  }

  async function saveActive() {
    if (!initial) return;
    if (activeSaveLock.current) return activeSaveLock.current;
    const issue = workspaceBaseIssues(input)[0];
    if (issue) {
      focusFieldInForm(issue.field);
      throw new Error(issue.label);
    }
    if (!dirty && savedInput) return;
    setSaveState("saving");
    const request = (async () => {
      try {
        const saved = (await onSubmit({
          ...rentalInputFromWorkspace(input, initial.id),
          paymentStatus: initial.paymentStatus,
          proximoVencimento:
            input.diaVencimento === initial.diaVencimento ? initial.proximoVencimento : null,
        })) as RentalContractFull;
        const newProperty = saved?.property?.id;
        if (newProperty) {
          setPropId(newProperty);
          setPropMode("existing");
        }
        setTenantEntries((previous) =>
          previous.map((t, index) => ({
            ...t,
            existingId: saved?.tenants[index]?.id ?? t.existingId,
            mode: "existing",
            editExisting: true,
          })),
        );
        setGuaranteeEntries((previous) =>
          previous.map((g, index) => ({
            ...g,
            guarantorId: saved?.guarantees[index]?.guarantor?.id ?? g.guarantorId,
          })),
        );
        setSavedInput(null);
        setSaveState("saved");
      } catch (cause) {
        setSaveState("idle");
        throw cause;
      } finally {
        activeSaveLock.current = null;
      }
    })();
    activeSaveLock.current = request;
    return request;
  }

  function scrollToSection(section: string) {
    setStage(section);
    content.current
      ?.querySelector(`[data-rental-flow-step="${section}"]`)
      ?.scrollIntoView({ block: "start" });
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    void (isDraft ? persistDraft() : saveActive()).catch((cause) =>
      setError(cause instanceof Error ? cause.message : "Erro ao salvar."),
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <InsurerSuggestions />
      <SheetContent
        side="right"
        ref={sheet}
        closeLabel="Fechar"
        className="flex h-[var(--rental-sheet-height,100dvh)] w-full flex-col gap-0 border-l border-border/60 bg-background p-0 sm:max-w-[min(1180px,96vw)]"
      >
        {/* Header sticky */}
        <SheetHeader className="sticky top-0 z-10 space-y-0 border-b border-border/60 bg-background/95 px-5 py-4 text-left backdrop-blur-xl sm:px-7 sm:py-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-md shadow-primary/25">
                <KeyRound className="size-5" />
              </div>
              <div>
                <SheetTitle className="text-xl font-bold tracking-tight sm:text-2xl">
                  {isEdit && !resumeForm ? "Editar aluguel" : "Novo aluguel"}
                </SheetTitle>
                <SheetDescription className="text-sm text-muted-foreground">
                  {isEdit
                    ? "Atualize imóvel, locatários, garantias e condições do contrato."
                    : "Cadastre imóvel, locatários e contrato em um único fluxo."}
                </SheetDescription>
              </div>
            </div>
          </div>
        </SheetHeader>

        <nav
          className="flex shrink-0 gap-1 overflow-x-auto border-b bg-background px-3 py-2 sm:px-7"
          aria-label="Etapas do aluguel"
        >
          {[
            ["dados", "Dados da locação"],
            ["contrato", "Contrato"],
            ["vistorias", "Vistorias"],
            ["anexos", "Anexos"],
          ].map(([key, label]) => (
            <Button
              key={key}
              type="button"
              size="sm"
              variant={key === stage ? "secondary" : "ghost"}
              aria-current={key === stage ? "step" : undefined}
              className="min-h-10 shrink-0"
              onClick={() => scrollToSection(key)}
            >
              {label}
            </Button>
          ))}
        </nav>
        <form
          noValidate
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div
            ref={content}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-7 sm:py-6"
          >
            <div className="mx-auto grid max-w-[1120px] items-start gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.9fr)]">
              <div className="space-y-4 scroll-mt-4" data-rental-flow-step="dados">
                <h2 className="text-lg font-semibold">Dados da locação</h2>
                {/* Imóvel */}
                <SectionCard
                  icon={Home}
                  title="Imóvel"
                  subtitle="Selecione ou cadastre o imóvel do contrato"
                  action={
                    <ModeToggle
                      value={propMode}
                      onChange={(mode) => {
                        setPropMode(mode);
                        if (mode === "new") setPropId("");
                      }}
                      disableExisting={properties.length === 0}
                    />
                  }
                >
                  {propMode === "existing" && (
                    <Field label="Selecione o imóvel" fieldId="property-select">
                      <select
                        required
                        value={propId}
                        onChange={(e) => {
                          setPropId(e.target.value);
                          const property = properties.find((item) => item.id === e.target.value);
                          if (property) applyProperty(property);
                        }}
                        className={inputCls}
                      >
                        <option value="">—</option>
                        {properties.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.apelido} · {p.bairro ?? ""}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                  <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-6">
                    <Field
                      label="Apelido / referência"
                      fieldId="property-reference"
                      className="sm:col-span-4"
                    >
                      <input
                        required
                        placeholder="Ex.: Edifício Aurora 401"
                        value={apelido}
                        onChange={(e) => setApelido(e.target.value)}
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Tipo" fieldId="property-type" className="sm:col-span-2">
                      <select
                        value={tipo}
                        onChange={(e) => setTipo(e.target.value as RentalPropertyType)}
                        className={inputCls}
                      >
                        {PROPERTY_TYPES.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Logradouro" fieldId="property-street" className="sm:col-span-4">
                      <input
                        required
                        placeholder="Rua, avenida..."
                        value={logradouro}
                        onChange={(e) => setLogradouro(e.target.value)}
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Número" className="sm:col-span-1">
                      <input
                        value={numero}
                        onChange={(e) => setNumero(e.target.value)}
                        className={inputCls}
                      />
                    </Field>
                    <Field label="UF" fieldId="property-state" className="sm:col-span-1">
                      <input
                        maxLength={2}
                        value={uf}
                        onChange={(e) => setUf(e.target.value.toUpperCase())}
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Bairro" className="sm:col-span-3">
                      <input
                        value={bairro}
                        onChange={(e) => setBairro(e.target.value)}
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Cidade" fieldId="property-city" className="sm:col-span-3">
                      <input
                        value={cidade}
                        onChange={(e) => setCidade(e.target.value)}
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Área (m²)" className="sm:col-span-3">
                      <input
                        type="number"
                        value={areaM2}
                        onChange={(e) => setAreaM2(e.target.value)}
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Quartos" className="sm:col-span-2">
                      <input
                        type="number"
                        value={quartos}
                        onChange={(e) => setQuartos(e.target.value)}
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Banheiros" className="sm:col-span-2">
                      <input
                        type="number"
                        value={banheiros}
                        onChange={(e) => setBanheiros(e.target.value)}
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Vagas" className="sm:col-span-2">
                      <input
                        type="number"
                        value={vagas}
                        onChange={(e) => setVagas(e.target.value)}
                        className={inputCls}
                      />
                    </Field>
                  </div>

                  <div className="mt-4 rounded-2xl border border-border/60 bg-background/60 p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="grid size-6 place-items-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
                        P
                      </span>
                      <span className="text-[12px] font-semibold text-foreground">
                        Proprietário do imóvel
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Field label="Nome completo" fieldId="owner-name" className="sm:col-span-2">
                        <input
                          value={propNome}
                          onChange={(e) => setPropNome(e.target.value)}
                          className={inputCls}
                          placeholder="Nome do proprietário"
                        />
                      </Field>
                      <Field label="CPF / CNPJ" fieldId="owner-cpf">
                        <input
                          value={propCpf}
                          onChange={(e) => setPropCpf(e.target.value)}
                          className={inputCls}
                          placeholder="000.000.000-00"
                        />
                      </Field>
                      <Field label="E-mail">
                        <input
                          type="email"
                          value={propEmail}
                          onChange={(e) => setPropEmail(e.target.value)}
                          className={inputCls}
                          placeholder="proprietario@email.com"
                        />
                      </Field>
                      <Field label="Telefone / Celular">
                        <input
                          type="tel"
                          value={propTelefone}
                          onChange={(e) => setPropTelefone(e.target.value)}
                          className={inputCls}
                          placeholder="(00) 00000-0000"
                        />
                      </Field>
                    </div>
                  </div>
                </SectionCard>

                {/* Locatários */}
                <SectionCard
                  icon={User}
                  title="Locatários"
                  subtitle="Um ou mais responsáveis pelo contrato"
                >
                  <div className="space-y-4">
                    {tenantEntries.map((t, idx) => (
                      <div
                        key={t.key}
                        className="rounded-2xl border border-border/60 bg-background/60 p-4"
                      >
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className="grid size-6 place-items-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
                              {idx + 1}
                            </span>
                            <span className="text-[12px] font-semibold text-foreground">
                              {idx === 0 ? "Locatário principal" : "Locatário adicional"}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <ModeToggle
                              value={t.mode}
                              onChange={(m) => updateTenant(t.key, { mode: m })}
                              disableExisting={tenants.length === 0}
                            />
                            {tenantEntries.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeTenant(t.key)}
                                className="grid size-8 place-items-center rounded-full text-rose-600 transition hover:bg-rose-500/10"
                                aria-label="Remover locatário"
                              >
                                <Trash2 className="size-4" />
                              </button>
                            )}
                          </div>
                        </div>

                        {t.mode === "existing" && (
                          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                            <Field
                              label="Selecione o locatário"
                              fieldId={`tenant-${idx}-select`}
                              className="flex-1"
                            >
                              <select
                                required
                                value={t.existingId}
                                onChange={(e) => {
                                  const id = e.target.value;
                                  const picked = tenants.find((x) => x.id === id);
                                  setTemplate((prev) => ({
                                    ...prev,
                                    tenants: prev.tenants?.map((entry, i) =>
                                      i === idx ? {} : entry,
                                    ),
                                  }));
                                  updateTenant(t.key, {
                                    existingId: id,
                                    nome: picked?.nome ?? "",
                                    telefone: picked?.telefone ?? "",
                                    email: picked?.email ?? "",
                                    cpfCnpj: picked?.cpfCnpj ?? "",
                                    profissao: picked?.profissao ?? "",
                                    renda:
                                      picked?.rendaAproximada != null
                                        ? String(picked.rendaAproximada).replace(".", ",")
                                        : "",
                                    endereco: picked?.endereco ?? "",
                                  });
                                }}
                                className={inputCls}
                              >
                                <option value="">—</option>
                                {tenants.map((opt) => (
                                  <option key={opt.id} value={opt.id}>
                                    {opt.nome}
                                  </option>
                                ))}
                              </select>
                            </Field>
                            <button
                              type="button"
                              onClick={() => updateTenant(t.key, { editExisting: !t.editExisting })}
                              disabled={!t.existingId}
                              className="rounded-xl border border-border/70 bg-background px-3 py-2 text-xs font-semibold text-foreground/80 transition hover:bg-muted/60 disabled:opacity-40"
                            >
                              {t.editExisting ? "Ocultar edição" : "Editar dados"}
                            </button>
                          </div>
                        )}

                        {(t.mode === "new" || (t.mode === "existing" && t.editExisting)) && (
                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <Field
                              label="Nome completo"
                              fieldId={`tenant-${idx}-name`}
                              className="sm:col-span-2"
                            >
                              <input
                                required
                                value={t.nome}
                                onChange={(e) => updateTenant(t.key, { nome: e.target.value })}
                                className={inputCls}
                              />
                            </Field>
                            <Field label="Telefone / WhatsApp" fieldId={`tenant-${idx}-phone`}>
                              <input
                                required
                                placeholder="(00) 00000-0000"
                                value={t.telefone}
                                onChange={(e) => updateTenant(t.key, { telefone: e.target.value })}
                                className={inputCls}
                              />
                            </Field>
                            <Field label="E-mail" fieldId={`tenant-${idx}-email`}>
                              <input
                                type="email"
                                value={t.email}
                                onChange={(e) => updateTenant(t.key, { email: e.target.value })}
                                className={inputCls}
                              />
                            </Field>
                            <Field label="CPF / CNPJ" fieldId={`tenant-${idx}-cpf`}>
                              <input
                                value={t.cpfCnpj}
                                onChange={(e) => updateTenant(t.key, { cpfCnpj: e.target.value })}
                                className={inputCls}
                              />
                            </Field>
                            <Field label="Profissão" fieldId={`tenant-${idx}-profession`}>
                              <input
                                value={t.profissao}
                                onChange={(e) => updateTenant(t.key, { profissao: e.target.value })}
                                className={inputCls}
                              />
                            </Field>
                            <Field label="Renda aproximada (R$)" className="sm:col-span-2">
                              <input
                                type="text"
                                inputMode="decimal"
                                placeholder="0,00"
                                value={t.renda}
                                onChange={(e) => updateTenant(t.key, { renda: e.target.value })}
                                className={inputCls}
                              />
                            </Field>
                            <Field
                              label="Endereço atual"
                              fieldId={`tenant-${idx}-address`}
                              className="sm:col-span-2"
                            >
                              <input
                                value={t.endereco}
                                onChange={(e) => updateTenant(t.key, { endereco: e.target.value })}
                                className={inputCls}
                              />
                            </Field>
                          </div>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addTenant}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-muted/30 py-2.5 text-xs font-semibold text-foreground/70 transition hover:bg-muted/60 hover:text-foreground"
                    >
                      <Plus className="size-3.5" /> Adicionar locatário
                    </button>
                  </div>
                </SectionCard>

                {/* Garantias */}
                <div data-rental-field="guarantees" tabIndex={-1}>
                  <SectionCard
                    icon={ShieldCheck}
                    title="Garantias"
                    subtitle="Uma ou mais garantias podem ser vinculadas"
                  >
                    <div className="space-y-4">
                      {guaranteeEntries.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          Nenhuma garantia adicionada. O contrato ficará sem garantia.
                        </p>
                      )}
                      {guaranteeEntries.map((g, idx) => (
                        <div
                          key={g.key}
                          className="rounded-2xl border border-border/60 bg-background/60 p-4"
                        >
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <span className="grid size-6 place-items-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
                                {idx + 1}
                              </span>
                              <select
                                value={g.tipo}
                                onChange={(e) =>
                                  updateGuarantee(g.key, {
                                    tipo: e.target.value as GuaranteeTipo,
                                  })
                                }
                                className="rounded-lg border border-border/60 bg-background px-2.5 py-1 text-xs font-semibold"
                              >
                                {GUAR_TIPO_OPTS.map((o) => (
                                  <option key={o.id} value={o.id}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeGuarantee(g.key)}
                              className="grid size-8 place-items-center rounded-full text-rose-600 transition hover:bg-rose-500/10"
                              aria-label="Remover garantia"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          </div>

                          {g.tipo === "fiador" && (
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                              <Field
                                label="Nome"
                                fieldId={`guarantor-${idx}-name`}
                                className="sm:col-span-2"
                              >
                                <input
                                  required
                                  value={g.guarNome}
                                  onChange={(e) =>
                                    updateGuarantee(g.key, { guarNome: e.target.value })
                                  }
                                  className={inputCls}
                                />
                              </Field>
                              <Field label="CPF / CNPJ" fieldId={`guarantor-${idx}-cpf`}>
                                <input
                                  value={g.guarCpfCnpj}
                                  onChange={(e) =>
                                    updateGuarantee(g.key, { guarCpfCnpj: e.target.value })
                                  }
                                  className={inputCls}
                                />
                              </Field>
                              <Field label="Telefone">
                                <input
                                  value={g.guarTel}
                                  onChange={(e) =>
                                    updateGuarantee(g.key, { guarTel: e.target.value })
                                  }
                                  className={inputCls}
                                />
                              </Field>
                              <Field label="E-mail">
                                <input
                                  type="email"
                                  value={g.guarEmail}
                                  onChange={(e) =>
                                    updateGuarantee(g.key, { guarEmail: e.target.value })
                                  }
                                  className={inputCls}
                                />
                              </Field>
                              <Field label="Vínculo com locatário" className="sm:col-span-2">
                                <input
                                  placeholder="Ex.: pai, irmão, sócio"
                                  value={g.guarVinculo}
                                  onChange={(e) =>
                                    updateGuarantee(g.key, { guarVinculo: e.target.value })
                                  }
                                  className={inputCls}
                                />
                              </Field>
                              <SpouseFields
                                fieldPrefix={`guarantor-${idx}-spouse`}
                                value={g.conjuge}
                                onChange={(conjuge) => updateGuarantee(g.key, { conjuge })}
                              />
                            </div>
                          )}
                          {g.tipo === "caucao" && (
                            <Field
                              label="Valor da caução (R$)"
                              fieldId={`guarantee-${idx}-deposit`}
                            >
                              <input
                                type="text"
                                inputMode="decimal"
                                required
                                placeholder="0,00"
                                value={g.valorCaucao}
                                onChange={(e) =>
                                  updateGuarantee(g.key, { valorCaucao: e.target.value })
                                }
                                className={inputCls}
                              />
                            </Field>
                          )}
                          {g.tipo === "seguro_fianca" && (
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                              <Field
                                label="Seguradora"
                                fieldId={`guarantee-${idx}-insurer`}
                                className="sm:col-span-2"
                              >
                                <input
                                  required
                                  list="rental-insurers-list"
                                  placeholder="Ex.: S8 Garante"
                                  value={g.seguroSeguradora}
                                  onChange={(e) =>
                                    updateGuarantee(g.key, { seguroSeguradora: e.target.value })
                                  }
                                  className={inputCls}
                                />
                              </Field>
                              <Field label="Nº da apólice">
                                <input
                                  value={g.seguroApolice}
                                  onChange={(e) =>
                                    updateGuarantee(g.key, { seguroApolice: e.target.value })
                                  }
                                  className={inputCls}
                                />
                              </Field>
                              <Field
                                label="Valor mensal do seguro (R$)"
                                fieldId={`guarantee-${idx}-premium`}
                              >
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  placeholder="0,00"
                                  value={g.seguroValor}
                                  onChange={(e) =>
                                    updateGuarantee(g.key, { seguroValor: e.target.value })
                                  }
                                  className={inputCls}
                                />
                              </Field>
                            </div>
                          )}
                        </div>
                      ))}

                      <div className="flex flex-wrap gap-2">
                        {GUAR_TIPO_OPTS.map((o) => (
                          <button
                            key={o.id}
                            type="button"
                            onClick={() => addGuarantee(o.id)}
                            className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border bg-muted/30 px-3 py-1.5 text-xs font-semibold text-foreground/70 transition hover:bg-muted/60 hover:text-foreground"
                          >
                            <Plus className="size-3.5" /> {o.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </SectionCard>
                </div>

                {/* Contrato */}
                <SectionCard
                  icon={FileText}
                  title="Condições da locação"
                  subtitle="Valores e vigência"
                >
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
                    <Field label="Valor mensal (R$)" fieldId="rent" className="sm:col-span-3">
                      <input
                        type="text"
                        inputMode="decimal"
                        required
                        placeholder="1.500,00"
                        value={valor}
                        onChange={(e) => setValor(e.target.value)}
                        className={inputCls}
                      />
                    </Field>
                    <Field
                      label="Comissão mensal (R$)"
                      fieldId="commission"
                      className="sm:col-span-3"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="150,00"
                          value={comissao}
                          onChange={(e) => setComissao(e.target.value)}
                          className={inputCls}
                        />
                        <span
                          className={cn(
                            "shrink-0 rounded-lg border border-primary/25 bg-primary/10 px-2.5 py-1.5 text-xs font-semibold tabular-nums text-primary",
                            comissaoPct === null && "opacity-50",
                          )}
                          title="Percentual da comissão sobre o valor mensal"
                        >
                          {comissaoPct === null
                            ? "--%"
                            : `${comissaoPct.toFixed(2).replace(".", ",")}%`}
                        </span>
                      </div>
                    </Field>
                    <Field label="Início" fieldId="starts" className="sm:col-span-2">
                      <input
                        type="date"
                        required
                        value={dataInicio}
                        onChange={(e) => setDataInicio(e.target.value)}
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Fim" fieldId="ends" className="sm:col-span-2">
                      <input
                        type="date"
                        required
                        value={dataFim}
                        onChange={(e) => setDataFim(e.target.value)}
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Dia de vencimento" fieldId="due" className="sm:col-span-2">
                      <input
                        type="number"
                        min={1}
                        max={31}
                        value={dia}
                        onChange={(e) => setDia(e.target.value)}
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Imobiliária responsável" className="sm:col-span-3">
                      <div className="inline-flex w-full rounded-full bg-muted/70 p-1">
                        {(["cordial", "morar"] as const).map((b) => (
                          <button
                            key={b}
                            type="button"
                            onClick={() => setBrand(b)}
                            className={`flex-1 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                              brand === b
                                ? "bg-primary text-primary-foreground shadow-sm"
                                : "text-foreground/65 hover:text-foreground"
                            }`}
                          >
                            {b === "cordial" ? "Cordial" : "Morar"}
                          </button>
                        ))}
                      </div>
                    </Field>
                    <Field label="Status" className="sm:col-span-3">
                      <select
                        value={status}
                        onChange={(e) => setStatus(e.target.value as RentalContractStatus)}
                        className={inputCls}
                      >
                        {status !== "ativo" && status !== "pendente_assinatura" && (
                          <option value={status}>{status}</option>
                        )}
                        <option value="ativo">Ativo</option>
                        <option value="pendente_assinatura">Pendente assinatura</option>
                      </select>
                    </Field>
                    <Field label="Observações" className="sm:col-span-6">
                      <textarea
                        value={obs}
                        onChange={(e) => setObs(e.target.value)}
                        rows={3}
                        placeholder="Cláusulas específicas, combinados, observações internas..."
                        className={`${inputCls} resize-none`}
                      />
                    </Field>
                  </div>
                </SectionCard>
              </div>
              <div className="space-y-4">
                <div data-rental-flow-step="contrato" className="scroll-mt-4">
                  <RentalContractWorkflow
                    id={workspaceId}
                    input={input}
                    onTemplateChange={setTemplate}
                    onFocusField={focusFieldInForm}
                    changesPending={dirty}
                    persistDraft={isDraft ? persistDraft : undefined}
                    beforePreview={isEdit ? saveActive : undefined}
                    onConfirmed={async () => {
                      await onConfirmed();
                      scrollToSection("vistorias");
                    }}
                  />
                </div>
                <div data-rental-flow-step="vistorias" className="space-y-3 scroll-mt-4">
                  <h2 className="text-lg font-semibold">Vistorias</h2>
                  <RentalEntryInspection
                    contractId={initial?.id ?? null}
                    sectionId="form-vistoria-entrada"
                    returnToForm={resumeForm}
                    preventStart={dirty && isEdit}
                  />
                  <RentalEntryInspection
                    contractId={initial?.id ?? null}
                    sectionId="form-vistoria-saida"
                    kind="saida"
                    returnToForm={resumeForm}
                  />
                </div>
                <div data-rental-flow-step="anexos" className="scroll-mt-4">
                  {initial ? (
                    <RentalDocuments contractId={initial.id} sectionId="form-anexos" />
                  ) : (
                    <DraftAttachments id={workspaceId} persistDraft={persistDraft} />
                  )}
                </div>
              </div>
            </div>
          </div>

          <div
            className={cn(
              "flex shrink-0 flex-wrap items-center justify-between gap-2 border-t bg-background px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-7",
              keyboardOpen && "max-sm:hidden",
            )}
          >
            <div className="min-w-0 text-xs text-muted-foreground">
              <p role="status">
                {saveState === "saving" || isSaving
                  ? "Salvando…"
                  : dirty
                    ? "Alterações pendentes"
                    : saveState === "saved"
                      ? isDraft
                        ? "Rascunho salvo"
                        : "Alterações salvas"
                      : ""}
              </p>
              {error && (
                <p role="alert" className="text-destructive">
                  {error}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                variant="outline"
                disabled={isSaving || saveState === "saving"}
                className="min-h-11"
              >
                {isDraft ? "Salvar rascunho" : "Salvar alterações"}
              </Button>
              {stage === "dados" && (
                <Button
                  type="button"
                  className="min-h-11 lg:hidden"
                  onClick={() => scrollToSection("contrato")}
                >
                  Ver checklist
                </Button>
              )}
            </div>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function InsurerSuggestions() {
  const { data } = useQuery({
    queryKey: ["rental-insurers", "names"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rental_insurers")
        .select("id,nome,active")
        .order("nome");
      if (error) throw error;
      return data;
    },
  });
  return (
    <datalist id="rental-insurers-list">
      {(data ?? [])
        .filter((i) => i.active)
        .map((i) => (
          <option key={i.id} value={i.nome} />
        ))}
    </datalist>
  );
}

function DraftAttachments({
  id,
  persistDraft,
}: {
  id: string;
  persistDraft: () => Promise<number>;
}) {
  const { documents, uploadWorkflowFile } = useRentalDocuments(id, true);
  const [pending, setPending] = useState<{
    file: File;
    category: Exclude<RentalDocumentCategory, "nota_fiscal">;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const uploading = useRef(false);

  async function upload(file: File, category: Exclude<RentalDocumentCategory, "nota_fiscal">) {
    if (uploading.current) return;
    uploading.current = true;
    setBusy(true);
    setPending({ file, category });
    setError(null);
    try {
      const revision = await persistDraft();
      const key = `ext-${await sha256Hex(await file.arrayBuffer())}-${category}`;
      await uploadWorkflowFile({
        file,
        key,
        revision: String(revision),
        origin: "externo",
        category,
      });
      setPending(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao enviar o anexo.");
    } finally {
      uploading.current = false;
      setBusy(false);
    }
  }
  return (
    <SectionCard icon={Paperclip} title="Anexos">
      <ul className="divide-y divide-border/70">
        {RENTAL_DOCUMENT_CATEGORIES.filter((entry) => entry.id !== "contrato_aluguel").map(
          ({ id: category, label }) => (
            <li className="flex flex-wrap items-center justify-between gap-2 py-2" key={category}>
              <div className="min-w-0">
                <p className="text-sm font-medium">{label}</p>
                {documents
                  .filter((doc) => doc.category === category)
                  .map((doc) => (
                    <a
                      className="block break-all text-xs text-primary underline"
                      key={doc.id}
                      href={doc.url ?? undefined}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {doc.fileName}
                    </a>
                  ))}
              </div>
              {category !== "nota_fiscal" && (
                <label className="inline-flex min-h-10 cursor-pointer items-center gap-1 rounded-md px-2 text-xs font-semibold text-primary focus-within:ring">
                  <Upload className="size-3.5" /> Adicionar
                  <input
                    type="file"
                    className="sr-only"
                    aria-label={`Adicionar ${label}`}
                    accept={DOC_ACCEPT}
                    disabled={busy}
                    onChange={(e) => {
                      const entry = e.target.files?.[0];
                      e.target.value = "";
                      if (entry) void upload(entry, category);
                    }}
                  />
                </label>
              )}
            </li>
          ),
        )}
      </ul>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {pending && !busy && (
        <Button
          type="button"
          variant="outline"
          onClick={() => void upload(pending.file, pending.category)}
        >
          Reenviar anexo
        </Button>
      )}
    </SectionCard>
  );
}
