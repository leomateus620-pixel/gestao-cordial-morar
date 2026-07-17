import { useEffect, useState } from "react";
import {
  Home,
  User,
  ShieldCheck,
  FileText,
  KeyRound,
  X,
  Plus,
  Trash2,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { parseBRLNumber } from "@/lib/format";
import type {
  RentalContractFull,
  RentalContractGuaranteeInput,
  RentalContractInput,
  RentalContractTenantInput,
  RentalGuaranteeType,
  RentalProperty,
  RentalPropertyType,
  RentalTenant,
} from "@/types/rental";

const inputCls =
  "w-full rounded-xl border border-border/70 bg-background px-3.5 py-2.5 text-sm font-medium text-foreground shadow-sm transition outline-none placeholder:text-foreground/40 hover:border-border focus:border-primary focus:ring-2 focus:ring-primary/25 disabled:opacity-50";

function Field({
  label,
  htmlFor,
  children,
  className = "",
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`block ${className}`}>
      <label
        htmlFor={htmlFor}
        className="text-[11px] font-semibold uppercase tracking-wide text-foreground/75"
      >
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
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
            {subtitle && (
              <p className="text-[11px] text-muted-foreground">{subtitle}</p>
            )}
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
  const baseBtn =
    "relative flex-1 rounded-full px-3 py-1.5 text-xs font-semibold transition";
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
    nome: "",
    telefone: "",
    email: "",
    cpfCnpj: "",
    profissao: "",
    renda: "",
    endereco: "",
  };
}

function tenantEntryToInput(t: TenantEntry): RentalContractTenantInput {
  if (t.mode === "existing") return { existingId: t.existingId };
  const renda = t.renda ? parseBRLNumber(t.renda) : NaN;
  return {
    data: {
      nome: t.nome,
      cpfCnpj: t.cpfCnpj || null,
      telefone: t.telefone,
      email: t.email || null,
      dataNascimento: null,
      endereco: t.endereco || null,
      profissao: t.profissao || null,
      rendaAproximada: Number.isFinite(renda) ? renda : null,
      observacoes: null,
    },
  };
}

// -------- Guarantee entry --------
type GuaranteeTipo = Exclude<RentalGuaranteeType, "sem_garantia">;
type GuaranteeEntry = {
  key: string;
  tipo: GuaranteeTipo;
  // fiador
  guarNome: string;
  guarTel: string;
  guarEmail: string;
  guarVinculo: string;
  // caução
  valorCaucao: string;
  // seguro
  seguroSeguradora: string;
  seguroApolice: string;
  seguroValor: string;
};

function newGuaranteeEntry(tipo: GuaranteeTipo = "fiador"): GuaranteeEntry {
  return {
    key: crypto.randomUUID(),
    tipo,
    guarNome: "",
    guarTel: "",
    guarEmail: "",
    guarVinculo: "",
    valorCaucao: "",
    seguroSeguradora: "",
    seguroApolice: "",
    seguroValor: "",
  };
}

