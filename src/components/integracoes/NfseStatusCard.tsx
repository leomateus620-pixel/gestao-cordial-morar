import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, Circle, Loader2, Receipt, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import {
  getNfseHealth,
  getNfseSettings,
  getNfseViewer,
  reclassifyStuckNfse,
  saveNfseSettings,
  type NfseBrandHealth,
  type NfseSettings,
} from "@/lib/nfse/nfse.functions";
import { validateNfseSettings } from "@/lib/nfse/validation";
import { NfseFiscalProfileEditor } from "./NfseFiscalProfileEditor";
import { fiscalProfileApprovalInput, parseProfileDraft, profileToDraft } from "./nfse-profile-form";

const BUTTON =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50";
const HEALTH_LABEL: Record<string, string> = {
  teste_ok: "Validada em teste",
  emitida: "Emitida",
  erro: "Recusada",
  cancelada: "Cancelada",
  processando: "Envio registrado",
  incerto: "Aguardando confirmação",
  nao_emitida: "Não emitida — conferida",
};
function dateTime(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

function Field({
  label,
  value,
  onChange,
  error,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block space-y-1.5 text-sm font-semibold">
      <span>{label}</span>
      <input
        value={value}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 w-full rounded-lg border border-foreground/20 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:bg-foreground/5"
      />
      {error && <span className="block text-sm font-normal text-destructive">{error}</span>}
    </label>
  );
}
function formFromSettings(settings: NfseSettings) {
  return {
    cnpj: settings.cnpj,
    inscricaoMunicipal: settings.inscricaoMunicipal ?? "",
    razaoSocial: settings.razaoSocial ?? "",
    codigoItemListaServico: settings.codigoItemListaServico,
    codigoNbs: settings.codigoNbs ?? "",
    aliquotaIss: String(settings.aliquotaIss),
    situacaoTributaria: settings.situacaoTributaria,
    tributaMunicipioPrestador: settings.tributaMunicipioPrestador,
    cIndOp: settings.cIndOp,
    cst: settings.cst,
    cClassTrib: settings.cClassTrib,
    modoTeste: settings.modoTeste,
    simplesNacional: settings.simplesNacional,
  };
}
function BrandCard({
  settings,
  health,
  isAdmin,
}: {
  settings: NfseSettings;
  health?: NfseBrandHealth;
  isAdmin: boolean;
}) {
  const qc = useQueryClient();
  const save = useServerFn(saveNfseSettings);
  const [form, setForm] = useState(() => formFromSettings(settings));
  const [profileDraft, setProfileDraft] = useState(() => profileToDraft(settings.fiscalProfile));
  const [profileTouched, setProfileTouched] = useState(false);
  const [approvalConfirmed, setApprovalConfirmed] = useState(false);
  useEffect(() => {
    setForm(formFromSettings(settings));
    setProfileDraft(profileToDraft(settings.fiscalProfile));
    setProfileTouched(false);
    setApprovalConfirmed(false);
  }, [settings]);
  const parsedProfile = parseProfileDraft(profileDraft);
  const errors = validateNfseSettings({
    ...form,
    aliquotaIss: Number(form.aliquotaIss.replace(",", ".")),
  });
  const hasErrors =
    Object.keys(errors).length > 0 ||
    (profileTouched && (!parsedProfile.success || !approvalConfirmed));
  const mutation = useMutation({
    mutationFn: () => {
      const { modoTeste, ...commonSettings } = form;
      return save({
        data: {
          brand: settings.brand,
          ...commonSettings,
          aliquotaIss: Number(form.aliquotaIss.replace(",", ".")),
          ...(isAdmin ? { modoTeste } : {}),
          ...fiscalProfileApprovalInput({
            isAdmin,
            confirmed: approvalConfirmed,
            profile: parsedProfile.success ? parsedProfile.data : null,
          }),
        },
      });
    },
    onSuccess: () => {
      setApprovalConfirmed(false);
      toast.success("Configuração fiscal salva. Confira as etapas de habilitação.");
      void qc.invalidateQueries({ queryKey: ["nfse-settings-status"] });
      void qc.invalidateQueries({ queryKey: ["rental-nfse-preview"] });
      void qc.invalidateQueries({ queryKey: ["nfse-health"] });
    },
    onError: (error: unknown) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar a configuração fiscal. Confira os campos e as autorizações da empresa.",
      ),
  });
  const stages = [
    ["Credenciais cadastradas", settings.senhaConfigurada],
    ["Configuração completa", settings.configurationComplete],
    ["Validada em teste", settings.validatedInTest],
    ["Habilitada para produção", settings.productionEnabled],
  ] as const;
  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setApprovalConfirmed(false);
  };

  return (
    <article className="rounded-xl border border-foreground/15 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-bold">
          {settings.brand === "cordial" ? "Cordial Imóveis" : "Morar Imóveis"}
        </h3>
        <span className="text-sm text-foreground/70">
          Configuração <span className="font-mono">v{settings.configVersion}</span>
        </span>
      </div>
      <ol className="mt-4 grid gap-3 sm:grid-cols-2">
        {stages.map(([label, done]) => (
          <li key={label} className="flex items-center gap-2 text-sm">
            {done ? (
              <CheckCircle2 aria-hidden className="size-4 shrink-0 text-emerald-700" />
            ) : (
              <Circle aria-hidden className="size-4 shrink-0 text-foreground/45" />
            )}
            <span>
              {label}
              <span className={done ? "text-emerald-800" : "text-foreground/65"}>
                {" "}
                · {done ? "Confirmado" : "Pendente"}
              </span>
            </span>
          </li>
        ))}
      </ol>
      {!settings.fiscalProfile && (
        <p className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm leading-6 text-amber-900">
          <AlertTriangle aria-hidden className="mt-1 size-4 shrink-0" />
          Perfil fiscal ainda não aprovado. A emissão real e a automação permanecem bloqueadas.
        </p>
      )}
      {health && (
        <div className="mt-4 border-y border-foreground/15 py-3 text-sm leading-6 text-foreground/75">
          <p>
            Última tentativa:{" "}
            {health.ultima
              ? `${HEALTH_LABEL[health.ultima.status] ?? "Conferência necessária"}${health.ultima.modoTeste ? " (teste)" : ""} · ${dateTime(health.ultima.createdAt)}`
              : "nenhuma registrada"}
            .
          </p>
          <p>
            Última nota real:{" "}
            {health.ultimoSucessoReal ? dateTime(health.ultimoSucessoReal) : "nenhuma registrada"}.
          </p>
          <p>
            Nos últimos 30 dias: {health.incerto30d} aguardando confirmação, {health.erro30d}{" "}
            recusadas e {health.naoEmitida30d} não emitidas após conferência.
          </p>
        </div>
      )}
      <p className="mt-4 text-sm leading-6 text-foreground/75">
        Município do prestador: TOM {settings.cidadeTom} · IBGE {settings.codigoIbgeMunicipio}. As
        credenciais são mantidas exclusivamente no servidor.
      </p>
      {!isAdmin && (
        <p className="mt-3 text-sm text-foreground/75">
          Você pode manter os dados cadastrais e tributários. O perfil, as aprovações e a
          habilitação de produção são exclusivos da administração.
        </p>
      )}
      <fieldset disabled={mutation.isPending} className="mt-5">
        <legend className="mb-3 text-base font-bold">Prestador e enquadramento tributário</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="CNPJ do prestador"
            value={form.cnpj}
            onChange={(value) => update("cnpj", value)}
            error={errors.cnpj}
          />
          <Field
            label="Inscrição municipal"
            value={form.inscricaoMunicipal}
            onChange={(value) => update("inscricaoMunicipal", value)}
            error={errors.inscricaoMunicipal}
          />
          <Field
            label="Razão social"
            value={form.razaoSocial}
            onChange={(value) => update("razaoSocial", value)}
          />
          <Field
            label="Item da lista de serviço aprovado"
            value={form.codigoItemListaServico}
            onChange={(value) => update("codigoItemListaServico", value)}
            error={errors.codigoItemListaServico}
          />
          <Field
            label="Código NBS aprovado"
            value={form.codigoNbs}
            onChange={(value) => update("codigoNbs", value)}
            error={errors.codigoNbs}
          />
          <Field
            label="Alíquota ISS (%)"
            value={form.aliquotaIss}
            onChange={(value) => update("aliquotaIss", value)}
            error={errors.aliquotaIss}
          />
          <Field
            label="Situação tributária municipal"
            value={form.situacaoTributaria}
            onChange={(value) => update("situacaoTributaria", value)}
            error={errors.situacaoTributaria}
          />
          <label className="block space-y-1.5 text-sm font-semibold">
            Tributação no município do prestador
            <select
              value={form.tributaMunicipioPrestador}
              onChange={(event) =>
                update("tributaMunicipioPrestador", event.target.value === "S" ? "S" : "N")
              }
              className="min-h-11 w-full rounded-lg border border-foreground/20 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <option value="S">Sim, conforme enquadramento</option>
              <option value="N">Não, conforme enquadramento</option>
            </select>
          </label>
        </div>
        <label className="mt-4 flex items-center gap-3 text-sm font-semibold">
          <Switch
            aria-label="Optante pelo Simples Nacional"
            checked={form.simplesNacional}
            onCheckedChange={(value) => update("simplesNacional", value)}
          />
          Optante pelo Simples Nacional
        </label>
        {profileDraft.ibsCbs === "true" && (
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field
              label="Indicador da operação (cIndOp)"
              value={form.cIndOp}
              onChange={(value) => update("cIndOp", value)}
            />
            <Field
              label="CST IBS/CBS"
              value={form.cst}
              onChange={(value) => update("cst", value)}
            />
            <Field
              label="Classificação tributária (cClassTrib)"
              value={form.cClassTrib}
              onChange={(value) => update("cClassTrib", value)}
            />
          </div>
        )}
        <NfseFiscalProfileEditor
          draft={profileDraft}
          onChange={(draft) => {
            setProfileDraft(draft);
            setProfileTouched(true);
            setApprovalConfirmed(false);
          }}
          disabled={!isAdmin || mutation.isPending}
        />
        {profileTouched && !parsedProfile.success && (
          <p
            role="status"
            className="mt-4 rounded-lg bg-amber-50 p-3 text-sm leading-6 text-amber-900"
          >
            Complete as definições do perfil e a referência da aprovação. As retenções precisam de
            valores explícitos; informe zero quando aprovado. Nenhum código será escolhido
            automaticamente.
          </p>
        )}
        {isAdmin && (
          <label className="mt-4 flex items-start gap-3 rounded-lg border border-primary/25 p-4 text-sm leading-6">
            <input
              type="checkbox"
              className="mt-1 size-4 shrink-0"
              checked={approvalConfirmed}
              disabled={!parsedProfile.success || mutation.isPending}
              onChange={(event) => setApprovalConfirmed(event.target.checked)}
            />
            <span>
              <strong className="font-semibold">
                Conferi a aprovação contábil para esta configuração e operação.
              </strong>
              <span className="mt-1 block text-foreground/75">
                Marque somente após conferir a referência da aprovação e os dados atuais. Qualquer
                alteração exige nova confirmação. Salvar campos comuns sem marcar não renova a
                aprovação anterior.
              </span>
            </span>
          </label>
        )}
        {profileTouched && parsedProfile.success && !approvalConfirmed && (
          <p role="status" className="mt-3 text-sm leading-6 text-amber-900">
            O perfil foi alterado. Confirme a aprovação contábil antes de registrar esta versão.
            Para salvar apenas campos comuns, mantenha o perfil sem alterações.
          </p>
        )}
        <label className="mt-5 flex items-start justify-between gap-4 border-t border-foreground/15 pt-4 text-sm">
          <span>
            <strong className="block">Manter somente em teste</strong>
            <span className="mt-1 block leading-6 text-foreground/75">
              Produção exige perfil aprovado, teste válido para a configuração atual e autorização
              registrada.
            </span>
          </span>
          <Switch
            aria-label="Manter somente em teste"
            checked={form.modoTeste}
            disabled={
              !isAdmin ||
              (form.modoTeste &&
                (!settings.validatedInTest ||
                  !parsedProfile.success ||
                  !parsedProfile.data.productionAuthorization))
            }
            onCheckedChange={(value) => update("modoTeste", value)}
          />
        </label>
        <button
          type="button"
          disabled={mutation.isPending || hasErrors}
          onClick={() => mutation.mutate()}
          className={`${BUTTON} mt-4 bg-primary text-primary-foreground`}
        >
          {mutation.isPending && <Loader2 aria-hidden className="size-4 animate-spin" />}Salvar
          configuração
        </button>
      </fieldset>
      {!settings.senhaConfigurada && (
        <p className="mt-4 text-sm leading-6 text-amber-900">
          Credencial do webservice pendente. Solicite o cadastro seguro à equipe responsável pela
          integração.
        </p>
      )}
    </article>
  );
}

