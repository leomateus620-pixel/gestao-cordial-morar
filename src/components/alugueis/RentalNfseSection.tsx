import { useEffect, useMemo, useRef, useState } from "react";
import { buildRentalPrefill, fillEmpty, previousCompetence } from "@/lib/nfse/rental-prefill";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  CircleMinus,
  Clock,
  ExternalLink,
  FlaskConical,
  Loader2,
  Receipt,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { RentalNfseHistoryState } from "./RentalNfseHistoryState";
import { parseBRLNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useRentalNfse, useRentalNfsePreview } from "@/hooks/useRentalNfse";
import type { NfseBrand, NfseEmission } from "@/lib/nfse/nfse.functions";
import { fiscalReviewSchema, type FiscalReview } from "@/lib/nfse/fiscal-profile";
import type { RentalContractFull } from "@/types/rental";
import {
  fiscalStatusView,
  formatFiscalMoney as brl,
  groupFiscalHistory,
  isCurrentFiscalConfirmation,
} from "./rental-nfse-view";

const BUTTON =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
const INPUT =
  "min-h-11 w-full rounded-lg border border-foreground/20 bg-white px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:bg-foreground/5";
const ICONS = {
  issued: CheckCircle2,
  test: FlaskConical,
  sending: Loader2,
  waiting: Clock,
  refused: XCircle,
  cancelled: Ban,
  resolved: CircleMinus,
};
const TONES = {
  success: "text-emerald-800 bg-emerald-50",
  test: "text-sky-800 bg-sky-50",
  pending: "text-primary bg-primary/10",
  warning: "text-amber-900 bg-amber-50",
  neutral: "text-foreground/75 bg-foreground/5",
};
const emptyReview = () => ({
  referenceId: "",
  replacesEmissionId: "",
  valor: "",
  dataFatoGerador: "",
  nome: "",
  documento: "",
  logradouro: "",
  numero: "",
  bairro: "",
  cidadeTom: "",
  cep: "",
  motivo: "",
  refNfse: "",
  imovelTipo: "",
  imovelCib: "",
  imovelInscricao: "",
  imovelCep: "",
  imovelLogradouro: "",
  imovelNumero: "",
  imovelComplemento: "",
  imovelBairro: "",
});

function dateTime(iso: string) {
  const date = new Date(iso);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        dateStyle: "short",
        timeStyle: "short",
      }).format(date)
    : "Data indisponível";
}
function competenceLabel(value: string) {
  return /^\d{4}-\d{2}/.test(value)
    ? `${value.slice(5, 7)}/${value.slice(0, 4)}`
    : "Competência não definida";
}
function civilDateLabel(value: string) {
  return value.slice(0, 10).split("-").reverse().join("/");
}
function brandLabel(brand: string) {
  return brand === "cordial"
    ? "Cordial Imóveis"
    : brand === "morar"
      ? "Morar Imóveis"
      : "Emissor não definido";
}

