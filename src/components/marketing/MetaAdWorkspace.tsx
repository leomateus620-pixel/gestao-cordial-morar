import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, Save, Send, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { useSession } from "@/lib/auth-mock";
import { useMarketingActions } from "@/hooks/useMarketingActions";
import { importDiscoveredMetaCampaign, type AdConnectionPublic } from "@/lib/ads/ads.functions";
import {
  listMetaAdDrafts,
  saveMetaAdDraft,
  getMetaAdDraft,
  submitMetaAdDraft,
  reconcileMetaAdCommand,
  resumeMetaAdCommand,
  listMetaAdCreationAssets,
  uploadMetaAdImage,
  refreshMetaAdDraft,
  changeMetaAdDelivery,
  changeMetaAdBudget,
} from "@/lib/ads/drafts.functions";
import {
  metaAdDraftPayloadSchema,
  type MetaAdDraft,
  type MetaAdDraftInput,
} from "@/lib/ads/drafts.model";
import { accountDateTime, accountDateTimeInput, brlAmountMinor } from "@/lib/marketing/draft-input";

const steps = [
  "Conta e identidade",
  "Público e destino",
  "Orçamento e calendário",
  "Criativo e conteúdo",
  "Revisão e envio",
];
const statusLabels: Record<string, string> = {
  rascunho: "Rascunho",
  enviando: "Enviando",
  pausado_na_meta: "Criado pausado na Meta",
  ativo: "Ativo",
  parcial: "Criação parcial",
  incerto: "Resultado incerto",
  falhou: "Falha",
};
const fieldClass =
  "mt-1.5 min-h-11 w-full rounded-xl border border-foreground/55 bg-background px-3 py-2 text-sm font-normal";