export function NfseStatusCard({ enabled }: { enabled: boolean }) {
  const fetchSettings = useServerFn(getNfseSettings);
  const fetchHealth = useServerFn(getNfseHealth);
  const viewerFn = useServerFn(getNfseViewer);
  const reclassifyFn = useServerFn(reclassifyStuckNfse);
  const qc = useQueryClient();
  const health = useQuery({ queryKey: ["nfse-health"], enabled, queryFn: () => fetchHealth() });
  const viewer = useQuery({
    queryKey: ["nfse-viewer"],
    enabled,
    queryFn: () => viewerFn(),
    staleTime: 300_000,
  });
  const settings = useQuery({
    queryKey: ["nfse-settings-status"],
    enabled,
    queryFn: () =>
      Promise.all(
        (["cordial", "morar"] as const).map((brand) => fetchSettings({ data: { brand } })),
      ),
  });
  const reclassify = useMutation({
    mutationFn: () => reclassifyFn(),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ["nfse-health"] });
      void qc.invalidateQueries({ queryKey: ["rental-nfse"] });
      toast.info(
        `${result.analisadas} pendências analisadas; ${result.alteradas.length} atualizadas. Operações inconclusivas permanecem em conferência.`,
      );
    },
    onError: (error: unknown) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível concluir a conferência dos registros. As operações permanecem protegidas contra nova emissão.",
      ),
  });
  if (!enabled) return null;
  return (
    <section
      className="mb-5 rounded-2xl border border-foreground/15 bg-white p-4 sm:p-6"
      aria-labelledby="nfse-config-title"
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Receipt aria-hidden className="mt-1 size-5 text-primary" />
          <div>
            <h2 id="nfse-config-title" className="text-lg font-bold">
              NFS-e · Santa Rosa / IPM
            </h2>
            <p className="mt-1 text-sm leading-6 text-foreground/75">
              Configuração por empresa, perfil aprovado e habilitação fiscal.
            </p>
          </div>
        </div>
        {viewer.data?.isAdmin && (
          <button
            type="button"
            disabled={reclassify.isPending}
            onClick={() => reclassify.mutate()}
            className={`${BUTTON} border border-foreground/20`}
          >
            {reclassify.isPending ? (
              <Loader2 aria-hidden className="size-4 animate-spin" />
            ) : (
              <RefreshCw aria-hidden className="size-4" />
            )}
            Conferir registros pendentes
          </button>
        )}
      </header>
      {settings.isLoading ? (
        <p role="status" className="mt-5 text-sm">
          Carregando configuração…
        </p>
      ) : settings.isError ? (
        <div role="alert" className="mt-5 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
          <p>
            Não foi possível consultar a configuração fiscal. Tente novamente ou solicite a
            verificação do acesso.
          </p>
          <button
            type="button"
            onClick={() => void settings.refetch()}
            className={`${BUTTON} mt-2 border border-amber-900/25`}
          >
            Tentar novamente
          </button>
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          {health.isError && (
            <div role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              <p>O histórico de validação está indisponível.</p>
              <button type="button" onClick={() => void health.refetch()} className={BUTTON}>
                Tentar novamente
              </button>
            </div>
          )}
          {settings.data?.map((item) => (
            <BrandCard
              key={item.brand}
              settings={item}
              health={health.data?.find((row) => row.brand === item.brand)}
              isAdmin={Boolean(viewer.data?.isAdmin)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