function guaranteeEntryToInput(g: GuaranteeEntry): RentalContractGuaranteeInput {
  if (g.tipo === "fiador") {
    return {
      tipo: "fiador",
      guarantor: {
        data: {
          nome: g.guarNome,
          cpfCnpj: null,
          telefone: g.guarTel || null,
          email: g.guarEmail || null,
          endereco: null,
          profissao: null,
          vinculo: g.guarVinculo || null,
          observacoes: null,
        },
      },
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
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  properties: RentalProperty[];
  tenants: RentalTenant[];
  onSubmit: (input: RentalContractInput) => Promise<unknown>;
  isSaving: boolean;
  initial?: RentalContractFull | null;
}) {
  const isEdit = !!initial;
  const [propMode, setPropMode] = useState<Mode>("new");
  const [propId, setPropId] = useState("");
  const [apelido, setApelido] = useState("");
  const [tipo, setTipo] = useState<RentalPropertyType>("apartamento");
  const [logradouro, setLogradouro] = useState("");
  const [numero, setNumero] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [quartos, setQuartos] = useState("");
  const [banheiros, setBanheiros] = useState("");
  const [vagas, setVagas] = useState("");
  const [areaM2, setAreaM2] = useState("");

  const [tenantEntries, setTenantEntries] = useState<TenantEntry[]>([
    newTenantEntry(),
  ]);
  const [guaranteeEntries, setGuaranteeEntries] = useState<GuaranteeEntry[]>([]);

  const [valor, setValor] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [dia, setDia] = useState("10");
  const [status, setStatus] = useState<"ativo" | "pendente_assinatura">("ativo");
  const [obs, setObs] = useState("");
  const [error, setError] = useState<string | null>(null);

  function updateTenant(key: string, patch: Partial<TenantEntry>) {
    setTenantEntries((prev) =>
      prev.map((t) => (t.key === key ? { ...t, ...patch } : t)),
    );
  }
  function removeTenant(key: string) {
    setTenantEntries((prev) => (prev.length <= 1 ? prev : prev.filter((t) => t.key !== key)));
  }
  function addTenant() {
    setTenantEntries((prev) => [...prev, newTenantEntry()]);
  }

  function updateGuarantee(key: string, patch: Partial<GuaranteeEntry>) {
    setGuaranteeEntries((prev) =>
      prev.map((g) => (g.key === key ? { ...g, ...patch } : g)),
    );
  }
  function removeGuarantee(key: string) {
    setGuaranteeEntries((prev) => prev.filter((g) => g.key !== key));
  }
  function addGuarantee(t: GuaranteeTipo) {
    setGuaranteeEntries((prev) => [...prev, newGuaranteeEntry(t)]);
  }

  function reset() {
    setPropMode("new");
    setPropId("");
    setApelido("");
    setTipo("apartamento");
    setLogradouro("");
    setNumero("");
    setBairro("");
    setCidade("");
    setUf("");
    setQuartos("");
    setBanheiros("");
    setVagas("");
    setAreaM2("");
    setTenantEntries([newTenantEntry()]);
    setGuaranteeEntries([]);
    setValor("");
    setDataInicio("");
    setDataFim("");
    setDia("10");
    setStatus("ativo");
    setObs("");
    setError(null);
  }

  // Prefill state whenever the modal opens with an `initial` contract, or reset for new.
  useEffect(() => {
    if (!open) return;
    if (!initial) {
      reset();
      return;
    }
    const c = initial;
    setError(null);
    // Property: pick "existing" to avoid altering the property row unless user chooses.
    setPropMode("existing");
    setPropId(c.property.id);
    setApelido(c.property.apelido);
    setTipo(c.property.tipo);
    setLogradouro(c.property.logradouro);
    setNumero(c.property.numero ?? "");
    setBairro(c.property.bairro ?? "");
    setCidade(c.property.cidade ?? "");
    setUf(c.property.uf ?? "");
    setQuartos(c.property.quartos != null ? String(c.property.quartos) : "");
    setBanheiros(c.property.banheiros != null ? String(c.property.banheiros) : "");
    setVagas(c.property.vagas != null ? String(c.property.vagas) : "");
    setAreaM2(c.property.areaM2 != null ? String(c.property.areaM2) : "");

    const tList = c.tenants && c.tenants.length > 0 ? c.tenants : [c.tenant];
    setTenantEntries(
      tList.map((t) => ({
        key: crypto.randomUUID(),
        mode: "existing" as Mode,
        existingId: t.id,
        nome: t.nome,
        telefone: t.telefone,
        email: t.email ?? "",
        cpfCnpj: t.cpfCnpj ?? "",
        profissao: t.profissao ?? "",
        renda: t.rendaAproximada != null ? String(t.rendaAproximada) : "",
        endereco: t.endereco ?? "",
      })),
    );

    setGuaranteeEntries(
      (c.guarantees ?? []).map((g) => ({
        key: crypto.randomUUID(),
        tipo: g.tipo,
        guarNome: g.guarantor?.nome ?? "",
        guarTel: g.guarantor?.telefone ?? "",
        guarEmail: g.guarantor?.email ?? "",
        guarVinculo: g.guarantor?.vinculo ?? "",
        valorCaucao: g.valorCaucao != null ? String(g.valorCaucao).replace(".", ",") : "",
        seguroSeguradora: g.seguroSeguradora ?? "",
        seguroApolice: g.seguroApolice ?? "",
        seguroValor:
          g.seguroValorMensal != null ? String(g.seguroValorMensal).replace(".", ",") : "",
      })),
    );

    setValor(String(c.valorMensal).replace(".", ","));
    setDataInicio(c.dataInicio.slice(0, 10));
    setDataFim(c.dataFim.slice(0, 10));
    setDia(String(c.diaVencimento));
    setStatus(
      c.status === "ativo" || c.status === "pendente_assinatura" ? c.status : "ativo",
    );
    setObs(c.observacoes ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const parsedValor = parseBRLNumber(valor);
      if (!Number.isFinite(parsedValor) || parsedValor <= 0) {
        setError("Informe um valor mensal válido (ex.: 1.500,00).");
        return;
      }
      const parsedArea = areaM2 ? parseBRLNumber(areaM2) : NaN;
      const input: RentalContractInput = {
        ...(isEdit && initial ? { contractId: initial.id } : {}),
        property:
          propMode === "existing"
            ? { existingId: propId }
            : {
                data: {
                  apelido,
                  tipo,
                  logradouro,
                  numero: numero || null,
                  complemento: null,
                  bairro: bairro || null,
                  cidade: cidade || null,
                  uf: uf || null,
                  cep: null,
                  quartos: quartos ? Number(quartos) : null,
                  banheiros: banheiros ? Number(banheiros) : null,
                  vagas: vagas ? Number(vagas) : null,
                  areaM2: Number.isFinite(parsedArea) ? parsedArea : null,
                  valorSugerido: parsedValor,
                  status: "alugado",
                  observacoes: null,
                  brand: "cordial",
                },
              },
        tenants: tenantEntries.map(tenantEntryToInput),
        guarantees: guaranteeEntries.map(guaranteeEntryToInput),
        garantiaTipo: guaranteeEntries[0]?.tipo ?? "sem_garantia",
        valorMensal: parsedValor,
        dataInicio,
        dataFim,
        diaVencimento: Number(dia),
        status,
        paymentStatus: initial?.paymentStatus ?? "pendente",
        proximoVencimento: null,
        observacoes: obs || null,
        brand: "cordial",
      };
      await onSubmit(input);
      reset();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar.");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 border-l border-border/60 bg-background p-0 sm:max-w-[680px]"
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
                  {isEdit ? "Editar aluguel" : "Novo aluguel"}
                </SheetTitle>
                <SheetDescription className="text-sm text-muted-foreground">
                  {isEdit
                    ? "Atualize imóvel, locatários, garantias e condições do contrato."
                    : "Cadastre imóvel, locatários e contrato em um único fluxo."}
                </SheetDescription>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="grid size-9 shrink-0 place-items-center rounded-full text-foreground/60 transition hover:bg-muted hover:text-foreground"
              aria-label="Fechar"
            >
              <X className="size-4" />
            </button>
          </div>
        </SheetHeader>

        {/* Scrollable form */}
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-6 sm:px-7">
            {/* Imóvel */}
            <SectionCard
              icon={Home}
              title="Imóvel"
              subtitle="Selecione ou cadastre o imóvel do contrato"
              action={
                <ModeToggle
                  value={propMode}
                  onChange={setPropMode}
                  disableExisting={properties.length === 0}
                />
              }
            >
              {propMode === "existing" ? (
                <Field label="Selecione o imóvel">
                  <select
                    required
                    value={propId}
                    onChange={(e) => setPropId(e.target.value)}
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
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
                  <Field label="Apelido / referência" className="sm:col-span-4">
                    <input
                      required
                      placeholder="Ex.: Edifício Aurora 401"
                      value={apelido}
                      onChange={(e) => setApelido(e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Tipo" className="sm:col-span-2">
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
                  <Field label="Logradouro" className="sm:col-span-4">
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
                  <Field label="UF" className="sm:col-span-1">
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
                  <Field label="Cidade" className="sm:col-span-3">
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
              )}
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

                    {t.mode === "existing" ? (
                      <Field label="Selecione o locatário">
                        <select
                          required
                          value={t.existingId}
                          onChange={(e) =>
                            updateTenant(t.key, { existingId: e.target.value })
                          }
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
                    ) : (
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <Field label="Nome completo" className="sm:col-span-2">
                          <input
                            required
                            value={t.nome}
                            onChange={(e) => updateTenant(t.key, { nome: e.target.value })}
                            className={inputCls}
                          />
                        </Field>
                        <Field label="Telefone / WhatsApp">
                          <input
                            required
                            placeholder="(00) 00000-0000"
                            value={t.telefone}
                            onChange={(e) =>
                              updateTenant(t.key, { telefone: e.target.value })
                            }
                            className={inputCls}
                          />
                        </Field>
                        <Field label="E-mail">
                          <input
                            type="email"
                            value={t.email}
                            onChange={(e) => updateTenant(t.key, { email: e.target.value })}
                            className={inputCls}
                          />
                        </Field>
                        <Field label="CPF / CNPJ">
                          <input
                            value={t.cpfCnpj}
                            onChange={(e) =>
                              updateTenant(t.key, { cpfCnpj: e.target.value })
                            }
                            className={inputCls}
                          />
                        </Field>
                        <Field label="Profissão">
                          <input
                            value={t.profissao}
                            onChange={(e) =>
                              updateTenant(t.key, { profissao: e.target.value })
                            }
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
                        <Field label="Endereço atual" className="sm:col-span-2">
                          <input
                            value={t.endereco}
                            onChange={(e) =>
                              updateTenant(t.key, { endereco: e.target.value })
                            }
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
                        <Field label="Nome" className="sm:col-span-2">
                          <input
                            required
                            value={g.guarNome}
                            onChange={(e) =>
                              updateGuarantee(g.key, { guarNome: e.target.value })
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
                      </div>
                    )}
                    {g.tipo === "caucao" && (
                      <Field label="Valor da caução (R$)">
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
                        <Field label="Seguradora" className="sm:col-span-2">
                          <input
                            required
                            placeholder="Ex.: Porto Seguro"
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
                        <Field label="Valor mensal do seguro (R$)">
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

            {/* Contrato */}
            <SectionCard
              icon={FileText}
              title="Contrato"
              subtitle="Valores, vigência e condições do aluguel"
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
                <Field label="Valor mensal (R$)" className="sm:col-span-6">
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
                <Field label="Início" className="sm:col-span-2">
                  <input
                    type="date"
                    required
                    value={dataInicio}
                    onChange={(e) => setDataInicio(e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Fim" className="sm:col-span-2">
                  <input
                    type="date"
                    required
                    value={dataFim}
                    onChange={(e) => setDataFim(e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Dia de vencimento" className="sm:col-span-2">
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={dia}
                    onChange={(e) => setDia(e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Status" className="sm:col-span-6">
                  <select
                    value={status}
                    onChange={(e) =>
                      setStatus(e.target.value as "ativo" | "pendente_assinatura")
                    }
                    className={inputCls}
                  >
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

            {error && (
              <div
                role="alert"
                className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
              >
                {error}
              </div>
            )}
          </div>

          {/* Footer sticky */}
          <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-border/60 bg-background/95 px-5 py-4 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-end sm:gap-3 sm:px-7">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-xl border border-border/70 bg-background px-5 py-2.5 text-sm font-semibold text-foreground/80 transition hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
            >
              {isSaving ? "Salvando…" : "Cadastrar aluguel"}
            </button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
