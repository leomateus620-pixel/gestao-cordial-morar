import { useState } from "react";
import { Home, User, ShieldCheck, FileText, KeyRound, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type {
  RentalContractInput,
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
    <div className="inline-flex w-full max-w-[280px] rounded-full bg-muted/70 p-1">
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

type Mode = "existing" | "new";

export function RentalFormModal({
  open,
  onOpenChange,
  properties,
  tenants,
  onSubmit,
  isSaving,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  properties: RentalProperty[];
  tenants: RentalTenant[];
  onSubmit: (input: RentalContractInput) => Promise<unknown>;
  isSaving: boolean;
}) {
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

  const [tenantMode, setTenantMode] = useState<Mode>("new");
  const [tenantId, setTenantId] = useState("");
  const [tenantNome, setTenantNome] = useState("");
  const [tenantTel, setTenantTel] = useState("");
  const [tenantEmail, setTenantEmail] = useState("");
  const [tenantCpf, setTenantCpf] = useState("");
  const [tenantProf, setTenantProf] = useState("");
  const [tenantRenda, setTenantRenda] = useState("");
  const [tenantEnd, setTenantEnd] = useState("");

  const [garantiaTipo, setGarantiaTipo] = useState<RentalGuaranteeType>("sem_garantia");
  const [guarNome, setGuarNome] = useState("");
  const [guarTel, setGuarTel] = useState("");
  const [guarEmail, setGuarEmail] = useState("");
  const [guarVinculo, setGuarVinculo] = useState("");
  const [seguroSeguradora, setSeguroSeguradora] = useState("");
  const [seguroApolice, setSeguroApolice] = useState("");
  const [seguroValor, setSeguroValor] = useState("");

  const [valor, setValor] = useState("");
  const [caucao, setCaucao] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [dia, setDia] = useState("10");
  const [status, setStatus] = useState<"ativo" | "pendente_assinatura">("ativo");
  const [obs, setObs] = useState("");
  const [error, setError] = useState<string | null>(null);

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
    setTenantMode("new");
    setTenantId("");
    setTenantNome("");
    setTenantTel("");
    setTenantEmail("");
    setTenantCpf("");
    setTenantProf("");
    setTenantRenda("");
    setTenantEnd("");
    setGarantiaTipo("sem_garantia");
    setGuarNome("");
    setGuarTel("");
    setGuarEmail("");
    setGuarVinculo("");
    setSeguroSeguradora("");
    setSeguroApolice("");
    setSeguroValor("");
    setValor("");
    setCaucao("");
    setDataInicio("");
    setDataFim("");
    setDia("10");
    setStatus("ativo");
    setObs("");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const input: RentalContractInput = {
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
                  areaM2: areaM2 ? Number(areaM2) : null,
                  valorSugerido: valor ? Number(valor) : null,
                  status: "alugado",
                  observacoes: null,
                  brand: "cordial",
                },
              },
        tenant:
          tenantMode === "existing"
            ? { existingId: tenantId }
            : {
                data: {
                  nome: tenantNome,
                  cpfCnpj: tenantCpf || null,
                  telefone: tenantTel,
                  email: tenantEmail || null,
                  dataNascimento: null,
                  endereco: tenantEnd || null,
                  profissao: tenantProf || null,
                  rendaAproximada: tenantRenda ? Number(tenantRenda) : null,
                  observacoes: null,
                },
              },
        guarantor:
          garantiaTipo === "fiador"
            ? {
                data: {
                  nome: guarNome,
                  cpfCnpj: null,
                  telefone: guarTel || null,
                  email: guarEmail || null,
                  endereco: null,
                  profissao: null,
                  vinculo: guarVinculo || null,
                  observacoes: null,
                },
              }
            : null,
        valorMensal: Number(valor),
        valorCaucao: garantiaTipo === "caucao" && caucao ? Number(caucao) : null,
        garantiaTipo,
        seguroSeguradora:
          garantiaTipo === "seguro_fianca" ? seguroSeguradora || null : null,
        seguroApolice: garantiaTipo === "seguro_fianca" ? seguroApolice || null : null,
        seguroValorMensal:
          garantiaTipo === "seguro_fianca" && seguroValor ? Number(seguroValor) : null,
        dataInicio,
        dataFim,
        diaVencimento: Number(dia),
        status,
        paymentStatus: "pendente",
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
                  Novo aluguel
                </SheetTitle>
                <SheetDescription className="text-sm text-muted-foreground">
                  Cadastre imóvel, locatário e contrato em um único fluxo.
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
        <form
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col overflow-hidden"
        >
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

            {/* Locatário */}
            <SectionCard
              icon={User}
              title="Locatário"
              subtitle="Dados do inquilino responsável pelo contrato"
              action={
                <ModeToggle
                  value={tenantMode}
                  onChange={setTenantMode}
                  disableExisting={tenants.length === 0}
                />
              }
            >
              {tenantMode === "existing" ? (
                <Field label="Selecione o locatário">
                  <select
                    required
                    value={tenantId}
                    onChange={(e) => setTenantId(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">—</option>
                    {tenants.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nome}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Nome completo" className="sm:col-span-2">
                    <input
                      required
                      value={tenantNome}
                      onChange={(e) => setTenantNome(e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Telefone / WhatsApp">
                    <input
                      required
                      placeholder="(00) 00000-0000"
                      value={tenantTel}
                      onChange={(e) => setTenantTel(e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="E-mail">
                    <input
                      type="email"
                      value={tenantEmail}
                      onChange={(e) => setTenantEmail(e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="CPF / CNPJ">
                    <input
                      value={tenantCpf}
                      onChange={(e) => setTenantCpf(e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Profissão">
                    <input
                      value={tenantProf}
                      onChange={(e) => setTenantProf(e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Renda aproximada (R$)" className="sm:col-span-2">
                    <input
                      type="number"
                      value={tenantRenda}
                      onChange={(e) => setTenantRenda(e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Endereço atual" className="sm:col-span-2">
                    <input
                      value={tenantEnd}
                      onChange={(e) => setTenantEnd(e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                </div>
              )}
            </SectionCard>

            {/* Garantia */}
            <SectionCard
              icon={ShieldCheck}
              title="Garantia"
              subtitle="Modalidade de garantia do contrato"
            >
              <div className="mb-4 grid grid-cols-2 gap-1.5 rounded-xl bg-muted/60 p-1 sm:grid-cols-4">
                {(
                  [
                    { id: "sem_garantia", label: "Sem garantia" },
                    { id: "fiador", label: "Fiador" },
                    { id: "caucao", label: "Caução" },
                    { id: "seguro_fianca", label: "Seguro fiança" },
                  ] as { id: RentalGuaranteeType; label: string }[]
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setGarantiaTipo(opt.id)}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                      garantiaTipo === opt.id
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-foreground/70 hover:text-foreground"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {garantiaTipo === "sem_garantia" && (
                <p className="text-sm text-muted-foreground">
                  Nenhuma garantia será vinculada a este contrato.
                </p>
              )}

              {garantiaTipo === "fiador" && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Nome" className="sm:col-span-2">
                    <input
                      required
                      value={guarNome}
                      onChange={(e) => setGuarNome(e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Telefone">
                    <input
                      value={guarTel}
                      onChange={(e) => setGuarTel(e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="E-mail">
                    <input
                      type="email"
                      value={guarEmail}
                      onChange={(e) => setGuarEmail(e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Vínculo com locatário" className="sm:col-span-2">
                    <input
                      placeholder="Ex.: pai, irmão, sócio"
                      value={guarVinculo}
                      onChange={(e) => setGuarVinculo(e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                </div>
              )}

              {garantiaTipo === "caucao" && (
                <Field label="Valor da caução (R$)">
                  <input
                    type="number"
                    required
                    min={0}
                    step="0.01"
                    placeholder="0,00"
                    value={caucao}
                    onChange={(e) => setCaucao(e.target.value)}
                    className={inputCls}
                  />
                </Field>
              )}

              {garantiaTipo === "seguro_fianca" && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Seguradora" className="sm:col-span-2">
                    <input
                      required
                      placeholder="Ex.: Porto Seguro"
                      value={seguroSeguradora}
                      onChange={(e) => setSeguroSeguradora(e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Nº da apólice">
                    <input
                      value={seguroApolice}
                      onChange={(e) => setSeguroApolice(e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Valor mensal do seguro (R$)">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="0,00"
                      value={seguroValor}
                      onChange={(e) => setSeguroValor(e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                </div>
              )}
            </SectionCard>


            {/* Contrato */}
            <SectionCard
              icon={FileText}
              title="Contrato"
              subtitle="Valores, vigência e condições do aluguel"
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
                <Field label="Valor mensal (R$)" className="sm:col-span-3">
                  <input
                    type="number"
                    required
                    min={0}
                    step="0.01"
                    placeholder="0,00"
                    value={valor}
                    onChange={(e) => setValor(e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Caução (R$)" className="sm:col-span-3">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="0,00"
                    value={caucao}
                    onChange={(e) => setCaucao(e.target.value)}
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