export function RentalNfseSection({
  contract,
  canEmit,
  sectionId,
}: {
  contract: RentalContractFull;
  canEmit: boolean;
  sectionId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [modoTeste, setModoTeste] = useState(true);
  const [historyTests, setHistoryTests] = useState(false);
  const [competencia, setCompetencia] = useState(() => previousCompetence());
  const [emissor, setEmissor] = useState<NfseBrand | undefined>(() =>
    contract.brand === "cordial" || contract.brand === "morar" ? contract.brand : undefined,
  );
  const [approvedToken, setApprovedToken] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyReview);
  const [review, setReview] = useState<FiscalReview | undefined>();
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [recoveryTarget, setRecoveryTarget] = useState<string | null>(null);
  const [recoveryChecked, setRecoveryChecked] = useState(false);
  const [markTarget, setMarkTarget] = useState<string | null>(null);
  const [markReason, setMarkReason] = useState("");
  const [markChecked, setMarkChecked] = useState(false);
  const sendInFlight = useRef(false);
  const fiscal = useRentalNfse(contract.id, canEmit, historyTests);
  const previewInput = useMemo(
    () => ({ competencia, emissor, modoTeste, review }),
    [competencia, emissor, modoTeste, review],
  );
  const preview = useRentalNfsePreview(
    contract.id,
    previewInput,
    open && canEmit && Boolean(competencia && emissor),
  );
  const p = preview.data;
  const confirmed = isCurrentFiscalConfirmation(approvedToken, p?.previewToken);
  const testLocked = p?.configModoTeste ?? true;
  const requiresReferences = Boolean(
    p?.profile?.ibsCbs && ["2", "3"].includes(p.profile.tpOper ?? ""),
  );
  const groups = groupFiscalHistory(fiscal.emissions);
  const existingReal = p?.existentes.some(
    (row) => !row.modoTeste && ["emitida", "processando", "incerto"].includes(row.status),
  );
  const headingId = `${sectionId ?? `nfse-${contract.id}`}-title`;

  useEffect(() => {
    setApprovedToken(null);
  }, [competencia, emissor, modoTeste, review, p?.previewToken, open]);
  useEffect(() => {
    if (p?.configModoTeste) setModoTeste(true);
  }, [p?.configModoTeste]);

  useEffect(() => {
    if (!open || !competencia) return;
    const fill = buildRentalPrefill({
      competencia,
      comissaoMensal: contract.comissaoMensal,
      tenantNome: contract.tenant?.nome,
      tenantDocumento: contract.tenant?.cpfCnpj,
      tenantEndereco: contract.tenant?.endereco,
      propertyLabel: contract.property?.apelido,
    });
    setDraft((current) => fillEmpty(current, fill));
  }, [open, competencia, contract]);

  function edit(key: keyof ReturnType<typeof emptyReview>, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
    setReview(undefined);
    setApprovedToken(null);
    setReviewError(null);
  }
  function checkReview() {
    if (p?.requiresProperty && !draft.imovelTipo) {
      setReviewError(
        "Esta operação exige a identificação do imóvel: escolha CIB ou endereço completo e confira os dados.",
      );
      return;
    }
    if (requiresReferences && !draft.refNfse.trim()) {
      setReviewError(
        "Esta operação exige as chaves de acesso das notas referenciadas. Informe uma chave de 50 dígitos por linha.",
      );
      return;
    }
    const result = fiscalReviewSchema.safeParse({
      referenceId: draft.referenceId || undefined,
      replacesEmissionId: draft.replacesEmissionId || undefined,
      valor: parseBRLNumber(draft.valor),
      dataFatoGerador: draft.dataFatoGerador,
      tomador: {
        nome: draft.nome,
        documento: draft.documento,
        logradouro: draft.logradouro,
        numero: draft.numero,
        bairro: draft.bairro,
        cidadeTom: draft.cidadeTom,
        cep: draft.cep,
      },
      motivo: draft.motivo,
      refNfse: requiresReferences ? draft.refNfse.trim().split(/\s+/) : undefined,
      ibsCbsImovel: p?.requiresProperty
        ? {
            inscImobFisc: draft.imovelInscricao || undefined,
            cCIB: draft.imovelTipo === "cib" ? draft.imovelCib : undefined,
            end:
              draft.imovelTipo === "endereco"
                ? {
                    cep: draft.imovelCep,
                    logradouro: draft.imovelLogradouro,
                    numero: draft.imovelNumero,
                    complemento: draft.imovelComplemento || undefined,
                    bairro: draft.imovelBairro,
                  }
                : undefined,
          }
        : undefined,
    });
    if (!result.success) {
      setReviewError(
        "Complete o valor, a data válida do fato gerador, os dados fiscais do tomador e a origem da revisão (mínimo de 15 caracteres). CEP: 8 dígitos. Município: código TOM informado no cadastro fiscal.",
      );
      return;
    }
    setReviewError(null);
    setReview(result.data);
  }
  async function send() {
    if (
      !p?.previewToken ||
      !review ||
      preview.isFetching ||
      fiscal.isEmitting ||
      sendInFlight.current
    )
      return;
    if (!modoTeste && !confirmed) return;
    sendInFlight.current = true;
    try {
      const result = await fiscal.emit({
        ...previewInput,
        previewToken: p.previewToken,
        confirmarEmissaoReal: !modoTeste,
      });
      if (result.emission) setHistoryTests(result.emission.modoTeste);
      if (result.emission && result.emission.status !== "erro") setOpen(false);
    } catch {
      /* The hook refreshes persisted state and provides the safe next action. */
    } finally {
      sendInFlight.current = false;
      setApprovedToken(null);
    }
  }
  async function reconcile(row: NfseEmission, mode: "consulta" | "reenvio") {
    try {
      await fiscal.reconcile({
        emissionId: row.id,
        modo: mode,
        confirmarReenvioReal: mode === "reenvio" && !row.modoTeste ? recoveryChecked : undefined,
      });
      setRecoveryTarget(null);
      setRecoveryChecked(false);
    } catch {
      /* State stays visible for recovery. */
    }
  }

  if (!canEmit) return null;
  return (
    <section
      id={sectionId}
      data-rental-section="nfse"
      aria-labelledby={headingId}
      className="scroll-mt-20 rounded-2xl border border-foreground/15 bg-white p-4 sm:p-6"
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Receipt aria-hidden className="mt-1 size-5 text-primary" />
          <div>
            <h3 id={headingId} className="text-lg font-bold tracking-tight">
              NFS-e do aluguel
            </h3>
            <p className="mt-1 text-sm text-foreground/75">
              Santa Rosa/RS · {brandLabel(emissor ?? "")} · emissão assistida
            </p>
          </div>
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${headingId}-review`}
          onClick={() => setOpen((value) => !value)}
          className={cn(BUTTON, "bg-primary text-primary-foreground")}
        >
          {open ? "Recolher revisão" : "Revisar serviço"}
        </button>
      </header>
      {fiscal.actionError && (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-amber-50 p-3 text-sm leading-6 text-amber-900"
        >
          {fiscal.actionError}
        </p>
      )}
      <p className="mt-4 border-l-2 border-[#a66b46] pl-3 text-sm leading-6 text-foreground/80">
        A nota registra o serviço aprovado para a empresa. Aluguel bruto, repasse ao proprietário,
        administração e intermediação têm naturezas distintas; a comissão atual e o locatário não
        definem automaticamente o faturamento.
      </p>

      {open && (
        <div id={`${headingId}-review`} className="mt-5 border-t border-foreground/15 pt-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm font-semibold">
              Empresa emissora
              <select
                className={INPUT}
                value={emissor ?? ""}
                disabled={contract.brand !== "ambas"}
                onChange={(event) => {
                  setEmissor(
                    event.target.value === "cordial" || event.target.value === "morar"
                      ? event.target.value
                      : undefined,
                  );
                  setApprovedToken(null);
                }}
              >
                <option value="">Selecione a empresa</option>
                <option value="cordial">Cordial Imóveis</option>
                <option value="morar">Morar Imóveis</option>
              </select>
            </label>
            <label className="space-y-1.5 text-sm font-semibold">
              Competência do serviço
              <input
                type="month"
                className={INPUT}
                value={competencia}
                onChange={(event) => {
                  setCompetencia(event.target.value);
                  setApprovedToken(null);
                  setDraft(emptyReview());
                  setReview(undefined);
                }}
              />
            </label>
          </div>
          <p className="mt-2 text-sm text-foreground/70">
            Selecione o mês efetivo do serviço. O próximo vencimento do aluguel não define esta
            competência.
          </p>
          {(!competencia || !emissor) && (
            <p role="status" className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              Dados pendentes: selecione a empresa emissora e a competência para consultar as
              referências fiscais.
            </p>
          )}
          {competencia && emissor && (
            <>
              {preview.isError && (
                <div
                  role="alert"
                  className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"
                >
                  <p>
                    {preview.error instanceof Error
                      ? preview.error.message
                      : "Não foi possível carregar a revisão fiscal. Tente novamente; se persistir, solicite à administração a conferência da configuração desta empresa."}
                  </p>
                  <button
                    type="button"
                    onClick={() => void preview.refetch()}
                    className={cn(BUTTON, "mt-2 border border-amber-900/25")}
                  >
                    Tentar novamente
                  </button>
                </div>
              )}
              <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
                <div>
                  <h4 className="text-base font-bold">Dados do serviço e sua origem</h4>
                  {fiscal.isAdmin &&
                    p?.existentes.some(
                      (item) => !item.modoTeste && ["erro", "nao_emitida"].includes(item.status),
                    ) && (
                      <label className="mt-4 block space-y-1.5 text-sm font-semibold">
                        Revisão de tentativa anterior
                        <select
                          value={draft.replacesEmissionId}
                          className={INPUT}
                          onChange={(event) => edit("replacesEmissionId", event.target.value)}
                        >
                          <option value="">Sem revisão de tentativa anterior</option>
                          {p.existentes
                            .filter(
                              (item) =>
                                !item.modoTeste && ["erro", "nao_emitida"].includes(item.status),
                            )
                            .map((item) => (
                              <option key={item.id} value={item.id}>
                                {dateTime(item.createdAt)} · {item.id.slice(0, 8)}
                              </option>
                            ))}
                        </select>
                        <span className="block text-sm font-normal leading-6 text-foreground/75">
                          A revisão cria uma identidade própria vinculada à tentativa
                          comprovadamente não emitida. O motivo deve documentar a alteração.
                          Operações incertas, emitidas ou canceladas não podem usar esta ação.
                        </span>
                      </label>
                    )}
                  <p className="mt-1 text-sm leading-6 text-foreground/75">
                    Revise os dados válidos na competência. Use o endereço fiscal do tomador, que
                    pode ser diferente do endereço do imóvel.
                  </p>
                  {p?.references && p.references.length > 0 && (
                    <label className="mt-4 block space-y-1.5 text-sm font-semibold">
                      Referência registrada
                      <select
                        value={draft.referenceId}
                        className={INPUT}
                        onChange={(event) => {
                          const ref = p.references.find((item) => item.id === event.target.value);
                          setDraft((current) => ({
                            ...current,
                            referenceId: event.target.value,
                            valor: ref?.valorServico != null ? String(ref.valorServico) : "",
                          }));
                          setReview(undefined);
                          setApprovedToken(null);
                        }}
                      >
                        <option value="">Revisão manual com origem documentada</option>
                        {p.references.map((ref) => (
                          <option key={ref.id} value={ref.id}>
                            {ref.vencimentoOriginal
                              ? civilDateLabel(ref.vencimentoOriginal)
                              : "Referência"}{" "}
                            · {ref.valorServico != null ? brl(ref.valorServico) : "Valor pendente"}{" "}
                            · {ref.source}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1.5 text-sm font-semibold">
                      Valor do serviço (R$) — comissão do aluguel
                      <input
                        inputMode="decimal"
                        className={INPUT}
                        value={draft.valor}
                        onChange={(event) => edit("valor", event.target.value)}
                      />
                      {!contract.comissaoMensal && (
                        <span className="block text-xs font-normal text-amber-900">
                          Cadastre a comissão no aluguel.
                        </span>
                      )}
                    </label>
                    <label className="space-y-1.5 text-sm font-semibold">
                      Data do fato gerador
                      <input
                        type="date"
                        className={INPUT}
                        value={draft.dataFatoGerador}
                        onChange={(event) => edit("dataFatoGerador", event.target.value)}
                      />
                    </label>
                    {(
                      [
                        ["nome", "Nome / razão social do tomador"],
                        ["documento", "CPF / CNPJ do tomador"],
                        ["logradouro", "Logradouro fiscal"],
                        ["numero", "Número"],
                        ["bairro", "Bairro"],
                        ["cidadeTom", "Município fiscal (código TOM)"],
                        ["cep", "CEP fiscal (8 dígitos)"],
                      ] as const
                    ).map(([key, label]) => (
                      <label
                        key={key}
                        className={cn(
                          "space-y-1.5 text-sm font-semibold",
                          (key === "nome" || key === "logradouro") && "sm:col-span-2",
                        )}
                      >
                        {label}
                        <input
                          className={INPUT}
                          value={draft[key]}
                          onChange={(event) => edit(key, event.target.value)}
                        />
                        {(key === "cep" || key === "cidadeTom") && !draft[key] && (
                          <span className="block text-xs font-normal text-amber-900">
                            Não consta no cadastro do locatário — preencha.
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                  {p?.requiresProperty && (
                    <fieldset className="mt-5 border-t border-foreground/15 pt-4">
                      <legend className="px-1 text-sm font-bold">Imóvel da operação fiscal</legend>
                      <p className="mb-3 text-sm leading-6 text-foreground/75">
                        Este grupo é exigido pelo perfil aprovado. Confira os dados do imóvel; eles
                        não substituem o endereço fiscal do tomador.
                      </p>
                      <label className="block space-y-1.5 text-sm font-semibold">
                        Forma de identificação
                        <select
                          className={INPUT}
                          value={draft.imovelTipo}
                          onChange={(event) => edit("imovelTipo", event.target.value)}
                        >
                          <option value="">Selecione</option>
                          <option value="cib">Código CIB</option>
                          <option value="endereco">Endereço completo</option>
                        </select>
                      </label>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <label className="space-y-1.5 text-sm font-semibold">
                          Inscrição imobiliária fiscal (se aplicável)
                          <input
                            className={INPUT}
                            value={draft.imovelInscricao}
                            onChange={(event) => edit("imovelInscricao", event.target.value)}
                          />
                        </label>
                        {draft.imovelTipo === "cib" && (
                          <label className="space-y-1.5 text-sm font-semibold">
                            Código CIB (8 caracteres)
                            <input
                              className={INPUT}
                              value={draft.imovelCib}
                              onChange={(event) =>
                                edit("imovelCib", event.target.value.toUpperCase())
                              }
                            />
                          </label>
                        )}
                        {draft.imovelTipo === "endereco" &&
                          (
                            [
                              ["imovelCep", "CEP do imóvel (8 dígitos)"],
                              ["imovelLogradouro", "Logradouro do imóvel"],
                              ["imovelNumero", "Número do imóvel"],
                              ["imovelComplemento", "Complemento (se houver)"],
                              ["imovelBairro", "Bairro do imóvel"],
                            ] as const
                          ).map(([key, label]) => (
                            <label key={key} className="space-y-1.5 text-sm font-semibold">
                              {label}
                              <input
                                className={INPUT}
                                value={draft[key]}
                                onChange={(event) => edit(key, event.target.value)}
                              />
                            </label>
                          ))}
                      </div>
                    </fieldset>
                  )}
                  {requiresReferences && (
                    <label className="mt-4 block space-y-1.5 text-sm font-semibold">
                      Notas referenciadas nesta operação
                      <textarea
                        rows={3}
                        className={INPUT}
                        value={draft.refNfse}
                        onChange={(event) => edit("refNfse", event.target.value)}
                        placeholder="Uma chave de acesso com 50 dígitos por linha."
                      />
                    </label>
                  )}
                  <label className="mt-3 block space-y-1.5 text-sm font-semibold">
                    Origem e motivo da revisão
                    <textarea
                      rows={3}
                      className={INPUT}
                      value={draft.motivo}
                      onChange={(event) => edit("motivo", event.target.value)}
                      placeholder="Indique os documentos e a conferência que comprovam competência, valor e tomador."
                    />
                  </label>
                  {reviewError && (
                    <p role="alert" className="mt-3 text-sm text-destructive">
                      {reviewError}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={checkReview}
                    disabled={fiscal.isEmitting}
                    className={cn(BUTTON, "mt-3 border border-primary/30 text-primary")}
                  >
                    Conferir dados da prévia
                  </button>
                </div>
                <div className="min-w-0 border-t border-foreground/15 pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                  <h4 className="text-sm font-semibold text-foreground/70">
                    Valor do serviço revisado
                  </h4>
                  <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-primary">
                    {review && p ? brl(p.valor) : "A revisar"}
                  </p>
                  <dl className="mt-5 space-y-4 text-sm">
                    <div>
                      <dt className="text-foreground/65">Prestador</dt>
                      <dd className="mt-1 font-semibold">
                        {p?.prestadorNome || brandLabel(emissor)}
                        {p?.prestadorDocumento && (
                          <span className="mt-1 block font-normal">{p.prestadorDocumento}</span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-foreground/65">Tomador</dt>
                      <dd className="mt-1 font-semibold">
                        {review ? (p?.tomadorNome ?? "A conferir") : "A revisar"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-foreground/65">Serviço</dt>
                      <dd className="mt-1">
                        {p?.serviceDescription || "Depende de perfil fiscal aprovado"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-foreground/65">Competência · fato gerador</dt>
                      <dd className="mt-1">
                        {competenceLabel(competencia)} ·{" "}
                        {review && p?.dataFatoGerador
                          ? civilDateLabel(p.dataFatoGerador)
                          : "A revisar"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-foreground/65">Origem</dt>
                      <dd className="mt-1 break-words">
                        {p?.sourceDescription || "Revisão ainda não registrada"}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-5" aria-live="polite" aria-atomic="true">
                    {preview.isFetching ? (
                      <p className="flex items-center gap-2 text-sm">
                        <Loader2 aria-hidden className="size-4 animate-spin" />
                        Conferindo os dados no servidor…
                      </p>
                    ) : (
                      p && (
                        <>
                          <p
                            className={cn(
                              "font-semibold text-sm",
                              p.bloqueado || !review ? "text-amber-900" : "text-primary",
                            )}
                          >
                            {p.bloqueado || !review ? "Dados pendentes" : "Pronta para revisão"}
                          </p>
                          <ul className="mt-3 space-y-3 text-sm">
                            {p.checklist
                              .filter((item) => !item.ok)
                              .map((item) => (
                                <li key={item.key} className="flex items-start gap-2">
                                  <AlertTriangle
                                    aria-hidden
                                    className="mt-0.5 size-4 shrink-0 text-amber-800"
                                  />
                                  <span>
                                    <strong className="font-semibold">{item.label}</strong>
                                    {item.detail && (
                                      <span className="mt-0.5 block leading-5 text-foreground/75">
                                        {item.detail}
                                      </span>
                                    )}
                                  </span>
                                </li>
                              ))}
                          </ul>
                        </>
                      )
                    )}
                  </div>
                  <p className="mt-5 border-t border-foreground/15 pt-4 text-sm leading-6 text-foreground/75">
                    Automação não habilitada. A ativação depende do perfil contábil, da homologação
                    autorizada e de execução durável aprovada.
                  </p>
                </div>
              </div>
              <div className="mt-6 border-t border-foreground/15 pt-4">
                <label className="flex items-start justify-between gap-4 text-sm">
                  <span>
                    <strong className="block">Validação em teste</strong>
                    <span className="mt-1 block leading-5 text-foreground/75">
                      {testLocked
                        ? "Produção bloqueada na configuração desta empresa."
                        : "Desativar seleciona emissão de nota real e exige confirmação da prévia."}
                    </span>
                  </span>
                  <Switch
                    aria-label="Validação em teste"
                    checked={modoTeste}
                    disabled={testLocked || fiscal.isEmitting}
                    onCheckedChange={(value) => {
                      setModoTeste(value);
                      setApprovedToken(null);
                    }}
                  />
                </label>
                {!modoTeste && existingReal && (
                  <p
                    role="status"
                    className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"
                  >
                    Já existe uma operação real bloqueando esta competência. Confira o histórico
                    antes de continuar.
                  </p>
                )}
                {!modoTeste && p?.previewToken && !p.bloqueado && (
                  <label className="mt-4 flex items-start gap-3 rounded-lg border border-amber-800/30 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 shrink-0"
                      checked={confirmed}
                      onChange={(event) =>
                        setApprovedToken(event.target.checked ? p.previewToken : null)
                      }
                    />
                    Confirmo a emissão real por {brandLabel(emissor)}, para {p.tomadorNome}, no
                    valor de {brl(p.valor)}, competência {competenceLabel(competencia)}, conforme
                    esta prévia.
                  </label>
                )}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p role="status" className="text-sm text-foreground/70">
                    {fiscal.isEmitting
                      ? "Envio registrado. Fechar a ficha não cancela a tentativa."
                      : "Qualquer alteração dos dados exige uma nova confirmação."}
                  </p>
                  <button
                    type="button"
                    disabled={
                      fiscal.isEmitting ||
                      preview.isFetching ||
                      !fiscal.canEmit ||
                      !review ||
                      !p?.previewToken ||
                      p.bloqueado ||
                      (!modoTeste && (!confirmed || existingReal))
                    }
                    onClick={() => void send()}
                    className={cn(BUTTON, "bg-primary text-primary-foreground")}
                  >
                    {fiscal.isEmitting && <Loader2 aria-hidden className="size-4 animate-spin" />}
                    {modoTeste ? "Validar em teste" : "Emitir nota real"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      <div className="mt-6 border-t border-foreground/15 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h4 className="text-base font-bold">Histórico por competência</h4>
          <button
            type="button"
            onClick={() => void fiscal.refetch()}
            disabled={fiscal.isFetching}
            className={cn(BUTTON, "text-primary")}
          >
            <RefreshCw aria-hidden className={cn("size-4", fiscal.isFetching && "animate-spin")} />
            Atualizar
          </button>
        </div>
        <div aria-label="Tipo de histórico fiscal" className="mt-3 flex gap-2">
          <button
            type="button"
            aria-pressed={!historyTests}
            onClick={() => setHistoryTests(false)}
            className={cn(
              BUTTON,
              !historyTests ? "bg-primary text-primary-foreground" : "border border-foreground/20",
            )}
          >
            Operações reais
          </button>
          <button
            type="button"
            aria-pressed={historyTests}
            onClick={() => setHistoryTests(true)}
            className={cn(
              BUTTON,
              historyTests ? "bg-primary text-primary-foreground" : "border border-foreground/20",
            )}
          >
            Testes sem valor fiscal
          </button>
        </div>
        <div className="mt-4" aria-live="polite" aria-busy={fiscal.isLoading}>
          <RentalNfseHistoryState
            loading={fiscal.isLoading}
            failed={fiscal.isError}
            count={fiscal.emissions.length}
            tests={historyTests}
            onRetry={() => void fiscal.refetch()}
          >
            {groups.map(([month, rows]) => (
              <div key={month} className="mb-6 last:mb-0">
                <h5 className="mb-2 text-sm font-bold">Competência {competenceLabel(month)}</h5>
                <ul className="divide-y divide-foreground/10 rounded-xl border border-foreground/15">
                  {rows.map((row) => {
                    const view = fiscalStatusView(row);
                    const Icon = ICONS[view.icon];
                    const pending = view.icon === "waiting";
                    return (
                      <li key={row.id} className="p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <span
                            className={cn(
                              "inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm font-semibold",
                              TONES[view.tone],
                            )}
                          >
                            <Icon
                              aria-hidden
                              className={cn("size-4", view.icon === "sending" && "animate-spin")}
                            />
                            {view.label}
                          </span>
                          <span className="text-lg font-bold tabular-nums">{brl(row.valor)}</span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-foreground/80">
                          {fiscal.reconcilingId === row.id
                            ? fiscal.reconcilingMode === "consulta"
                              ? "Consulta em andamento na prefeitura. A operação continua bloqueada para uma nova emissão."
                              : "Recuperação da mesma operação em andamento. Aguarde o resultado registrado."
                            : view.explanation}
                        </p>
                        <p className="mt-2 text-sm text-foreground/70">
                          {brandLabel(row.brand)} · Envio registrado em {dateTime(row.createdAt)}
                        </p>
                        {!row.modoTeste && row.numeroNfse && (
                          <p className="mt-2 text-sm font-semibold">
                            Nota nº <span className="font-mono">{row.numeroNfse}</span>
                            {row.serieNfse ? ` · série ${row.serieNfse}` : ""}
                          </p>
                        )}
                        {!row.modoTeste && row.dataEmissao && (
                          <p className="mt-1 text-sm text-foreground/75">
                            Emissão informada pela prefeitura: {row.dataEmissao}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-2">
                          {!row.modoTeste && row.linkPdf && (
                            <a
                              href={row.linkPdf}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={cn(BUTTON, "text-primary")}
                            >
                              <ExternalLink aria-hidden className="size-4" />
                              Abrir nota
                            </a>
                          )}
                          {pending && row.canConsult && (
                            <button
                              type="button"
                              disabled={fiscal.reconcilingId === row.id}
                              onClick={() => void reconcile(row, "consulta")}
                              className={cn(BUTTON, "border border-foreground/20")}
                            >
                              Consultar nota na prefeitura
                            </button>
                          )}
                          {pending && row.identificador && (
                            <button
                              type="button"
                              onClick={() => {
                                setRecoveryTarget(recoveryTarget === row.id ? null : row.id);
                                setRecoveryChecked(false);
                                setMarkTarget(null);
                              }}
                              className={cn(BUTTON, "border border-foreground/20")}
                            >
                              Revisar recuperação
                            </button>
                          )}
                          {row.status === "incerto" && fiscal.isAdmin && !row.numeroNfse && (
                            <button
                              type="button"
                              onClick={() => {
                                setMarkTarget(markTarget === row.id ? null : row.id);
                                setMarkReason("");
                                setMarkChecked(false);
                                setRecoveryTarget(null);
                              }}
                              className={cn(BUTTON, "text-foreground/80")}
                            >
                              Registrar conferência de não emissão
                            </button>
                          )}
                        </div>
                        {row.status === "erro" && row.errorMessage && (
                          <p className="mt-2 text-sm text-amber-900">{row.errorMessage}</p>
                        )}
                        {row.status === "nao_emitida" && (
                          <p className="mt-2 text-sm text-foreground/75">
                            Motivo: {row.resolutionReason ?? "Consulte a administração"}
                            {row.resolvedByName ? ` · ${row.resolvedByName}` : ""}
                            {row.resolvedAt ? ` · ${dateTime(row.resolvedAt)}` : ""}
                          </p>
                        )}
                        <p className="mt-2 text-xs text-foreground/60">
                          Referência de atendimento:{" "}
                          <span className="font-mono">{row.id.slice(0, 8)}</span>
                        </p>
                        {recoveryTarget === row.id && (
                          <div className="mt-4 rounded-xl border border-amber-800/30 bg-amber-50 p-4 text-sm">
                            <h6 className="font-bold">Reenvio da mesma operação</h6>
                            <p className="mt-2 leading-6">
                              Esta ação retransmite o XML com o mesmo identificador e pode concluir{" "}
                              {row.modoTeste ? "a validação" : "uma nota fiscal real"}. Não é uma
                              consulta de leitura. A identidade fiscal e a configuração serão
                              verificadas pelo servidor.
                            </p>
                            <label className="mt-3 flex items-start gap-3">
                              <input
                                type="checkbox"
                                className="mt-1 size-4"
                                checked={recoveryChecked}
                                onChange={(event) => setRecoveryChecked(event.target.checked)}
                              />
                              Entendo o efeito e autorizo a recuperação desta mesma operação.
                            </label>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => setRecoveryTarget(null)}
                                className={BUTTON}
                              >
                                Fechar
                              </button>
                              <button
                                type="button"
                                disabled={!recoveryChecked || fiscal.reconcilingId === row.id}
                                onClick={() => void reconcile(row, "reenvio")}
                                className={cn(BUTTON, "bg-primary text-primary-foreground")}
                              >
                                {fiscal.reconcilingId === row.id && (
                                  <Loader2 aria-hidden className="size-4 animate-spin" />
                                )}
                                Reenviar a mesma operação
                              </button>
                            </div>
                          </div>
                        )}
                        {markTarget === row.id && (
                          <div className="mt-4 rounded-xl border border-foreground/20 p-4 text-sm">
                            <h6 className="font-bold">Registrar não emissão comprovada</h6>
                            <p className="mt-2 leading-6">
                              Use somente com evidência no portal da prefeitura de que a nota não
                              foi gerada. Ausência de resposta não comprova não emissão. O histórico
                              será preservado.
                            </p>
                            <label className="mt-3 block space-y-1.5 font-semibold">
                              Motivo e evidência da conferência
                              <textarea
                                rows={3}
                                className={INPUT}
                                value={markReason}
                                onChange={(event) => setMarkReason(event.target.value)}
                              />
                            </label>
                            <label className="mt-3 flex items-start gap-3">
                              <input
                                type="checkbox"
                                className="mt-1 size-4"
                                checked={markChecked}
                                onChange={(event) => setMarkChecked(event.target.checked)}
                              />
                              Conferi a não emissão no portal da prefeitura.
                            </label>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => setMarkTarget(null)}
                                className={BUTTON}
                              >
                                Fechar
                              </button>
                              <button
                                type="button"
                                disabled={
                                  fiscal.isMarking || !markChecked || markReason.trim().length < 10
                                }
                                onClick={async () => {
                                  try {
                                    await fiscal.markNotIssued({
                                      emissionId: row.id,
                                      reason: markReason.trim(),
                                    });
                                    setMarkTarget(null);
                                  } catch {
                                    /* Safe error supplied by hook. */
                                  }
                                }}
                                className={cn(BUTTON, "bg-primary text-primary-foreground")}
                              >
                                Registrar conferência
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </RentalNfseHistoryState>
        </div>
        {fiscal.hasNextPage && !fiscal.isError && (
          <button
            type="button"
            onClick={() => void fiscal.fetchNextPage()}
            disabled={fiscal.isFetchingNextPage}
            className={cn(BUTTON, "mt-4 w-full border border-foreground/20")}
          >
            {fiscal.isFetchingNextPage ? "Carregando…" : "Carregar competências anteriores"}
          </button>
        )}
      </div>
    </section>
  );
}
