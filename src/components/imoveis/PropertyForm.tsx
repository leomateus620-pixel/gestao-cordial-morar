import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { PropertyCarteira, PropertyOperacao, PropertyWriteInput } from "@/types/property";
import { usePropertyCodeReservation } from "@/hooks/usePropertyCode";
import { isGoogleMapsUrl } from "@/lib/imoveis/maps-link";
import { IMOBI_DESCRICAO_MAX, sanitizedLength } from "@/lib/imobibrasil/serializers";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listCorretores } from "@/lib/corretores/corretores.functions";
import { PropertyPhotosStep } from "./PropertyPhotosStep";
import { PublishTargetSelector } from "./PublishTargetSelector";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import {
  ProviderCodeFields,
  type ProviderCodeState,
  type ProviderCodes,
} from "./ProviderCodeFields";

export const TIPOS = [
  "Casa",
  "Apartamento",
  "Kitnet",
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
  const trimmed = raw.trim();
  const allDigits = trimmed.replace(/\D/g, "");
  const international = trimmed.startsWith("+") || allDigits.length > 11;
  if (international) {
    // Formato internacional (E.164): + e até 15 dígitos, agrupados para leitura.
    const digits = allDigits.slice(0, 15);
    if (!digits) return "+";
    const groups = digits.match(/.{1,4}/g) ?? [digits];
    return `+${groups.join(" ")}`;
  }
  const digits = allDigits.slice(0, 11);
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

/** Seleção rápida de quantidade (0 a 20) para dormitórios, suítes, banheiros, vagas e salas. */
function CountPicker({
  label,
  value,
  onChange,
  max = 20,
}: {
  label: string;
  value: number | null;
  onChange: (next: number | null) => void;
  max?: number;
}) {
  const [open, setOpen] = useState(false);
  const quick = [0, 1, 2, 3, 4, 5];
  const isHigh = value !== null && value > 5;
  const all = Array.from({ length: max + 1 }, (_, i) => i);

  const chip = (active: boolean) =>
    "grid h-9 min-w-9 place-items-center rounded-xl px-2 text-sm font-semibold transition " +
    (active
      ? "bg-primary text-primary-foreground shadow-sm"
      : "bg-foreground/[0.05] text-foreground/70 hover:bg-foreground/10");

  return (
    <div className="block">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground/50">
          {label}
        </span>
        <span className="text-[11px] font-semibold text-foreground/60">
          {value === null ? "—" : value}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {quick.map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={value === n}
            aria-label={`${label}: ${n}`}
            onClick={() => onChange(value === n ? null : n)}
            className={chip(value === n)}
          >
            {n}
          </button>
        ))}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`Escolher outra quantidade de ${label}`}
              aria-pressed={isHigh}
              className={chip(isHigh)}
            >
              {isHigh ? value : "6+"}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-52 p-2">
            <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-foreground/50">
              {label}
            </p>
            <div className="grid max-h-56 grid-cols-4 gap-1.5 overflow-y-auto">
              {all.map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={value === n}
                  onClick={() => {
                    onChange(n);
                    setOpen(false);
                  }}
                  className={chip(value === n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
        {value !== null ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="rounded-xl px-2 py-1.5 text-[11px] font-semibold text-foreground/45 transition hover:text-foreground/70"
          >
            Limpar
          </button>
        ) : null}
      </div>
    </div>
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
    exibirEnderecoSite: "nao",
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
    observacaoImovel: null,
    outrasInformacoes: null,
    localizacaoMapsUrl: null,
    corretorId: null,
    corretorNome: null,
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

/**
 * Aceita "32,5", "32.5" e "1.234,56". Um ponto seguido de exatamente 3 dígitos
 * continua sendo separador de milhar ("1.234").
 */
function decimalNum(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  let s = t;
  if (!s.includes(",")) {
    const parts = s.split(".");
    const last = parts[parts.length - 1] ?? "";
    // "1.234" = milhar; "32.5" / "32.50" = decimal.
    if (parts.length === 2 && last.length !== 3) s = s.replace(".", ",");
  }
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Exibe o número no padrão pt-BR (vírgula decimal). */
function decimalStr(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "";
  return String(v).replace(".", ",");
}

/**
 * Campo decimal que preserva o texto digitado (inclusive a vírgula em aberto,
 * ex.: "32,") e só converte para número ao sair do campo.
 */
function DecimalInput({
  value,
  onCommit,
  className,
  disabled,
}: {
  value: number | null | undefined;
  onCommit: (next: number | null) => void;
  className?: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? decimalStr(value);

  function handleChange(raw: string) {
    // Só dígitos e separadores decimais/milhar.
    const cleaned = raw.replace(/[^\d.,]/g, "");
    setDraft(cleaned);
    const parsed = decimalNum(cleaned);
    // Reflete no formulário sem reescrever o texto em edição.
    if (cleaned.trim() === "") onCommit(null);
    else if (parsed !== null) onCommit(parsed);
  }

  return (
    <input
      inputMode="decimal"
      value={shown}
      disabled={disabled}
      onChange={(e) => handleChange(e.target.value)}
      onBlur={() => {
        onCommit(decimalNum(shown));
        setDraft(null);
      }}
      className={className}
    />
  );
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
  const fetchCorretores = useServerFn(listCorretores);
  const corretoresQuery = useQuery({
    queryKey: ["corretores", "property-form"],
    queryFn: () => fetchCorretores(),
    staleTime: 5 * 60_000,
  });
  const corretores = corretoresQuery.data ?? [];

  const codes = usePropertyCodeReservation();
  const codeRequestsInFlight = useRef<Set<PropertyCarteira>>(new Set());
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

  /**
   * Todo imóvel publicado precisa do número da imobiliária. Ao escolher o
   * destino, reservamos o código automaticamente (uma vez por destino) — o
   * botão "Gerar" continua disponível para trocar por outro.
   */
  const autoReserved = useRef<Set<PropertyCarteira>>(new Set());
  useEffect(() => {
    for (const provider of activeTargets) {
      if (autoReserved.current.has(provider)) continue;
      if (providerCodes[provider]?.code) continue;
      autoReserved.current.add(provider);
      void reserveCode(provider);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTargets.join(",")]);

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
    if (codeRequestsInFlight.current.has(provider)) return;
    codeRequestsInFlight.current.add(provider);
    const previous = providerCodes[provider];
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
      // Uma falha nunca apaga o código que já estava no campo.
      setProviderCode(provider, {
        code: previous?.code ?? "",
        reservationId: previous?.reservationId ?? null,
        status: conflict ? "conflict" : "error",
        message,
      });
      toast.error(message);
    } finally {
      codeRequestsInFlight.current.delete(provider);
    }
  }


  /** Destino desmarcado devolve o número reservado para a fila. */
  function releaseRemovedTargets(next: PropertyCarteira[]) {
    for (const provider of destinos ?? []) {
      if (next.includes(provider)) continue;
      const reservationId = providerCodes[provider]?.reservationId;
      autoReserved.current.delete(provider);
      setProviderCode(provider, null);
      set(provider === "cordial" ? "codigoCordial" : "codigoMorar", null);
      if (reservationId) void codes.release.mutateAsync(reservationId).catch(() => {});
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
                  onChange={(next) => {
                    releaseRemovedTargets(next);
                    onDestinosChange?.(next);
                  }}
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
                hint="Uso interno: não é publicado nos sites. Para números de fora do Brasil, comece com + e o código do país."
              >
                <input
                  inputMode="tel"
                  value={values.proprietarioTelefone ?? ""}
                  onChange={(e) => set("proprietarioTelefone", maskPhone(e.target.value))}
                  placeholder="(55) 99999-9999 ou +54 9 11 2345 6789"
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
              <Field label="Quem agenciou" hint="Uso interno: nao e publicado nos sites.">
                <select
                  value={values.corretorId ?? ""}
                  onChange={(e) => {
                    const id = e.target.value || null;
                    const corretor = corretores.find((c) => c.id === id);
                    set("corretorId", id);
                    set("corretorNome", corretor?.nome ?? null);
                  }}
                  className={inputCls}
                >
                  <option value="">Nao informado</option>
                  {corretores.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="rounded-2xl border border-amber-300/50 bg-amber-50/50 p-4">
              <p className="mb-3 inline-flex items-center rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-700">
                Uso interno · não vai para o site
              </p>
              <div className="grid gap-3">
                <Field
                  label="Informações internas"
                  hint="Só a equipe vê: não vai para os sites Cordial e Morar."
                >
                  <textarea
                    rows={4}
                    value={values.observacaoImovel ?? ""}
                    onChange={(e) => set("observacaoImovel", e.target.value)}
                    placeholder="Chaves, combinados com o proprietário, restrições de visita..."
                    className={inputCls}
                  />
                </Field>
                <Field
                  label="Outras informações"
                  hint="Só a equipe vê: não vai para os sites Cordial e Morar."
                >
                  <textarea
                    rows={3}
                    value={values.outrasInformacoes ?? ""}
                    onChange={(e) => set("outrasInformacoes", e.target.value)}
                    placeholder="Documentação pendente, histórico de negociação, avisos da equipe..."
                    className={inputCls}
                  />
                </Field>
              </div>
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
            <Field label="Endereço no anúncio" hint="Rua e número são uso interno.">
              <select
                value={values.exibirEnderecoSite ?? "nao"}
                onChange={(e) => set("exibirEnderecoSite", e.target.value)}
                className={inputCls}
              >
                <option value="nao">Ocultar rua e número (padrão)</option>
                <option value="sim">Exibir endereço completo</option>
              </select>
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
            <div className="sm:col-span-2">
              <Field
                label="Localização Google Maps"
                hint="Cole o link do local copiado do Google Maps. Uso interno: não vai para os sites Cordial e Morar."
              >
                <input
                  value={values.localizacaoMapsUrl ?? ""}
                  onChange={(e) => set("localizacaoMapsUrl", e.target.value)}
                  placeholder="https://maps.app.goo.gl/..."
                  className={inputCls}
                />
                {values.localizacaoMapsUrl && !isGoogleMapsUrl(values.localizacaoMapsUrl) ? (
                  <p className="mt-1 text-[11px] font-medium text-destructive">
                    Este link não parece ser do Google Maps. Copie o link direto do app ou do site
                    do Maps.
                  </p>
                ) : null}
              </Field>
            </div>
          </div>
        )}

        {step === 2 && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              {(
                [
                  ["Dormitórios", "dormitorios"],
                  ["Suítes", "suites"],
                  ["Banheiros", "banheiros"],
                  ["Vagas", "vagas"],
                  ["Salas", "salas"],
                ] as Array<[string, keyof PropertyFormValues]>
              ).map(([label, key]) => (
                <CountPicker
                  key={key}
                  label={label}
                  value={values[key] as number | null}
                  onChange={(next) => set(key, next as never)}
                />
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
                  <DecimalInput
                    value={values[key] as number | null}
                    onCommit={(next) => set(key, next as never)}
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
                <DecimalInput
                  value={values.valor}
                  onCommit={(next) => set("valor", next)}
                  className={inputCls}
                  disabled={values.valorModo === "consulte"}
                />
              </Field>
              <Field label="IPTU (R$)">
                <DecimalInput
                  value={values.valorIptu}
                  onCommit={(next) => set("valorIptu", next)}
                  className={inputCls}
                />
              </Field>
              <Field label="Condomínio (R$)">
                <DecimalInput
                  value={values.valorCondominio}
                  onCommit={(next) => set("valorCondominio", next)}
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
              {(() => {
                const used = sanitizedLength(values.descricaoImovel);
                const over = used > IMOBI_DESCRICAO_MAX;
                return (
                  <p
                    className={`mt-1 text-[11px] font-semibold ${over ? "text-amber-600" : "text-foreground/45"}`}
                  >
                    {used}/{IMOBI_DESCRICAO_MAX} caracteres na descrição dos sites
                    {over
                      ? ` — o restante (~${used - IMOBI_DESCRICAO_MAX}) continua no site em “Pontos fortes”. Nada é perdido.`
                      : ""}
                  </p>
                );
              })()}
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
