import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { Check, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { PropertyCarteira, PropertyOperacao, PropertyWriteInput } from "@/types/property";
import { usePropertyCodeReservation } from "@/hooks/usePropertyCode";
import { PropertyPhotosStep } from "./PropertyPhotosStep";
import { PublishTargetSelector } from "./PublishTargetSelector";
import {
  ProviderCodeFields,
  type ProviderCodeState,
  type ProviderCodes,
} from "./ProviderCodeFields";

export const TIPOS = [
  "Casa",
  "Apartamento",
  "Sobrado",
  "Terreno",
  "Sala Comercial",
  "Comercial",
  "Galpão",
  "Chácara",
  "Sítio / Chácara",
  "Área",
  "Área Rural",
  "Prédio",
];

const UF_PADRAO = "RS";
/** A operação é concentrada em Santa Rosa / RS: o cadastro já abre preenchido. */
const CIDADE_PADRAO = "Santa Rosa";

export function maskPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  const split = digits.length > 10 ? 7 : 6;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, split)}-${digits.slice(split)}`;
}

export function maskCep(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

export const inputCls =
  "w-full rounded-2xl border border-white/60 bg-white/70 px-3 py-2 text-sm outline-none transition focus:border-primary/50 focus:bg-white";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-foreground/50">
        {label}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-[10px] text-foreground/45">{hint}</span> : null}
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={
        "flex items-center justify-between gap-3 rounded-2xl px-3 py-2 text-xs font-semibold transition " +
        (checked ? "bg-primary/12 text-primary" : "bg-foreground/[0.04] text-foreground/55")
      }
    >
      {label}
      <span
        className={
          "grid size-5 place-items-center rounded-full border " +
          (checked ? "border-primary bg-primary text-primary-foreground" : "border-foreground/20")
        }
      >
        {checked ? <Check className="size-3" /> : null}
      </span>
    </button>
  );
}

export type PropertyFormValues = PropertyWriteInput;

export function emptyPropertyValues(): PropertyFormValues {
  return {
    carteira: "cordial",
    operacao: "venda",
    finalidade: null,
    tipo: "Casa",
    codigo: null,
    codigoCordial: null,
    codigoMorar: null,
    referencia: null,
    localizacaoExibida: null,
    cep: null,
    logradouro: null,
    numero: null,
    bairro: null,
    cidade: CIDADE_PADRAO,
    uf: UF_PADRAO,
    zona: null,
    regiao: null,
    dormitorios: null,
    suites: null,
    banheiros: null,
    vagas: null,
    salas: null,
    areaPrincipal: null,
    areaTipo: null,
    areaTotal: null,
    areaUtil: null,
    areaConstruida: null,
    areaTerreno: null,
    mobiliado: false,
    valor: null,
    valorModo: "fixo",
    valorIptu: null,
    valorCondominio: null,
    aceitaFinanciamento: false,
    permuta: false,
    descricaoImovel: null,
    pontosFortes: null,
    exclusividade: false,
    autorizacao: false,
    escriturada: false,
    averbada: false,
    comPlaca: false,
    disponibilidade: null,
    exibirImovel: true,
    destaqueInicial: false,
    proprietarioNome: null,
    proprietarioTelefone: null,
    proprietarioEmail: null,
    origemCaptacao: null,
    nomeEmpreendimento: null,
    unidade: null,
  };
}

const BASE_STEPS = [
  "Destino e identificação",
  "Localização",
  "Características e áreas",
  "Valores e condições",
  "Descrição",
  "Divulgação e revisão",
];

function num(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function str(v: number | null | undefined): string {
  return v === null || v === undefined ? "" : String(v);
}

export function PropertyForm({
  initial,
  submitLabel,
  pending,
  onSubmit,
  onCancel,
  showDestinos = true,
  destinos,
  onDestinosChange,
  propertyId,
  onRequestSave,
  onCodeReserved,
  onValuesChange,
  bairros,
  extraStep,
  extraSteps,
}: {
  initial: PropertyFormValues;
  submitLabel: string;
  pending?: boolean;
  onSubmit: (values: PropertyFormValues) => void;
  onCancel?: () => void;
  showDestinos?: boolean;
  destinos?: PropertyCarteira[];
  onDestinosChange?: (providers: PropertyCarteira[]) => void;
  propertyId?: string | null;
  onRequestSave?: () => Promise<string | null>;
  onCodeReserved?: (reservationId: string, provider: PropertyCarteira) => void;
  onValuesChange?: (values: PropertyFormValues) => void;
  /** Bairros já usados nos imóveis publicados nos sites Cordial/Morar. */
  bairros?: string[];
  /** Etapas opcionais adicionais (Etapa 7 — Agenciamento, Etapa 8 — Google Drive). */
  extraStep?: {
    label: string;
    render: (ctx: { values: PropertyFormValues; goToStep: (index: number) => void }) => ReactNode;
  };
  extraSteps?: Array<{
    label: string;
    render: (ctx: { values: PropertyFormValues; goToStep: (index: number) => void }) => ReactNode;
  }>;
}) {
  const extras = useMemo(
    () => [...(extraStep ? [extraStep] : []), ...(extraSteps ?? [])],
    [extraStep, extraSteps],
  );
  const [values, setValues] = useState<PropertyFormValues>(initial);
  const [step, setStep] = useState(0);
  const bairroListId = useId();
  const bairroOptions = useMemo(() => {
    const set = new Set<string>();
    for (const item of bairros ?? []) if (item?.trim()) set.add(item.trim());
    if (values.bairro?.trim()) set.add(values.bairro.trim());
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [bairros, values.bairro]);
  const STEPS = useMemo(() => [...BASE_STEPS, ...extras.map((e) => e.label)], [extras]);
  const codes = usePropertyCodeReservation();
  const [providerCodes, setProviderCodes] = useState<ProviderCodes>(() => {
    const base: ProviderCodes = {};
    if (initial.codigoCordial)
      base.cordial = { code: initial.codigoCordial, reservationId: null, status: "reserved" };
    if (initial.codigoMorar)
      base.morar = { code: initial.codigoMorar, reservationId: null, status: "reserved" };
    return base;
  });
  const activeTargets = useMemo<PropertyCarteira[]>(() => {
    const selected = destinos ?? [];
    if (selected.length) return selected;
    return showDestinos ? [] : [values.carteira];
  }, [showDestinos, destinos, values.carteira]);

  useEffect(() => {
    onValuesChange?.(values);
    // Só o conteúdo do formulário deve disparar o aviso ao pai.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values]);

  function set<K extends keyof PropertyFormValues>(key: K, value: PropertyFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function setProviderCode(provider: PropertyCarteira, patch: Partial<ProviderCodeState> | null) {
    setProviderCodes((prev) => {
      if (patch === null) {
        const next = { ...prev };
        delete next[provider];
        return next;
      }
      const current = prev[provider] ?? {
        code: "",
        reservationId: null,
        status: "reserved" as const,
      };
      return { ...prev, [provider]: { ...current, ...patch } };
    });
  }

  /** Reserva independente por imobiliária: falha em uma nunca afeta a outra. */
  async function reserveCode(provider: PropertyCarteira) {
    if (providerCodes[provider]?.status === "generating") return;
    setProviderCode(provider, {
      status: "generating",
      message: "Consultando o próximo código livre…",
    });
    try {
      const reservation = await codes.reserve.mutateAsync(provider);
      setProviderCode(provider, {
        code: reservation.code,
        reservationId: reservation.reservationId,
        status: "reserved",
        message: reservation.verified
          ? `Confirmado como livre no site.`
          : `Reservado. Não foi possível confirmar com o site agora.`,
      });
      set(provider === "cordial" ? "codigoCordial" : "codigoMorar", reservation.code);
      onCodeReserved?.(reservation.reservationId, provider);
      toast.success(
        `Código ${reservation.code} reservado na ${provider === "cordial" ? "Cordial" : "Morar"}.`,
      );
    } catch (err) {
      const message = (err as Error)?.message ?? "Não foi possível gerar o código.";
      const conflict = /uso no site|já est/i.test(message);
      setProviderCode(provider, { status: conflict ? "conflict" : "error", message });
      toast.error(message);
    }
  }

  function manualCode(provider: PropertyCarteira, code: string) {
    setProviderCode(provider, {
      code,
      reservationId: null,
      status: "reserved",
      message: "Código informado manualmente.",
    });
    set(provider === "cordial" ? "codigoCordial" : "codigoMorar", code || null);
  }

  const canSubmit = useMemo(() => !!values.tipo && !pending, [values.tipo, pending]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        if (values.proprietarioEmail && !isValidEmail(values.proprietarioEmail)) {
          toast.error("Informe um e-mail válido para o proprietário.");
          setStep(0);
          return;
        }
        onSubmit(values);
      }}
      className="space-y-5"
    >
      <ol className="flex flex-wrap gap-1.5">
        {STEPS.map((label, i) => (
          <li key={label}>
            <button
              type="button"
              onClick={() => setStep(i)}
              className={
                "rounded-full px-3 py-1.5 text-[11px] font-semibold transition " +
                (i === step
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                  : "bg-foreground/[0.05] text-foreground/55 hover:bg-foreground/10")
              }
            >
              {i + 1}. {label}
            </button>
          </li>
        ))}
      </ol>

      <div className="glass-panel space-y-4 rounded-3xl p-4">
        {step === 0 && (
          <>
            {showDestinos && (
              <Field
                label="Destino da publicação"
                hint="Escolha os sites onde este imóvel será anunciado."
              >
                <PublishTargetSelector
                  value={destinos ?? []}
                  onChange={(next) => onDestinosChange?.(next)}
                />
              </Field>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Tipo">
                <select
                  value={values.tipo ?? ""}
                  onChange={(e) => set("tipo", e.target.value)}
                  className={inputCls}
                >
                  {TIPOS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Operação">
                <select
                  value={values.operacao}
                  onChange={(e) => set("operacao", e.target.value as PropertyOperacao)}
                  className={inputCls}
                >
                  <option value="venda">Venda</option>
                  <option value="aluguel">Aluguel</option>
                </select>
              </Field>
              <Field
                label="Carteira de origem"
                hint="Origem interna da captação. Não define o código de publicação."
              >
                <select
                  value={values.carteira}
                  onChange={(e) => set("carteira", e.target.value as PropertyCarteira)}
                  className={inputCls}
                >
                  <option value="cordial">Cordial</option>
                  <option value="morar">Morar</option>
                </select>
              </Field>
              <div className="sm:col-span-2">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-foreground/50">
                  Códigos de publicação
                </span>
                <ProviderCodeFields
                  providers={activeTargets}
                  codes={providerCodes}
                  onManualChange={manualCode}
                  onGenerate={reserveCode}
                />
              </div>

              <Field label="Referência">
                <input
                  value={values.referencia ?? ""}
                  onChange={(e) => set("referencia", e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Proprietário">
                <input
                  value={values.proprietarioNome ?? ""}
                  onChange={(e) => set("proprietarioNome", e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field
                label="Telefone do proprietário"
                hint="Uso interno: não é publicado nos sites."
              >
                <input
                  inputMode="tel"
                  value={values.proprietarioTelefone ?? ""}
                  onChange={(e) => set("proprietarioTelefone", maskPhone(e.target.value))}
                  placeholder="(55) 99999-9999"
                  className={inputCls}
                />
              </Field>
              <Field
                label="E-mail do proprietário"
                hint={
                  values.proprietarioEmail && !isValidEmail(values.proprietarioEmail)
                    ? "E-mail inválido."
                    : "Uso interno: não é publicado nos sites."
                }
              >
                <input
                  type="email"
                  value={values.proprietarioEmail ?? ""}
                  onChange={(e) => set("proprietarioEmail", e.target.value)}
                  placeholder="proprietario@email.com"
                  className={inputCls}
                />
              </Field>
            </div>
          </>
        )}

        {step === 1 && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Localização exibida" hint="Texto público do anúncio.">
              <input
                value={values.localizacaoExibida ?? ""}
                onChange={(e) => set("localizacaoExibida", e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Logradouro">
              <input
                value={values.logradouro ?? ""}
                onChange={(e) => set("logradouro", e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Número">
              <input
                value={values.numero ?? ""}
                onChange={(e) => set("numero", e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Bairro" hint="Escolha um bairro já usado nos sites ou digite um novo.">
              <input
                list={bairroListId}
                value={values.bairro ?? ""}
                onChange={(e) => set("bairro", e.target.value)}
                placeholder="Selecione ou digite"
                className={inputCls}
              />
              <datalist id={bairroListId}>
                {bairroOptions.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </Field>
            <Field label="Cidade">
              <input
                value={values.cidade ?? ""}
                onChange={(e) => set("cidade", e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="UF">
              <input
                value={values.uf ?? ""}
                maxLength={2}
                onChange={(e) => set("uf", e.target.value.toUpperCase())}
                className={inputCls}
              />
            </Field>
            <Field label="CEP">
              <input
                inputMode="numeric"
                value={values.cep ?? ""}
                onChange={(e) => set("cep", maskCep(e.target.value))}
                placeholder="98900-000"
                className={inputCls}
              />
            </Field>
          </div>
        )}

        {step === 2 && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {(
                [
                  ["Dormitórios", "dormitorios"],
                  ["Suítes", "suites"],
                  ["Banheiros", "banheiros"],
                  ["Vagas", "vagas"],
                  ["Salas", "salas"],
                ] as Array<[string, keyof PropertyFormValues]>
              ).map(([label, key]) => (
                <Field key={key} label={label}>
                  <input
                    inputMode="numeric"
                    value={str(values[key] as number | null)}
                    onChange={(e) => set(key, num(e.target.value) as never)}
                    className={inputCls}
                  />
                </Field>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {(
                [
                  ["Área principal (m²)", "areaPrincipal"],
                  ["Área total (m²)", "areaTotal"],
                  ["Área útil (m²)", "areaUtil"],
                  ["Área construída (m²)", "areaConstruida"],
                  ["Área do terreno (m²)", "areaTerreno"],
                ] as Array<[string, keyof PropertyFormValues]>
              ).map(([label, key]) => (
                <Field key={key} label={label}>
                  <input
                    inputMode="decimal"
                    value={str(values[key] as number | null)}
                    onChange={(e) => set(key, num(e.target.value) as never)}
                    className={inputCls}
                  />
                </Field>
              ))}
              <Field label="Tipo de área">
                <input
                  value={values.areaTipo ?? ""}
                  onChange={(e) => set("areaTipo", e.target.value)}
                  className={inputCls}
                />
              </Field>
            </div>
            <Toggle
              label="Imóvel mobiliado"
              checked={!!values.mobiliado}
              onChange={(v) => set("mobiliado", v)}
            />
          </>
        )}

        {step === 3 && (
          <>
            <Field label="Modo do valor">
              <select
                value={values.valorModo}
                onChange={(e) =>
                  set("valorModo", e.target.value as PropertyFormValues["valorModo"])
                }
                className={inputCls}
              >
                <option value="fixo">Valor exibido</option>
                <option value="consulte">Consulte</option>
              </select>
            </Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Valor (R$)">
                <input
                  inputMode="decimal"
                  value={str(values.valor)}
                  onChange={(e) => set("valor", num(e.target.value))}
                  className={inputCls}
                  disabled={values.valorModo === "consulte"}
                />
              </Field>
              <Field label="IPTU (R$)">
                <input
                  inputMode="decimal"
                  value={str(values.valorIptu)}
                  onChange={(e) => set("valorIptu", num(e.target.value))}
                  className={inputCls}
                />
              </Field>
              <Field label="Condomínio (R$)">
                <input
                  inputMode="decimal"
                  value={str(values.valorCondominio)}
                  onChange={(e) => set("valorCondominio", num(e.target.value))}
                  className={inputCls}
                />
              </Field>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Toggle
                label="Aceita financiamento"
                checked={!!values.aceitaFinanciamento}
                onChange={(v) => set("aceitaFinanciamento", v)}
              />
              <Toggle
                label="Aceita permuta"
                checked={!!values.permuta}
                onChange={(v) => set("permuta", v)}
              />
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <Field label="Descrição do imóvel">
              <textarea
                value={values.descricaoImovel ?? ""}
                onChange={(e) => set("descricaoImovel", e.target.value)}
                rows={7}
                className={inputCls}
              />
            </Field>
            <Field label="Pontos fortes">
              <textarea
                value={values.pontosFortes ?? ""}
                onChange={(e) => set("pontosFortes", e.target.value)}
                rows={3}
                className={inputCls}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Empreendimento">
                <input
                  value={values.nomeEmpreendimento ?? ""}
                  onChange={(e) => set("nomeEmpreendimento", e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Unidade">
                <input
                  value={values.unidade ?? ""}
                  onChange={(e) => set("unidade", e.target.value)}
                  className={inputCls}
                />
              </Field>
            </div>
          </>
        )}

        {step === 5 && (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              <Toggle
                label="Exibir no site"
                checked={!!values.exibirImovel}
                onChange={(v) => set("exibirImovel", v)}
              />
              <Toggle
                label="Destaque na home"
                checked={!!values.destaqueInicial}
                onChange={(v) => set("destaqueInicial", v)}
              />
              <Toggle
                label="Exclusividade"
                checked={!!values.exclusividade}
                onChange={(v) => set("exclusividade", v)}
              />
              <Toggle
                label="Autorização assinada"
                checked={!!values.autorizacao}
                onChange={(v) => set("autorizacao", v)}
              />
              <Toggle
                label="Escriturada"
                checked={!!values.escriturada}
                onChange={(v) => set("escriturada", v)}
              />
              <Toggle
                label="Averbada"
                checked={!!values.averbada}
                onChange={(v) => set("averbada", v)}
              />
              <Toggle
                label="Com placa"
                checked={!!values.comPlaca}
                onChange={(v) => set("comPlaca", v)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Disponibilidade">
                <input
                  value={values.disponibilidade ?? ""}
                  onChange={(e) => set("disponibilidade", e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Origem da captação">
                <input
                  value={values.origemCaptacao ?? ""}
                  onChange={(e) => set("origemCaptacao", e.target.value)}
                  className={inputCls}
                />
              </Field>
            </div>
            <div className="rounded-2xl bg-white/50 p-3">
              <PropertyPhotosStep
                propertyId={propertyId}
                destinos={destinos ?? []}
                onRequestSave={onRequestSave}
              />
            </div>

            <div className="rounded-2xl bg-foreground/[0.04] p-3 text-[12px] text-foreground/60">
              <p className="font-semibold text-foreground/75">Revisão</p>
              <p className="mt-1">
                {values.tipo ?? "Imóvel"} · {values.operacao === "venda" ? "Venda" : "Aluguel"} ·{" "}
                {[values.bairro, values.cidade, values.uf].filter(Boolean).join(" / ") ||
                  "Sem localização"}
              </p>
            </div>
          </>
        )}

        {step >= BASE_STEPS.length && extras[step - BASE_STEPS.length]
          ? extras[step - BASE_STEPS.length]!.render({ values, goToStep: setStep })
          : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="glass-panel inline-flex items-center gap-1 rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-40"
        >
          <ChevronLeft className="size-3.5" /> Voltar
        </button>
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
            className="inline-flex items-center gap-1 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
          >
            Avançar <ChevronRight className="size-3.5" />
          </button>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="glass-panel rounded-full px-4 py-2 text-xs font-semibold"
            >
              Cancelar
            </button>
          )}
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50"
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}
