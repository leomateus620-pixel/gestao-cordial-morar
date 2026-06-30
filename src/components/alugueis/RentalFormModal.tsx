import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type {
  RentalContractInput,
  RentalProperty,
  RentalPropertyType,
  RentalTenant,
} from "@/types/rental";

const inputCls =
  "w-full rounded-xl border border-white/60 bg-white/70 px-3 py-2 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground/55">
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10px] font-bold uppercase tracking-wider text-foreground/55">
      {children}
    </h3>
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

  const [hasGuarantor, setHasGuarantor] = useState(false);
  const [guarNome, setGuarNome] = useState("");
  const [guarTel, setGuarTel] = useState("");
  const [guarEmail, setGuarEmail] = useState("");
  const [guarVinculo, setGuarVinculo] = useState("");

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
    setHasGuarantor(false);
    setGuarNome("");
    setGuarTel("");
    setGuarEmail("");
    setGuarVinculo("");
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
        guarantor: hasGuarantor
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
        valorCaucao: caucao ? Number(caucao) : null,
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
        side="bottom"
        className="mx-auto max-h-[92vh] max-w-[560px] overflow-y-auto rounded-t-3xl border-white/60 bg-background/95 backdrop-blur-xl"
      >
        <SheetHeader className="text-left">
          <SheetTitle>Novo aluguel</SheetTitle>
          <SheetDescription className="text-[11px]">
            Cadastre imóvel, locatário e contrato em um único fluxo.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-4 space-y-5">
          {/* Imóvel */}
          <div className="liquid-panel space-y-3 rounded-2xl p-4">
            <SectionTitle>Imóvel</SectionTitle>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPropMode("existing")}
                disabled={properties.length === 0}
                className={`flex-1 rounded-full px-3 py-1.5 text-xs font-medium ${
                  propMode === "existing"
                    ? "bg-primary text-primary-foreground"
                    : "bg-white/60 text-foreground/65"
                } disabled:opacity-40`}
              >
                Existente
              </button>
              <button
                type="button"
                onClick={() => setPropMode("new")}
                className={`flex-1 rounded-full px-3 py-1.5 text-xs font-medium ${
                  propMode === "new"
                    ? "bg-primary text-primary-foreground"
                    : "bg-white/60 text-foreground/65"
                }`}
              >
                Novo
              </button>
            </div>
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
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <Field label="Apelido / referência">
                    <input
                      required
                      value={apelido}
                      onChange={(e) => setApelido(e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                </div>
                <Field label="Tipo">
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
                <Field label="UF">
                  <input value={uf} onChange={(e) => setUf(e.target.value)} className={inputCls} />
                </Field>
                <div className="col-span-2">
                  <Field label="Logradouro">
                    <input
                      required
                      value={logradouro}
                      onChange={(e) => setLogradouro(e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                </div>
                <Field label="Número">
                  <input
                    value={numero}
                    onChange={(e) => setNumero(e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Bairro">
                  <input
                    value={bairro}
                    onChange={(e) => setBairro(e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Cidade">
                  <input
                    value={cidade}
                    onChange={(e) => setCidade(e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Área (m²)">
                  <input
                    type="number"
                    value={areaM2}
                    onChange={(e) => setAreaM2(e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Quartos">
                  <input
                    type="number"
                    value={quartos}
                    onChange={(e) => setQuartos(e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Banheiros">
                  <input
                    type="number"
                    value={banheiros}
                    onChange={(e) => setBanheiros(e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Vagas">
                  <input
                    type="number"
                    value={vagas}
                    onChange={(e) => setVagas(e.target.value)}
                    className={inputCls}
                  />
                </Field>
              </div>
            )}
          </div>

          {/* Locatário */}
          <div className="liquid-panel space-y-3 rounded-2xl p-4">
            <SectionTitle>Locatário</SectionTitle>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTenantMode("existing")}
                disabled={tenants.length === 0}
                className={`flex-1 rounded-full px-3 py-1.5 text-xs font-medium ${
                  tenantMode === "existing"
                    ? "bg-primary text-primary-foreground"
                    : "bg-white/60 text-foreground/65"
                } disabled:opacity-40`}
              >
                Existente
              </button>
              <button
                type="button"
                onClick={() => setTenantMode("new")}
                className={`flex-1 rounded-full px-3 py-1.5 text-xs font-medium ${
                  tenantMode === "new"
                    ? "bg-primary text-primary-foreground"
                    : "bg-white/60 text-foreground/65"
                }`}
              >
                Novo
              </button>
            </div>
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
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <Field label="Nome completo">
                    <input
                      required
                      value={tenantNome}
                      onChange={(e) => setTenantNome(e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                </div>
                <Field label="Telefone / WhatsApp">
                  <input
                    required
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
                <Field label="CPF/CNPJ">
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
                <Field label="Renda aproximada">
                  <input
                    type="number"
                    value={tenantRenda}
                    onChange={(e) => setTenantRenda(e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <div className="col-span-2">
                  <Field label="Endereço atual">
                    <input
                      value={tenantEnd}
                      onChange={(e) => setTenantEnd(e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                </div>
              </div>
            )}
          </div>

          {/* Fiador */}
          <div className="liquid-panel space-y-3 rounded-2xl p-4">
            <label className="flex items-center justify-between">
              <SectionTitle>Fiador (opcional)</SectionTitle>
              <input
                type="checkbox"
                checked={hasGuarantor}
                onChange={(e) => setHasGuarantor(e.target.checked)}
                className="size-4"
              />
            </label>
            {hasGuarantor && (
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <Field label="Nome">
                    <input
                      required
                      value={guarNome}
                      onChange={(e) => setGuarNome(e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                </div>
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
                <div className="col-span-2">
                  <Field label="Vínculo com locatário">
                    <input
                      value={guarVinculo}
                      onChange={(e) => setGuarVinculo(e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                </div>
              </div>
            )}
          </div>

          {/* Contrato */}
          <div className="liquid-panel space-y-3 rounded-2xl p-4">
            <SectionTitle>Contrato</SectionTitle>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Valor mensal (R$)">
                <input
                  type="number"
                  required
                  min={0}
                  step="0.01"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Caução (R$)">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={caucao}
                  onChange={(e) => setCaucao(e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Início">
                <input
                  type="date"
                  required
                  value={dataInicio}
                  onChange={(e) => setDataInicio(e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Fim">
                <input
                  type="date"
                  required
                  value={dataFim}
                  onChange={(e) => setDataFim(e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Dia de vencimento">
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={dia}
                  onChange={(e) => setDia(e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Status">
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
              <div className="col-span-2">
                <Field label="Observações">
                  <textarea
                    value={obs}
                    onChange={(e) => setObs(e.target.value)}
                    rows={2}
                    className={inputCls}
                  />
                </Field>
              </div>
            </div>
          </div>

          {error && (
            <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSaving}
            className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 active:scale-[0.99] disabled:opacity-60"
          >
            {isSaving ? "Salvando…" : "Cadastrar aluguel"}
          </button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
