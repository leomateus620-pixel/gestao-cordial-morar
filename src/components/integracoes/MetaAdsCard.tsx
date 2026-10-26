import { useState, useEffect, useRef, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  configureMetaSystemConnection,
  diagnoseMetaConnection,
  listMetaAccounts,
  type AdCapabilities,
  type AdConnectionPublic,
} from "@/lib/ads/ads.functions";
import { listImoveis } from "@/lib/imoveis/imoveis.functions";
import { listAttendanceBrokers } from "@/lib/attendances/attendances.functions";
import { brokerCanServeAgency } from "@/lib/attendances/broker-scope";
import {
  saveMetaLeadFormMapping,
  listMetaLeadForms,
  listMetaLeadFormMappings,
} from "@/lib/ads/leads.functions";
import { useAds } from "@/hooks/useAds";
import { useSession } from "@/lib/auth-mock";
import { isAdminUser } from "@/lib/access-control";
import type { MarketingAgencyId } from "@/types/marketing";
const EDITOR = "https://lovable.dev/projects/feb646c9-c19a-4360-8cc9-bec5237532ea";
const capabilityLabels: Array<[keyof AdCapabilities, string]> = [
  ["credential_present", "Credencial presente"],
  ["token_valid", "Token válido"],
  ["ads_readable", "Leitura de anúncios"],
  ["leads_readable", "Recuperação de leads"],
  ["app_webhook_configured", "Webhook do aplicativo"],
  ["page_subscribed", "Página inscrita"],
];
function Capability({ label, value }: { label: string; value: boolean | null | undefined }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-muted/50 p-3 text-xs">
      {value === true ? (
        <CheckCircle2 className="size-4 shrink-0 text-emerald-800" />
      ) : (
        <AlertCircle className="size-4 shrink-0 text-foreground/55" />
      )}
      <div>
        <p className="font-semibold">{label}</p>
        <p className="mt-0.5 text-foreground/65">
          {value === true
            ? "Comprovado no último teste"
            : value === false
              ? "Pendente / requer ação"
              : "Ainda não verificado"}
        </p>
      </div>
    </div>
  );
}
export function MetaAdsCard({ enabled = true }: { enabled?: boolean }) {
  const session = useSession();
  if (!enabled || !isAdminUser(session)) return null;
  return <MetaAdsAdmin />;
}
function MetaAdsAdmin() {
  const ads = useAds(),
    qc = useQueryClient();
  const configure = useServerFn(configureMetaSystemConnection),
    diagnose = useServerFn(diagnoseMetaConnection),
    accounts = useServerFn(listMetaAccounts);
  const [agency, setAgency] = useState<MarketingAgencyId>("cordial"),
    [appId, setAppId] = useState(""),
    [pageId, setPageId] = useState(""),
    [accountId, setAccountId] = useState("");
  const [credentialRef, setCredentialRef] = useState("META_ACCESS_TOKEN"),
    [pageCredentialRef, setPageCredentialRef] = useState(""),
    [appSecretRef, setAppSecretRef] = useState("META_APP_SECRET");
  const [diagnosingId, setDiagnosingId] = useState<string | null>(null),
    [diagnostics, setDiagnostics] = useState<Record<string, AdCapabilities>>({});
  const save = useMutation({
    mutationFn: () =>
      configure({
        data: {
          imobiliaria: agency,
          appId,
          pageId,
          accountId,
          credentialRef,
          pageCredentialRef: pageCredentialRef || undefined,
          appSecretRef,
        },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["marketing", "ad-connections"] });
      toast.success("Vínculo salvo. Teste a conexão para verificar as capacidades.");
    },
    onError: () =>
      toast.error(
        "Não foi possível salvar. Confira os IDs, referências e o aplicativo configurado no servidor.",
      ),
  });
  const meta = ads.connections.filter((c) => c.platform === "meta" && c.id);
  async function test(c: AdConnectionPublic) {
    if (!c.id) return;
    setDiagnosingId(c.id);
    try {
      const result = await diagnose({ data: { connectionId: c.id } });
      setDiagnostics((old) => ({ ...old, [c.id!]: result }));
      await accounts({ data: { connectionId: c.id } }).catch(() => null);
      void qc.invalidateQueries({ queryKey: ["marketing", "ad-connections"] });
      toast("Diagnóstico atualizado. Confira cada capacidade abaixo.");
    } catch {
      toast.error(
        "O diagnóstico não pôde ser concluído. Confira a configuração segura no backend.",
      );
    } finally {
      setDiagnosingId(null);
    }
  }
  return (
    <section
      className="mb-5 rounded-3xl bg-card p-4 ring-1 ring-border/60 sm:p-6"
      aria-label="Integração Meta Ads"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 font-display text-xl font-bold text-primary">
            f
          </span>
          <div>
            <h2 className="font-display text-lg font-semibold">Meta Ads e Lead Ads</h2>
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-foreground/65">
              Conexões por marca, leitura de campanhas e entrada de leads. Cada capacidade é
              verificada separadamente.
            </p>
          </div>
        </div>
        <a
          href={EDITOR}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-2xl border px-3 text-xs font-semibold text-primary"
        >
          <ShieldCheck className="size-4" />
          Abrir configuração segura
          <ExternalLink className="size-3.5" />
        </a>
      </div>
      <p className="mt-4 rounded-2xl bg-muted/60 p-3 text-xs leading-relaxed text-foreground/70">
        Insira token, App Secret e verify token somente no formulário de secrets do backend no
        editor Lovable do Gestão Cordial. Este painel recebe apenas IDs públicos e nomes de
        referências; nunca recebe nem mostra credenciais.
      </p>
      <div className="mt-5 space-y-4">
        {(["cordial", "morar"] as const).map((brand) => {
          const rows = meta.filter((c) => c.imobiliaria === brand);
          return (
            <div key={brand} className="rounded-2xl border p-4">
              <h3 className="text-sm font-semibold capitalize">{brand}</h3>
              {!rows.length ? (
                <p className="mt-2 text-xs text-foreground/65">
                  Não configurada. Vincule ativos e credencial próprios desta marca.
                </p>
              ) : (
                rows.map((c) => {
                  const caps = diagnostics[c.id!] ?? c.capabilities;
                  return (
                    <article key={c.id} className="mt-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 text-xs text-foreground/65">
                          <p className="break-words">
                            Conta {c.accountId || "não vinculada"} · Página{" "}
                            {c.pageId || "não vinculada"}
                          </p>
                          <p className="mt-1 break-words">
                            Aplicativo {c.appId || "a verificar"} ·{" "}
                            {c.credentialMode === "system_user"
                              ? "Usuário do sistema"
                              : "OAuth de usuário"}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          className="min-h-11 rounded-xl"
                          onClick={() => void test(c)}
                          disabled={diagnosingId === c.id}
                        >
                          {diagnosingId === c.id && <Loader2 className="size-4 animate-spin" />}
                          Testar conexão
                        </Button>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        {capabilityLabels.map(([key, label]) => (
                          <Capability
                            key={key}
                            label={label}
                            value={typeof caps?.[key] === "boolean" ? (caps[key] as boolean) : null}
                          />
                        ))}
                      </div>
                      {caps?.checked_at && (
                        <p className="mt-3 text-xs text-foreground/60">
                          Verificado em {new Date(caps.checked_at).toLocaleString("pt-BR")}
                          {caps.expires_at
                            ? ` · Expiração informada: ${new Date(caps.expires_at).toLocaleString("pt-BR")}`
                            : " · Sem expiração informada; a credencial ainda pode ser revogada."}
                        </p>
                      )}
                      <details className="mt-3 rounded-xl bg-muted/40 p-3">
                        <summary className="min-h-11 cursor-pointer text-xs font-semibold">
                          Ver diagnóstico e próximos passos
                        </summary>
                        <ul className="mt-2 space-y-2 text-xs leading-relaxed text-foreground/70">
                          <li>
                            Token e anúncios: valide o aplicativo emissor, ads_read e acesso efetivo
                            à conta.
                          </li>
                          <li>
                            Leads: valide leads_retrieval, acesso à Página e aos leads do
                            formulário. Um token de Página pode ser necessário.
                          </li>
                          <li>
                            Webhook do aplicativo: no painel Meta → Webhooks → objeto Page,
                            configure o callback público implantado e assine leadgen.
                          </li>
                          <li>
                            Inscrição da Página: confirme /Página/subscribed_apps com leadgen e a
                            permissão pages_manage_metadata adequada. Não remova campos já
                            assinados.
                          </li>
                          <li>
                            Challenge, conexão e inscrição da Página são verificações distintas. Use
                            a ferramenta oficial de teste de Lead Ads para comprovar o ciclo até o
                            CRM.
                          </li>
                        </ul>
                        {caps?.errors?.length ? (
                          <p className="mt-3 break-words text-xs text-amber-900">
                            Pendências:{" "}
                            {caps.errors.map((e) => `${e.capability}: ${e.code}`).join(" · ")}
                          </p>
                        ) : null}
                        <p className="mt-3 text-xs text-foreground/65">
                          Última sincronização bem sucedida:{" "}
                          {caps?.last_successful_sync
                            ? new Date(caps.last_successful_sync).toLocaleString("pt-BR")
                            : "ainda não comprovada"}
                          .
                        </p>
                      </details>
                      <MetaFormMapping connection={c} />
                    </article>
                  );
                })
              )}
            </div>
          );
        })}
      </div>
      <details className="mt-5 rounded-2xl border p-4">
        <summary className="flex min-h-11 cursor-pointer items-center justify-between text-sm font-semibold">
          Vincular usuário do sistema e ativos
          <ChevronDown className="size-4" />
        </summary>
        <p className="mt-2 text-xs leading-relaxed text-foreground/65">
          Não exige novo login OAuth. A referência deve apontar para um secret já configurado no
          backend; salvar o vínculo não comprova acesso aos ativos.
        </p>
        <form
          className="mt-4 grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <Field label="Imobiliária">
            <select
              className="h-11 w-full rounded-xl border bg-background px-3 text-sm"
              value={agency}
              onChange={(e) => {
                const a = e.target.value as MarketingAgencyId;
                setAgency(a);
                setCredentialRef(a === "cordial" ? "META_ACCESS_TOKEN" : "META_MORAR_ACCESS_TOKEN");
                setAppSecretRef(a === "cordial" ? "META_APP_SECRET" : "META_MORAR_APP_SECRET");
              }}
            >
              <option value="cordial">Cordial</option>
              <option value="morar">Morar</option>
            </select>
          </Field>
          <Field label="ID do aplicativo">
            <Input
              className="h-11 rounded-xl"
              inputMode="numeric"
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
              required
              pattern="[0-9]+"
            />
          </Field>
          <Field label="ID da Página">
            <Input
              className="h-11 rounded-xl"
              inputMode="numeric"
              value={pageId}
              onChange={(e) => setPageId(e.target.value)}
              required
              pattern="[0-9]+"
            />
          </Field>
          <Field label="ID da conta de anúncios">
            <Input
              className="h-11 rounded-xl"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              required
              pattern="(act_)?[0-9]+"
            />
          </Field>
          <Field label="Nome da referência do token">
            <Input
              className="h-11 rounded-xl font-mono text-xs"
              value={credentialRef}
              onChange={(e) => setCredentialRef(e.target.value)}
              required
              pattern="[A-Z0-9_]+"
            />
          </Field>
          <Field label="Referência do token de Página (opcional)">
            <Input
              className="h-11 rounded-xl font-mono text-xs"
              value={pageCredentialRef}
              onChange={(e) => setPageCredentialRef(e.target.value)}
              pattern="[A-Z0-9_]+"
              placeholder="Nome do secret do token de Página"
            />
          </Field>
          <Field label="Nome da referência do App Secret">
            <Input
              className="h-11 rounded-xl font-mono text-xs"
              value={appSecretRef}
              onChange={(e) => setAppSecretRef(e.target.value)}
              required
              pattern="[A-Z0-9_]+"
            />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" className="min-h-11 rounded-xl" disabled={save.isPending}>
              {save.isPending ? "Salvando…" : "Salvar vínculo e manter diagnóstico pendente"}
            </Button>
          </div>
        </form>
      </details>
      <details className="mt-3 rounded-2xl border p-4">
        <summary className="min-h-11 cursor-pointer text-sm font-semibold">
          OAuth existente e Google Ads
        </summary>
        <p className="mt-2 text-xs text-foreground/65">
          Selecione a marca antes de autorizar uma conexão de usuário. Os ativos de outra marca não
          são reutilizados.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(["cordial", "morar"] as const).map((brand) => (
            <Button
              key={brand}
              variant="outline"
              className="min-h-11 rounded-xl"
              onClick={async () => {
                const r = await ads.connect("google", brand);
                if (!r.ok) toast.error(r.message);
              }}
            >
              Conectar Google · {brand}
            </Button>
          ))}
        </div>
      </details>
    </section>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-xs font-semibold text-foreground/75">
      {label}
      {children}
    </label>
  );
}
function MetaFormMapping({ connection }: { connection: AdConnectionPublic }) {
  const loadedMapping = useRef<string | null>(null);
  const qc = useQueryClient();
  const save = useServerFn(saveMetaLeadFormMapping),
    getProperties = useServerFn(listImoveis),
    getBrokers = useServerFn(listAttendanceBrokers),
    getForms = useServerFn(listMetaLeadForms),
    getMappings = useServerFn(listMetaLeadFormMappings);
  const session = useSession();
  const [mappingOpen, setMappingOpen] = useState(false),
    [propertySearch, setPropertySearch] = useState(""),
    [propertyId, setPropertyId] = useState(""),
    [brokerId, setBrokerId] = useState("");
  const properties = useQuery({
    queryKey: ["marketing", "mapping-properties", session?.id, connection.id, propertySearch],
    queryFn: () =>
      getProperties({
        data: {
          carteira: connection.imobiliaria as MarketingAgencyId,
          search: propertySearch,
          page: 0,
          pageSize: 15,
        },
      }),
    enabled: mappingOpen && propertySearch.trim().length >= 2,
  });
  const forms = useQuery({
    queryKey: ["marketing", "mapping-forms", session?.id, connection.id],
    queryFn: () => getForms({ data: { connectionId: connection.id! } }),
    enabled: mappingOpen,
    retry: false,
    staleTime: 60_000,
  });
  const mappings = useQuery({
    queryKey: ["marketing", "lead-form-mappings", session?.id],
    queryFn: () => getMappings(),
    enabled: mappingOpen,
    staleTime: 60_000,
  });
  const brokers = useQuery({
    queryKey: ["marketing", "mapping-brokers", session?.id, connection.id],
    queryFn: () => getBrokers(),
    enabled: mappingOpen,
    staleTime: 60_000,
  });
  const [formId, setFormId] = useState(""),
    [nameKey, setNameKey] = useState("full_name"),
    [phoneKey, setPhoneKey] = useState("phone_number"),
    [emailKey, setEmailKey] = useState("email"),
    [interestKey, setInterestKey] = useState("");
  const [finalidade, setFinalidade] = useState<"" | "compra" | "aluguel" | "ambos">(""),
    [tipo, setTipo] = useState<
      | ""
      | "casa"
      | "apartamento"
      | "kitnet"
      | "terreno"
      | "sala_comercial"
      | "area_rural"
      | "sitio_chacara"
      | "outro"
    >("");
  useEffect(() => {
    const existing = mappings.data?.find(
      (mapping) => mapping.connection_id === connection.id && mapping.form_id === formId,
    );
    if (!existing) {
      loadedMapping.current = null;
      return;
    }
    const key = `${connection.id}:${formId}`;
    if (loadedMapping.current === key) return;
    loadedMapping.current = key;
    const fields =
      existing.field_mapping &&
      typeof existing.field_mapping === "object" &&
      !Array.isArray(existing.field_mapping)
        ? existing.field_mapping
        : {};
    setNameKey(typeof fields.full_name === "string" ? fields.full_name : "full_name");
    setPhoneKey(typeof fields.phone === "string" ? fields.phone : "phone_number");
    setEmailKey(typeof fields.email === "string" ? fields.email : "email");
    setInterestKey(typeof fields.interest === "string" ? fields.interest : "");
    setFinalidade(existing.finalidade as typeof finalidade);
    setTipo(existing.tipo_imovel as typeof tipo);
    setPropertyId(existing.property_id || "");
    setBrokerId(existing.broker_id || "");
  }, [formId, connection.id, mappings.data]);
  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          connectionId: connection.id!,
          pageId: connection.pageId!,
          formId,
          imobiliaria: connection.imobiliaria as MarketingAgencyId,
          fieldMapping: {
            full_name: nameKey || undefined,
            phone: phoneKey || undefined,
            email: emailKey || undefined,
            interest: interestKey || undefined,
          },
          finalidade: finalidade || null,
          tipoImovel: tipo || null,
          propertyId: propertyId || null,
          brokerId: brokerId || null,
        },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["marketing", "lead-form-mappings"] });
      toast.success("Mapeamento salvo. Novas entradas sem corretor ficarão a distribuir.");
    },
    onError: () => toast.error("Não foi possível salvar o mapeamento do formulário."),
  });
  if (!connection.pageId) return null;
  return (
    <details
      className="mt-3 rounded-xl bg-muted/40 p-3"
      onToggle={(e) => setMappingOpen(e.currentTarget.open)}
    >
      <summary className="min-h-11 cursor-pointer text-xs font-semibold">
        Mapear formulário de leads para o CRM
      </summary>
      <p className="mt-2 text-xs text-foreground/65">
        Use os nomes exatos de field_data. Sem finalidade ou tipo explícitos, a entrada fica para
        revisão. Selecione imóvel e corretor somente quando a regra do formulário for explícita; em
        branco, permanecem a identificar / a distribuir.
      </p>
      <form
        className="mt-3 grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <Field label="Formulários disponíveis na Página">
          <select
            className="h-11 min-w-0 rounded-xl border bg-background px-3 text-sm"
            value={forms.data?.some((form) => form.id === formId) ? formId : ""}
            onChange={(e) => {
              setFormId(e.target.value);
              setPropertyId("");
              setBrokerId("");
              setFinalidade("");
              setTipo("");
            }}
          >
            <option value="">
              {forms.isLoading
                ? "Consultando formulários…"
                : forms.isError
                  ? "Sem leitura de formulários — revise a conexão"
                  : "Selecione o formulário"}
            </option>
            {forms.data?.map((form) => (
              <option key={form.id} value={form.id}>
                {form.name || form.id} · {form.status || "Status não informado"}
              </option>
            ))}
          </select>
        </Field>
        <Field label="ID do formulário">
          <Input
            className="h-11 rounded-xl"
            value={formId}
            onChange={(e) => setFormId(e.target.value)}
            required
            pattern="[0-9]+"
          />
        </Field>
        <Field label="Campo nome">
          <Input
            className="h-11 rounded-xl"
            value={nameKey}
            onChange={(e) => setNameKey(e.target.value)}
          />
        </Field>
        <Field label="Campo telefone">
          <Input
            className="h-11 rounded-xl"
            value={phoneKey}
            onChange={(e) => setPhoneKey(e.target.value)}
          />
        </Field>
        <Field label="Campo e-mail">
          <Input
            className="h-11 rounded-xl"
            value={emailKey}
            onChange={(e) => setEmailKey(e.target.value)}
          />
        </Field>
        <Field label="Campo interesse (opcional)">
          <Input
            className="h-11 rounded-xl"
            value={interestKey}
            onChange={(e) => setInterestKey(e.target.value)}
          />
        </Field>
        <Field label="Finalidade explícita do formulário">
          <select
            className="h-11 rounded-xl border bg-background px-3 text-sm"
            value={finalidade}
            onChange={(e) => setFinalidade(e.target.value as typeof finalidade)}
          >
            <option value="">A identificar</option>
            <option value="compra">Compra</option>
            <option value="aluguel">Aluguel</option>
            <option value="ambos">Ambos</option>
          </select>
        </Field>
        <Field label="Tipo de imóvel explícito">
          <select
            className="h-11 rounded-xl border bg-background px-3 text-sm"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as typeof tipo)}
          >
            <option value="">A identificar</option>
            {[
              ["casa", "Casa"],
              ["apartamento", "Apartamento"],
              ["kitnet", "Kitnet"],
              ["terreno", "Terreno"],
              ["sala_comercial", "Sala comercial"],
              ["area_rural", "Área rural"],
              ["sitio_chacara", "Sítio / chácara"],
              ["outro", "Outro"],
            ].map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Buscar imóvel por código ou endereço (opcional)">
          <Input
            className="h-11 rounded-xl"
            value={propertySearch}
            onChange={(e) => {
              setPropertySearch(e.target.value);
              setPropertyId("");
            }}
            placeholder="Digite ao menos 2 caracteres"
          />
        </Field>
        <Field label="Vínculo explícito do imóvel">
          <select
            className="h-11 min-w-0 rounded-xl border bg-background px-3 text-sm"
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
          >
            <option value="">A identificar</option>
            {propertyId && !properties.data?.items.some((p) => p.id === propertyId) && (
              <option value={propertyId}>Vínculo atual salvo</option>
            )}
            {properties.data?.items.map((p) => (
              <option key={p.id} value={p.id}>
                {p.codigo || p.codigoCordial || p.codigoMorar || "Sem código"} ·{" "}
                {p.tipo || "Imóvel"} · {p.bairro || p.cidade || "Local não informado"}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Regra explícita de responsável">
          <select
            className="h-11 min-w-0 rounded-xl border bg-background px-3 text-sm"
            value={brokerId}
            onChange={(e) => setBrokerId(e.target.value)}
          >
            <option value="">A distribuir</option>
            {brokers.data
              ?.filter((b) => brokerCanServeAgency(b, connection.imobiliaria))
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nome}
                </option>
              ))}
          </select>
        </Field>
        <div className="sm:col-span-2">
          <Button
            type="submit"
            variant="outline"
            className="min-h-11 rounded-xl"
            disabled={mutation.isPending}
          >
            Salvar mapeamento explícito
          </Button>
        </div>
      </form>
    </details>
  );
}