export function MetaAdWorkspace({
  agency,
  connections,
  open,
  onOpenChange,
  onRestoreFocus,
  newDraftKey,
  range,
}: {
  newDraftKey: number;
  range: { since: string; until: string };
  agency: "cordial" | "morar" | "todas";
  connections: AdConnectionPublic[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRestoreFocus?: () => void;
}) {
  const actions = useMarketingActions();
  const session = useSession(),
    qc = useQueryClient();
  const list = useServerFn(listMetaAdDrafts),
    save = useServerFn(saveMetaAdDraft),
    get = useServerFn(getMetaAdDraft),
    submit = useServerFn(submitMetaAdDraft),
    reconcile = useServerFn(reconcileMetaAdCommand),
    resumeCommand = useServerFn(resumeMetaAdCommand),
    getAssets = useServerFn(listMetaAdCreationAssets),
    upload = useServerFn(uploadMetaAdImage);
  const [draft, setDraft] = useState<MetaAdDraft | null>(null);
  const [payload, setPayload] = useState<MetaAdDraftInput>({
    country: "BR",
    destination: "website",
    budget: { kind: "daily", currency: "BRL" },
    creative: { callToAction: "LEARN_MORE" },
  });
  const [connectionId, setConnectionId] = useState("");
  const [step, setStep] = useState(0),
    [dirty, setDirty] = useState(false),
    [confirmed, setConfirmed] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [budgetText, setBudgetText] = useState("");
  const [dateDrafts, setDateDrafts] = useState<{ startTime?: string; endTime?: string }>({});
  const [working, setWorking] = useState(false);
  const busy = useRef(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const draftTriggerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    draftTriggerRef.current = null;
    setDraft(null);
    setConnectionId("");
    setPayload({
      country: "BR",
      destination: "website",
      budget: { kind: "daily", currency: "BRL" },
      creative: { callToAction: "LEARN_MORE" },
    });
    setBudgetText("");
    setDateDrafts({});
    setStep(0);
    setDirty(false);
    setConfirmed(false);
    setErrors({});
  }, [newDraftKey]);
  const selectedConnection = connections.find((connection) => connection.id === connectionId);
  const scopedAgency = draft?.imobiliaria ?? selectedConnection?.imobiliaria;
  const drafts = useQuery({
    queryKey: ["marketing", "ad-drafts", session?.id, session?.perfil, agency],
    queryFn: () => list({ data: { imobiliaria: agency === "todas" ? undefined : agency } }),
    enabled: actions.can("create_draft", agency) && actions.can("read_ad_budget", agency),
    staleTime: 15_000,
  });
  const assets = useQuery({
    queryKey: ["marketing", "ad-assets", session?.id, session?.perfil, scopedAgency, connectionId],
    queryFn: () =>
      getAssets({ data: { connectionId, imobiliaria: scopedAgency as "cordial" | "morar" } }),
    enabled:
      open &&
      Boolean(connectionId && scopedAgency) &&
      actions.can("create_draft", scopedAgency) &&
      actions.can("read_ad_budget", scopedAgency),
    staleTime: 60_000,
    retry: false,
  });
  const live = useQuery({
    queryKey: ["marketing", "ad-draft", session?.id, session?.perfil, draft?.id],
    queryFn: () => get({ data: { id: draft!.id } }),
    enabled: open && Boolean(draft?.id) && actions.can("read_ad_budget", scopedAgency),
    refetchInterval: (query) => (query.state.data?.status === "enviando" ? 3000 : false),
  });
  const currentDraft =
    live.data && live.data.revision >= (draft?.revision ?? 0) ? live.data : draft;
  useEffect(() => {
    if (
      live.data &&
      !dirty &&
      live.data.id === draft?.id &&
      live.data.revision >= (draft?.revision ?? 0) &&
      live.data.status !== "rascunho"
    )
      setPayload(live.data.payload);
  }, [live.data, dirty, draft?.id, draft?.revision]);
  const locked = currentDraft && !["rascunho", "falhou"].includes(currentDraft.status);
  const timeZone = assets.data?.timezone || "America/Sao_Paulo";
  function update(patch: Partial<MetaAdDraftInput>) {
    setPayload((old) => ({ ...old, ...patch }));
    setDirty(true);
    setConfirmed(false);
    setErrors({});
  }
  function refresh() {
    void qc.invalidateQueries({ queryKey: ["marketing", "ad-drafts"] });
    void qc.invalidateQueries({ queryKey: ["marketing", "ad-draft"] });
  }
  function changeDate(key: "startTime" | "endTime", raw: string) {
    setDateDrafts((old) => ({ ...old, [key]: raw }));
    update({
      budget: { ...payload.budget, [key]: raw ? accountDateTime(raw, timeZone) : undefined },
    });
  }
  async function persist() {
    const invalid = Object.entries(dateDrafts).find(
      ([, raw]) => raw && !accountDateTime(raw, timeZone),
    );
    if (invalid) {
      setErrors({ [`budget.${invalid[0]}`]: "Informe uma data e hora válidas no fuso da conta." });
      setStep(2);
      return null;
    }

    if (!connectionId || !scopedAgency) {
      setErrors({ connectionId: "Selecione uma conexão com imobiliária vinculada." });
      setStep(0);
      return null;
    }
    const saved = await save({
      data: {
        ...(draft ? { id: draft.id, expectedRevision: draft.revision } : {}),
        connectionId,
        imobiliaria: scopedAgency as "cordial" | "morar",
        payload: { ...payload, pageId: assets.data?.page.id ?? payload.pageId },
      },
    });
    setDraft(saved);
    setDateDrafts({});
    setPayload(saved.payload);
    setDirty(false);
    refresh();
    return saved;
  }
  async function saveAnd(next?: number) {
    if (busy.current) return;
    busy.current = true;
    setWorking(true);
    try {
      const saved = await persist();
      if (saved && next !== undefined) setStep(next);
    } catch {
      toast.error(
        "O rascunho não foi salvo. Suas alterações continuam nesta tela; confira a conexão e tente novamente.",
      );
    } finally {
      busy.current = false;
      setWorking(false);
    }
  }
  async function sendPaused() {
    const parsed = metaAdDraftPayloadSchema.safeParse({
      ...payload,
      pageId: assets.data?.page.id ?? payload.pageId,
    });
    if (!parsed.success) {
      const issues = Object.fromEntries(
        parsed.error.issues.map((issue) => [issue.path.join("."), issue.message]),
      );
      setErrors(issues);
      const firstPath = parsed.error.issues[0]?.path.join(".") ?? "name";
      setStep(
        firstPath.startsWith("creative")
          ? 3
          : firstPath.startsWith("budget")
            ? 2
            : ["websiteUrl", "formId", "housingConfirmed"].includes(firstPath)
              ? 1
              : 0,
      );
      requestAnimationFrame(() =>
        (
          editorRef.current?.querySelector<HTMLElement>(`[name="${firstPath}"]`) ??
          editorRef.current?.querySelector<HTMLElement>("[data-validation-errors]")
        )?.focus(),
      );
      return;
    }
    if (!confirmed || busy.current) return;
    busy.current = true;
    setWorking(true);
    try {
      const saved = dirty || !draft ? await persist() : draft;
      if (!saved) return;
      const result = await submit({
        data: { id: saved.id, expectedRevision: saved.revision, confirmation: "CREATE_PAUSED" },
      });
      setDraft({
        ...saved,
        status:
          result.state === "done"
            ? "pausado_na_meta"
            : result.state === "uncertain"
              ? "incerto"
              : result.state === "partial"
                ? "parcial"
                : result.state === "failed"
                  ? "falhou"
                  : "enviando",
      });
      refresh();
      toast(
        result.state === "done"
          ? "Hierarquia criada pausada e conferida na Meta. A aprovação e a entrega são etapas separadas."
          : "Comando registrado. Confira o estado e os IDs antes de tentar novamente.",
      );
    } catch {
      toast.error("Envio não confirmado. Consulte o comando persistido antes de tentar novamente.");
      refresh();
    } finally {
      busy.current = false;
      setWorking(false);
    }
  }
  const resume = useMutation({
    mutationFn: (id: string) => resumeCommand({ data: { id } }),
    onSuccess: (result) => {
      refresh();
      toast(
        result.state === "done"
          ? "Comando concluído e conferido na Meta."
          : "Retomada registrada. Confira o resultado antes de repetir.",
      );
    },
    onError: () => {
      refresh();
      toast.error("A retomada não foi confirmada. Confira o estado persistido.");
    },
  });
  const recovery = useMutation({
    mutationFn: (id: string) => reconcile({ data: { id } }),
    onSuccess: refresh,
    onError: () =>
      toast.error(
        "Ainda não foi possível reconciliar. Não repita a criação enquanto o resultado for incerto.",
      ),
  });
  const imageUpload = useMutation({
    mutationFn: async (file: File) => {
      if (!["image/png", "image/jpeg"].includes(file.type) || file.size > 5 * 1024 * 1024)
        throw new Error("Formato inválido");
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      return upload({
        data: {
          connectionId,
          imobiliaria: scopedAgency as "cordial" | "morar",
          base64,
          fileName: file.name,
        },
      });
    },
    onSuccess: () => {
      void assets.refetch();
      toast.success("Imagem enviada. Selecione-a na lista após o processamento.");
    },
    onError: () =>
      toast.error(
        "Não foi possível enviar. Use JPEG ou PNG de até 5 MB e confira a autorização da conta.",
      ),
  });
  function openDraft(item: MetaAdDraft, trigger: HTMLElement) {
    draftTriggerRef.current = trigger;
    setDateDrafts({});
    setDraft(item);
    setPayload(item.payload);
    setConnectionId(item.connection_id);
    setBudgetText(
      item.payload.budget?.amountMinor
        ? (Number(item.payload.budget.amountMinor) / 100).toFixed(2).replace(".", ",")
        : "",
    );
    setStep(item.status === "rascunho" ? 0 : 4);
    setDirty(false);
    setConfirmed(false);
    setErrors({});
    onOpenChange(true);
  }
  const permittedDrafts = drafts.data?.filter(
    (item) =>
      actions.can("read_ad_budget", item.imobiliaria) &&
      actions.can("create_draft", item.imobiliaria),
  );
  const selectedImage = assets.data?.images.find(
    (image) => image.hash === payload.creative?.imageHash,
  );
  return (
    <>
      {drafts.isError ? (
        <p className="text-sm text-red-800">
          Não foi possível carregar os rascunhos.{" "}
          <button className="min-h-11 underline" onClick={() => void drafts.refetch()}>
            Tentar novamente
          </button>
        </p>
      ) : (
        Boolean(permittedDrafts?.length) && (
          <section className="border-y py-3">
            <h2 className="text-sm font-semibold">Rascunhos e envios à Meta</h2>
            <ul className="mt-2 divide-y">
              {permittedDrafts?.map((item) => (
                <li key={item.id}>
                  <button
                    className="flex min-h-11 w-full items-center justify-between gap-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    onClick={(event) => openDraft(item, event.currentTarget)}
                  >
                    <span className="min-w-0 break-words text-sm font-semibold">
                      {item.payload.name || "Rascunho sem título"}
                      <span className="ml-2 text-xs font-normal capitalize text-foreground/70">
                        {item.imobiliaria}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-foreground/70">
                      {statusLabels[item.status] ?? item.status}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )
      )}
      <Sheet
        open={open && (!scopedAgency || actions.can("read_ad_budget", scopedAgency))}
        onOpenChange={(next) => {
          if (!next && (working || busy.current)) return;
          if (!next && dirty) {
            busy.current = true;
            void (async () => {
              try {
                setWorking(true);
                const saved = await persist();
                if (saved) onOpenChange(false);
              } catch {
                toast.error(
                  "Não foi possível salvar. O rascunho continua aberto para preservar suas alterações.",
                );
              } finally {
                busy.current = false;
                setWorking(false);
              }
            })();
            return;
          }
          onOpenChange(next);
        }}
      >
        <SheetContent
          side="right"
          className="flex h-full w-full max-w-full flex-col overflow-hidden bg-background p-0 sm:max-w-[48rem]"
          closeLabel="Fechar assistente"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const target = draftTriggerRef.current;
            if (target?.isConnected && target.getClientRects().length > 0)
              target.focus({ preventScroll: true });
            else onRestoreFocus?.();
          }}
        >
          <div
            ref={editorRef}
            className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-4 pb-8 sm:p-6"
          >
            <SheetHeader className="pr-8 text-left">
              <SheetTitle className="font-display text-2xl">Criar anúncio na Meta</SheetTitle>
              <SheetDescription>
                {currentDraft
                  ? `Revisão ${currentDraft.revision} · ${statusLabels[currentDraft.status]}`
                  : "Novo rascunho"}{" "}
                ·{" "}
                {dirty
                  ? "Alterações locais ainda não salvas"
                  : draft
                    ? "Salvo no servidor"
                    : "Ainda não salvo"}
              </SheetDescription>
            </SheetHeader>
            <ol className="my-5 flex gap-1" aria-label="Etapas do anúncio">
              {steps.map((label, index) => (
                <li key={label} className="min-w-0 flex-1">
                  <button
                    className={`min-h-11 w-full border-b-2 px-1 py-2 text-xs ${index === step ? "border-primary font-semibold text-primary" : "border-border text-foreground/70"}`}
                    aria-current={index === step ? "step" : undefined}
                    onClick={() => setStep(index)}
                  >
                    {index + 1}
                    <span className="sr-only sm:not-sr-only sm:mt-1 sm:block">{label}</span>
                  </button>
                </li>
              ))}
            </ol>
            <h3 className="mb-4 font-display text-lg font-semibold">{steps[step]}</h3>
            {Object.keys(errors).length > 0 && (
              <div
                tabIndex={-1}
                data-validation-errors
                role="alert"
                className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900"
              >
                <p className="font-semibold">Revise antes de continuar</p>
                <ul className="mt-2 list-inside list-disc">
                  {Object.entries(errors).map(([key, message]) => (
                    <li key={key}>{message}</li>
                  ))}
                </ul>
              </div>
            )}
            <fieldset
              disabled={
                Boolean(locked) ||
                working ||
                Boolean(scopedAgency && !actions.can("create_draft", scopedAgency))
              }
              className="shrink-0 space-y-4 disabled:opacity-75"
            >
              {step === 0 && (
                <>
                  <Field label="Conexão e conta autorizada">
                    <select
                      className={fieldClass}
                      value={connectionId}
                      disabled={Boolean(draft)}
                      onChange={(event) => {
                        setConnectionId(event.target.value);
                        update({
                          pageId: undefined,
                          formId: undefined,
                          creative: { callToAction: "LEARN_MORE" },
                        });
                      }}
                    >
                      <option value="">Selecionar conexão Meta</option>
                      {connections
                        .filter(
                          (connection) =>
                            connection.platform === "meta" &&
                            actions.can("create_draft", connection.imobiliaria) &&
                            actions.can("read_ad_budget", connection.imobiliaria) &&
                            connection.id &&
                            connection.imobiliaria &&
                            (agency === "todas" || connection.imobiliaria === agency),
                        )
                        .map((connection) => (
                          <option key={connection.id} value={connection.id!}>
                            {connection.imobiliaria} ·{" "}
                            {connection.accountLabel || connection.accountId}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label="Nome da campanha" error={errors["name"]}>
                    <input
                      className={fieldClass}
                      name="name"
                      aria-invalid={Boolean(errors["name"])}
                      value={payload.name ?? ""}
                      maxLength={150}
                      onChange={(event) => update({ name: event.target.value })}
                    />
                  </Field>
                  {assets.isFetching ? (
                    <p role="status" className="text-sm">
                      Conferindo conta e identidade…
                    </p>
                  ) : assets.isError ? (
                    <p role="alert" className="text-sm text-red-800">
                      A conta ou Página não está acessível. Revise a conexão em Integrações.
                    </p>
                  ) : (
                    assets.data && (
                      <p className="text-sm text-foreground/75">
                        Página: <strong>{assets.data.page.name}</strong> · Conta{" "}
                        {assets.data.accountId} · {assets.data.currency} · {assets.data.timezone}
                      </p>
                    )
                  )}
                  <p className="text-xs text-foreground/70">
                    Acesso de leitura não comprova autorização de escrita. A Meta valida o envio e
                    pode rejeitá-lo por permissão ou combinação indisponível.
                  </p>
                </>
              )}
              {step === 1 && (
                <>
                  <Field label="Destino e objetivo">
                    <select
                      className={fieldClass}
                      value={payload.destination ?? "website"}
                      onChange={(event) =>
                        update({ destination: event.target.value as "website" | "lead_form" })
                      }
                    >
                      <option value="website">Site · Tráfego</option>
                      <option value="lead_form" disabled={!assets.data?.forms.length}>
                        Formulário instantâneo · Leads
                      </option>
                    </select>
                  </Field>
                  <Field label="Endereço HTTPS de destino" error={errors["websiteUrl"]}>
                    <input
                      type="url"
                      className={fieldClass}
                      name="websiteUrl"
                      aria-invalid={Boolean(errors["websiteUrl"])}
                      value={payload.websiteUrl ?? ""}
                      placeholder="https://"
                      onChange={(event) => update({ websiteUrl: event.target.value })}
                    />
                  </Field>
                  {payload.destination === "lead_form" && (
                    <Field label="Formulário autorizado e mapeado" error={errors["formId"]}>
                      <select
                        className={fieldClass}
                        name="formId"
                        aria-invalid={Boolean(errors["formId"])}
                        value={payload.formId ?? ""}
                        onChange={(event) => update({ formId: event.target.value })}
                      >
                        <option value="">Selecionar formulário</option>
                        {assets.data?.forms.map((form) => (
                          <option key={form.id} value={form.id}>
                            {form.name || form.id}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                  <div className="border-y py-3 text-sm">
                    <p>Público amplo · Brasil</p>
                    <p className="mt-1">Posicionamento · Feed do Facebook</p>
                    <p className="mt-2 text-xs text-foreground/70">
                      Esta versão oferece essas combinações. Segmentações e formatos adicionais
                      devem ser configurados no Gerenciador de Anúncios.
                    </p>
                  </div>
                  <label className="flex min-h-11 items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1 size-5 shrink-0"
                      name="housingConfirmed"
                      aria-invalid={Boolean(errors["housingConfirmed"])}
                      checked={payload.housingConfirmed === true}
                      onChange={(event) =>
                        update({ housingConfirmed: event.target.checked ? true : undefined })
                      }
                    />
                    Confirmo a categoria especial de anúncios imobiliários (Habitação) para esta
                    campanha no Brasil.
                  </label>
                </>
              )}
              {step === 2 && (
                <>
                  <p className="text-sm text-foreground/70">
                    Calendário no fuso da conta: <strong>{timeZone}</strong>. Orçamento em BRL.
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Tipo de orçamento">
                      <select
                        className={fieldClass}
                        value={payload.budget?.kind ?? "daily"}
                        onChange={(event) =>
                          update({
                            budget: {
                              ...payload.budget,
                              kind: event.target.value as "daily" | "lifetime",
                              currency: "BRL",
                            },
                          })
                        }
                      >
                        <option value="daily">Diário</option>
                        <option value="lifetime">Total do período</option>
                      </select>
                    </Field>
                    <Field label="Valor (R$)" error={errors["budget.amountMinor"]}>
                      <input
                        inputMode="decimal"
                        className={fieldClass}
                        placeholder="50,00"
                        name="budget.amountMinor"
                        aria-invalid={Boolean(errors["budget.amountMinor"])}
                        value={budgetText}
                        onChange={(event) => {
                          setBudgetText(event.target.value);
                          update({
                            budget: {
                              ...payload.budget,
                              amountMinor: brlAmountMinor(event.target.value),
                              currency: "BRL",
                            },
                          });
                        }}
                      />
                    </Field>
                    <Field label="Início" error={errors["budget.startTime"]}>
                      <input
                        type="datetime-local"
                        className={fieldClass}
                        name="budget.startTime"
                        aria-invalid={Boolean(errors["budget.startTime"])}
                        value={
                          dateDrafts.startTime ??
                          accountDateTimeInput(payload.budget?.startTime, timeZone)
                        }
                        onInput={(event) => changeDate("startTime", event.currentTarget.value)}
                        onChange={(event) => changeDate("startTime", event.currentTarget.value)}
                      />
                    </Field>
                    <Field
                      label={
                        payload.budget?.kind === "lifetime"
                          ? "Término obrigatório"
                          : "Término (opcional)"
                      }
                    >
                      <input
                        type="datetime-local"
                        className={fieldClass}
                        value={
                          dateDrafts.endTime ??
                          accountDateTimeInput(payload.budget?.endTime, timeZone)
                        }
                        onInput={(event) => changeDate("endTime", event.currentTarget.value)}
                        onChange={(event) => changeDate("endTime", event.currentTarget.value)}
                      />
                    </Field>
                  </div>
                  <p className="text-xs text-foreground/70">
                    O orçamento diário orienta o gasto por dia; o total define o orçamento do
                    calendário inteiro. A criação será pausada. Ativar a campanha é uma decisão
                    separada que poderá gerar despesa.
                  </p>
                </>
              )}
              {step === 3 && (
                <>
                  <Field label="Imagem aprovada da conta" error={errors["creative.imageHash"]}>
                    <select
                      className={fieldClass}
                      name="creative.imageHash"
                      aria-invalid={Boolean(errors["creative.imageHash"])}
                      value={payload.creative?.imageHash ?? ""}
                      onChange={(event) =>
                        update({ creative: { ...payload.creative, imageHash: event.target.value } })
                      }
                    >
                      <option value="">Escolher uma imagem</option>
                      {assets.data?.images.map((image) => (
                        <option key={image.hash} value={image.hash}>
                          {image.name || image.hash}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold text-primary focus-within:ring-2 focus-within:ring-primary">
                    <Upload className="size-4" />
                    {imageUpload.isPending
                      ? "Enviando imagem…"
                      : "Enviar imagem aprovada · JPEG/PNG até 5 MB"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png"
                      className="sr-only"
                      disabled={!connectionId || imageUpload.isPending}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) imageUpload.mutate(file);
                        event.target.value = "";
                      }}
                    />
                  </label>
                  {selectedImage?.url && (
                    <img
                      src={selectedImage.url}
                      alt="Imagem selecionada para o anúncio"
                      className="max-h-48 w-full rounded-xl object-contain"
                    />
                  )}
                  <Field label="Título" error={errors["creative.title"]}>
                    <input
                      className={fieldClass}
                      name="creative.title"
                      aria-invalid={Boolean(errors["creative.title"])}
                      value={payload.creative?.title ?? ""}
                      maxLength={100}
                      onChange={(event) =>
                        update({ creative: { ...payload.creative, title: event.target.value } })
                      }
                    />
                  </Field>
                  <Field label="Texto do anúncio" error={errors["creative.message"]}>
                    <textarea
                      className={`${fieldClass} min-h-28`}
                      name="creative.message"
                      aria-invalid={Boolean(errors["creative.message"])}
                      value={payload.creative?.message ?? ""}
                      maxLength={2000}
                      onChange={(event) =>
                        update({ creative: { ...payload.creative, message: event.target.value } })
                      }
                    />
                  </Field>
                  <Field label="Chamada para ação">
                    <select
                      className={fieldClass}
                      value={payload.creative?.callToAction ?? "LEARN_MORE"}
                      onChange={(event) =>
                        update({
                          creative: {
                            ...payload.creative,
                            callToAction: event.target.value as "LEARN_MORE" | "CONTACT_US",
                          },
                        })
                      }
                    >
                      <option value="LEARN_MORE">Saiba mais</option>
                      <option value="CONTACT_US">Fale conosco</option>
                    </select>
                  </Field>
                </>
              )}
              {step === 4 && (
                <>
                  <dl className="grid grid-cols-1 gap-4 border-y py-4 text-sm sm:grid-cols-2">
                    <Review label="Campanha" value={payload.name} />
                    <Review
                      label="Imobiliária / conta"
                      value={`${scopedAgency ?? "Não selecionada"} · ${assets.data?.accountId ?? draft?.account_id ?? "—"}`}
                    />
                    <Review label="Página" value={assets.data?.page.name ?? payload.pageId} />
                    <Review
                      label="Destino"
                      value={
                        payload.destination === "lead_form"
                          ? `Formulário ${payload.formId ?? "não selecionado"}`
                          : payload.websiteUrl
                      }
                    />
                    <Review
                      label="Orçamento"
                      value={
                        payload.budget?.amountMinor
                          ? `${(Number(payload.budget.amountMinor) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} · ${payload.budget.kind === "lifetime" ? "total" : "diário"}`
                          : undefined
                      }
                    />
                    <Review
                      label="Calendário da conta"
                      value={`${accountDateTimeInput(payload.budget?.startTime, timeZone) || "Início pendente"} → ${accountDateTimeInput(payload.budget?.endTime, timeZone) || "Sem término"} · ${timeZone}`}
                    />
                    <Review label="Criação" value="Campanha, conjunto e anúncio pausados" />
                    <Review
                      label="Revisão da Meta"
                      value="A aprovação e a entrega serão verificadas separadamente"
                    />
                  </dl>
                  {selectedImage?.url && (
                    <img
                      src={selectedImage.url}
                      alt="Conteúdo selecionado para revisão"
                      className="max-h-48 w-full object-contain"
                    />
                  )}
                  <p className="font-semibold">{payload.creative?.title}</p>
                  <p className="whitespace-pre-wrap text-sm">{payload.creative?.message}</p>
                  {!locked && (
                    <label className="flex min-h-11 items-start gap-3 text-sm">
                      <input
                        className="mt-1 size-5 shrink-0"
                        type="checkbox"
                        checked={confirmed}
                        onChange={(event) => setConfirmed(event.target.checked)}
                      />
                      Revisei identidade, destino, orçamento e calendário. Autorizo criar esta
                      revisão pausada na Meta.
                    </label>
                  )}
                </>
              )}
            </fieldset>
            {currentDraft?.commands?.map((command) => (
              <section key={command.id} className="mt-5 border-t pt-4">
                <h4 className="text-sm font-semibold">Comando · {command.state}</h4>
                <ul className="mt-2 space-y-2 text-xs">
                  {Object.entries(command.steps).map(([name, result]) => (
                    <li key={name} className="break-all">
                      {name}: {result.state}
                      {result.id ? ` · ID ${result.id}` : ""}
                    </li>
                  ))}
                </ul>
                {["uncertain", "partial", "failed", "incerto", "parcial", "falhou"].includes(
                  command.state,
                ) && (
                  <Button
                    variant="outline"
                    className="mt-3 min-h-11"
                    disabled={recovery.isPending}
                    onClick={() => recovery.mutate(command.id)}
                  >
                    Conferir resultado na Meta
                  </Button>
                )}
                {actions.can(
                  command.kind === "create_paused"
                    ? "send_paused"
                    : command.kind === "change_budget"
                      ? "change_budget"
                      : "set_delivery",
                  currentDraft.imobiliaria,
                ) &&
                  command.draft_revision === currentDraft.revision &&
                  ["failed", "partial"].includes(command.state) &&
                  Object.values(command.steps).every(
                    (result) => result?.state !== "uncertain" && result?.state !== "sending",
                  ) && (
                    <Button
                      variant="outline"
                      className="mt-3 min-h-11"
                      disabled={resume.isPending}
                      onClick={() => resume.mutate(command.id)}
                    >
                      {command.kind === "create_paused"
                        ? "Retomar etapas pendentes · pausado"
                        : command.kind === "change_budget"
                          ? "Retomar alteração de orçamento confirmada"
                          : command.payload.status === "ACTIVE"
                            ? "Retomar ativação confirmada"
                            : "Retomar pausa confirmada"}
                    </Button>
                  )}
              </section>
            ))}
            {currentDraft &&
              live.data?.hierarchy &&
              ["pausado_na_meta", "ativo"].includes(currentDraft.status) && (
                <DraftManagement
                  draft={currentDraft}
                  range={range}
                  hierarchy={live.data.hierarchy}
                  onRefresh={refresh}
                  onDuplicate={() => {
                    setDraft(null);
                    setPayload({ ...payload, name: `${payload.name ?? "Anúncio"} · cópia` });
                    setDirty(true);
                    setStep(0);
                    setConfirmed(false);
                  }}
                />
              )}
            <footer className="mt-5 flex shrink-0 flex-wrap gap-2 border-t pt-5">
              <Button
                variant="ghost"
                className="min-h-11"
                disabled={step === 0 || working}
                onClick={() => setStep(step - 1)}
              >
                <ArrowLeft className="size-4" />
                Voltar
              </Button>
              {!locked && (
                <Button
                  variant="outline"
                  className="min-h-11"
                  disabled={working || !connectionId || !actions.can("create_draft", scopedAgency)}
                  onClick={() => void saveAnd()}
                >
                  <Save className="size-4" />
                  {working ? "Salvando…" : "Salvar rascunho"}
                </Button>
              )}
              {step < 4 ? (
                <Button
                  className="min-h-11 sm:ml-auto"
                  disabled={working || !connectionId || !actions.can("create_draft", scopedAgency)}
                  onClick={() => (locked ? setStep(step + 1) : void saveAnd(step + 1))}
                >
                  Continuar
                  <ArrowRight className="size-4" />
                </Button>
              ) : (
                !locked && (
                  <Button
                    className="min-h-11 sm:ml-auto"
                    disabled={
                      !confirmed ||
                      working ||
                      !assets.data ||
                      !actions.can("send_paused", scopedAgency)
                    }
                    onClick={() => void sendPaused()}
                  >
                    <Send className="size-4" />
                    {actions.can("send_paused", scopedAgency)
                      ? "Criar pausado na Meta"
                      : "Envio exige autorização operacional"}
                  </Button>
                )
              )}
            </footer>
            <p role="status" className="mt-3 text-xs text-foreground/70">
              {working
                ? "Aguardando confirmação do servidor…"
                : dirty
                  ? "Há alterações locais. Salve o rascunho antes de sair."
                  : draft
                    ? `Revisão ${draft.revision} salva.`
                    : "Selecione uma conexão para salvar este rascunho."}
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
function Field({ label, children, error }: { label: string; children: ReactNode; error?: string }) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      {children}
      {error && <span className="mt-1 block text-xs font-normal text-red-800">{error}</span>}
    </label>
  );
}
function Review({ label, value }: { label: string; value?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-foreground/70">{label}</dt>
      <dd className="mt-1 break-words font-semibold">{value || "Pendente"}</dd>
    </div>
  );
}

function DraftManagement({
  draft,
  hierarchy,
  onRefresh,
  onDuplicate,
  range,
}: {
  range: { since: string; until: string };
  draft: MetaAdDraft;
  hierarchy: Array<{
    level: string;
    external_id: string;
    name: string;
    configured_status: string | null;
    effective_status: string | null;
    revision_hash: string;
    read_at: string;
  }>;
  onRefresh: () => void;
  onDuplicate: () => void;
}) {
  const actions = useMarketingActions();
  const refresh = useServerFn(refreshMetaAdDraft),
    delivery = useServerFn(changeMetaAdDelivery),
    budget = useServerFn(changeMetaAdBudget);
  const importCampaign = useServerFn(importDiscoveredMetaCampaign);
  const qc = useQueryClient();
  const importMutation = useMutation({
    mutationFn: async () => {
      const externalId = hierarchy.find((item) => item.level === "campaign")?.external_id;
      if (!externalId) throw new Error("Campanha não confirmada");
      return importCampaign({
        data: {
          connectionId: draft.connection_id,
          accountId: draft.account_id,
          campaignId: externalId,
          imobiliaria: draft.imobiliaria,
          range,
        },
      });
    },
    onSuccess: (result) => {
      if (result.ok) {
        void qc.invalidateQueries({ queryKey: ["marketing", "campaigns"] });
        toast.success("Campanha vinculada à mensuração. A coleta será acompanhada pela fila.");
      } else toast.error(result.message);
    },
    onError: () =>
      toast.error(
        "Não foi possível vincular a campanha à mensuração. Use a importação em Campanhas.",
      ),
  });
  const [action, setAction] = useState<"PAUSED" | "ACTIVE" | "BUDGET" | null>(null),
    [amount, setAmount] = useState("");
  const intent = useRef<{ key: string; id: string } | null>(null);
  const read = useMutation({
    mutationFn: () => refresh({ data: { id: draft.id } }),
    onSuccess: onRefresh,
    onError: () => toast.error("Não foi possível conferir o estado na Meta."),
  });
  const command = useMutation({
    mutationFn: async () => {
      if (!action) throw new Error("Ação ausente");
      const minor = brlAmountMinor(amount);
      const key = `${draft.id}:${draft.revision}:${action}:${minor ?? ""}`;
      if (intent.current?.key !== key) intent.current = { key, id: crypto.randomUUID() };
      const common = {
        draftId: draft.id,
        expectedRevision: draft.revision,
        intentId: intent.current.id,
        expectedRevisions: Object.fromEntries(
          hierarchy.map((item) => [item.level, item.revision_hash]),
        ),
      };
      return action === "BUDGET"
        ? budget({ data: { ...common, amountMinor: minor!, confirmation: "CONFIRM_BUDGET" } })
        : delivery({ data: { ...common, targetStatus: action, confirmation: "CONFIRM_DELIVERY" } });
    },
    onSuccess: (result) => {
      onRefresh();
      setAction(null);
      if (result.state === "failed") intent.current = null;
      if (result.state === "done") {
        intent.current = null;
        toast.success("Alteração confirmada pela Meta.");
      } else toast("Resultado ainda não confirmado. Confira o comando antes de repetir.");
    },
    onError: () => {
      onRefresh();
      setAction(null);
      toast.error("Resultado não confirmado. Consulte o histórico antes de repetir o comando.");
    },
  });
  return (
    <section className="my-5 space-y-3 border-t pt-5">
      <h3 className="font-display text-lg font-semibold">Gerenciar na Meta</h3>
      <div className="space-y-2">
        {hierarchy.map((item) => (
          <div key={item.external_id} className="border-b pb-2 text-xs">
            <p className="break-words font-semibold">
              {item.level} · {item.name}
            </p>
            <p className="mt-1 break-all text-foreground/70">
              ID {item.external_id} · Configurado: {item.configured_status || "—"} ·
              Entrega/revisão: {item.effective_status || "não informada"}
            </p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          className="min-h-11"
          disabled={read.isPending}
          onClick={() => read.mutate()}
        >
          Conferir status na Meta
        </Button>
        <Button
          variant="outline"
          className="min-h-11"
          disabled={
            command.isPending ||
            !hierarchy.length ||
            !actions.can("set_delivery", draft.imobiliaria)
          }
          onClick={() => setAction("PAUSED")}
        >
          Pausar
        </Button>
        <Button
          variant="outline"
          className="min-h-11"
          disabled={
            command.isPending ||
            !hierarchy.length ||
            !actions.can("set_delivery", draft.imobiliaria)
          }
          onClick={() => setAction("ACTIVE")}
        >
          Reativar
        </Button>
        <Button
          variant="outline"
          className="min-h-11"
          disabled={importMutation.isPending}
          onClick={() => importMutation.mutate()}
        >
          Acompanhar resultados
        </Button>
        <Button
          variant="ghost"
          className="min-h-11"
          disabled={!actions.can("create_draft", draft.imobiliaria)}
          onClick={onDuplicate}
        >
          Duplicar para rascunho
        </Button>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Field label="Novo orçamento (R$)">
          <input
            className={fieldClass}
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </Field>
        <Button
          variant="outline"
          className="min-h-11"
          disabled={
            !brlAmountMinor(amount) ||
            command.isPending ||
            !hierarchy.length ||
            !actions.can("change_budget", draft.imobiliaria)
          }
          onClick={() => setAction("BUDGET")}
        >
          Revisar alteração
        </Button>
      </div>
      <AlertDialog
        open={action !== null}
        onOpenChange={(open) => {
          if (!open && !command.isPending) setAction(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>
            {action === "ACTIVE"
              ? "Confirmar reativação e possível despesa"
              : action === "PAUSED"
                ? "Confirmar pausa na Meta"
                : "Confirmar alteração de orçamento"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Conta {draft.account_id} · {draft.imobiliaria} · revisão {draft.revision}.{" "}
            {action === "BUDGET"
              ? `Novo orçamento: R$ ${amount} (${draft.payload.budget?.kind === "lifetime" ? "total" : "diário"}).`
              : `Orçamento: ${draft.payload.budget?.amountMinor ? (Number(draft.payload.budget.amountMinor) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "não informado"} (${draft.payload.budget?.kind === "lifetime" ? "total" : "diário"}).`}{" "}
            {action === "ACTIVE"
              ? "A ativação poderá iniciar a entrega e gerar despesa após a aprovação da Meta."
              : "O estado será conferido antes e depois da operação. Alterações no Ads Manager podem impedir este comando."}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={command.isPending}>Cancelar</AlertDialogCancel>
            <Button disabled={command.isPending} onClick={() => command.mutate()}>
              {command.isPending ? "Aguardando confirmação…" : "Confirmar na Meta"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
