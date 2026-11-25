import { friendlyWorkflowError, type WorkflowAction } from "@/lib/rentals/workflow-errors";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Check, CircleAlert, Download, FileText, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useRentalDocuments } from "@/hooks/useRentalDocuments";
import { supabase } from "@/integrations/supabase/client";
import { CONTRACT_TEMPLATES } from "@/lib/rentals/contract-templates";
import {
  CONTRACT_GROUPS,
  GUARANTEE_LABEL,
  contractWorkflowReview,
  workspaceBaseIssues,
  type RentalTemplateOptions,
  type RentalWorkspaceInput,
} from "@/lib/rentals/contract-workflow";
import {
  contractVersionKey,
  loadContractLetterhead,
  sha256Hex,
  type ContractLetterhead,
} from "@/lib/rentals/contract-letterhead";
import { prepareRentalContractPreview } from "@/lib/rentals/rentals.functions";

const WORD_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const BRAND_LABEL = { cordial: "Cordial Imóveis", morar: "Morar Imóveis" } as const;
type Preview = {
  text: string;
  revision: string;
  key: string;
  fileName: string;
  model: string;
  letterhead: ContractLetterhead;
};

export function focusRentalField(scope: HTMLElement | null, field: string) {
  const target = scope?.querySelector<HTMLElement>(`[data-rental-field="${CSS.escape(field)}"]`);
  if (!target) return false;
  const details = target.closest("details");
  if (details) details.open = true;
  target.scrollIntoView({ block: "center" });
  const control = target.matches("input,select,textarea,button")
    ? target
    : (target.querySelector<HTMLElement>("input,select,textarea,button") ?? target);
  control.focus({ preventScroll: true });
  return true;
}

type Party = NonNullable<RentalTemplateOptions["owner"]>;
const PARTY_FIELDS: { key: keyof Party; label: string }[] = [
  { key: "nationality", label: "Nacionalidade" },
  { key: "maritalStatus", label: "Estado civil" },
  { key: "rg", label: "RG" },
  { key: "profession", label: "Profissão" },
  { key: "address", label: "Endereço" },
];
function PartyFields({
  label,
  prefix,
  value,
  onChange,
  coreOnly = false,
}: {
  label: string;
  prefix: string;
  value?: Party;
  onChange: (value: Party) => void;
  coreOnly?: boolean;
}) {
  return (
    <fieldset className="grid gap-2 rounded-xl border border-border/70 p-3 sm:grid-cols-2">
      <legend className="px-1 text-xs font-semibold">{label}</legend>
      {(coreOnly ? PARTY_FIELDS.slice(0, 3) : PARTY_FIELDS).map(({ key, label: fieldLabel }) => (
        <label className="space-y-1 text-xs font-medium" key={key}>
          <span>{fieldLabel}</span>
          <Input
            data-rental-field={`extra-${prefix}-${key}`}
            value={value?.[key] ?? ""}
            maxLength={240}
            onChange={(event) => onChange({ ...value, [key]: event.target.value })}
          />
        </label>
      ))}
    </fieldset>
  );
}

function TemplateFields({
  input,
  onChange,
}: {
  input: RentalWorkspaceInput;
  onChange: (next: RentalTemplateOptions) => void;
}) {
  const { template, guarantees, brand, tenants } = input;
  const usesGuarantee = guarantees[0]?.tipo;
  const selectedBrand = brand === "ambas" ? template.modelBrand : brand;
  const model =
    selectedBrand && usesGuarantee ? CONTRACT_TEMPLATES[`${selectedBrand}-${usesGuarantee}`] : "";
  const updateParty = (group: "tenants" | "guarantors", index: number, party: Party) => {
    const members = group === "tenants" ? tenants : guarantees;
    onChange({
      ...template,
      [group]: members.map((_, i) => (i === index ? party : (template[group]?.[i] ?? {}))),
    });
  };
  return (
    <details className="rounded-xl border border-border/70 bg-background">
      <summary className="min-h-11 cursor-pointer px-3 py-2.5 text-sm font-semibold focus-visible:outline-primary">
        Dados do modelo
      </summary>
      <div className="space-y-4 border-t p-3">
        <div className="grid gap-3 sm:grid-cols-2">
          {brand === "ambas" && (
            <label className="space-y-1 text-xs font-medium">
              <span>Imobiliária do contrato</span>
              <select
                data-rental-field="template-brand"
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={template.modelBrand ?? ""}
                onChange={(e) =>
                  onChange({
                    ...template,
                    modelBrand:
                      (e.target.value as RentalTemplateOptions["modelBrand"]) || undefined,
                  })
                }
              >
                <option value="">Selecione</option>
                <option value="cordial">Cordial Imóveis</option>
                <option value="morar">Morar Imóveis</option>
              </select>
            </label>
          )}
          <label className="space-y-1 text-xs font-medium">
            <span>Data prevista para assinatura</span>
            <Input
              data-rental-field="template-date"
              type="date"
              value={template.signedOn ?? ""}
              onChange={(e) => onChange({ ...template, signedOn: e.target.value })}
            />
          </label>
          {model.includes("{{matricula}}") && (
            <label className="space-y-1 text-xs font-medium">
              <span>Matrícula do imóvel</span>
              <Input
                data-rental-field="template-registration"
                value={template.registration ?? ""}
                onChange={(e) => onChange({ ...template, registration: e.target.value })}
              />
            </label>
          )}
        </div>
        <PartyFields
          label="Locador"
          prefix="owner"
          value={template.owner}
          onChange={(owner) => onChange({ ...template, owner })}
        />
        {tenants.map((_, i) => (
          <PartyFields
            key={i}
            label={`Locatário ${i + 1}`}
            prefix={`tenant-${i}`}
            value={template.tenants?.[i]}
            onChange={(party) => updateParty("tenants", i, party)}
            coreOnly
          />
        ))}
        {guarantees.map(
          (guarantee, i) =>
            guarantee.tipo === "fiador" && (
              <PartyFields
                key={i}
                label={`Fiador ${i + 1}`}
                prefix={`guarantor-${i}`}
                value={template.guarantors?.[i]}
                onChange={(party) => updateParty("guarantors", i, party)}
              />
            ),
        )}
        {model.includes("{{bens_fiadores}}") && (
          <label className="block space-y-1 text-xs font-medium">
            <span>Bens oferecidos pelos fiadores</span>
            <Textarea
              data-rental-field="template-assets"
              rows={3}
              value={template.guarantorAssets ?? ""}
              onChange={(e) => onChange({ ...template, guarantorAssets: e.target.value })}
            />
          </label>
        )}
        {usesGuarantee === "seguro_fianca" && (
          <label className="block space-y-1 text-xs font-medium">
            <span>Parcelas do seguro</span>
            <Input
              type="number"
              min={1}
              max={120}
              value={template.insuranceInstallments ?? 12}
              onChange={(e) =>
                onChange({
                  ...template,
                  insuranceInstallments: e.target.valueAsNumber || undefined,
                })
              }
            />
          </label>
        )}
      </div>
    </details>
  );
}

export function RentalContractWorkflow({
  id,
  input,
  onTemplateChange,
  onFocusField,
  persistDraft,
  beforePreview,
  onConfirmed,
  changesPending = false,
}: {
  id: string;
  input: RentalWorkspaceInput;
  onTemplateChange: (next: RentalTemplateOptions) => void;
  onFocusField: (field: string) => void;
  persistDraft?: () => Promise<number>;
  beforePreview?: () => Promise<unknown>;
  changesPending?: boolean;
  onConfirmed?: () => void | Promise<void>;
}) {
  const container = useRef<HTMLElement>(null);
  const external = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  const draft = Boolean(persistDraft);
  const documents = useRentalDocuments(id, draft);
  const prepare = useServerFn(prepareRentalContractPreview);
  const queryClient = useQueryClient();
  const insurers = useQuery({
    queryKey: ["rental-insurers", "contract"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rental_insurers")
        .select("id,nome,brands,clause_template,active");
      if (error) throw error;
      return data.map((r) => ({
        id: r.id,
        nome: r.nome,
        brands: r.brands,
        clauseTemplate: r.clause_template,
        active: r.active,
      }));
    },
  });
  const review = contractWorkflowReview(input, CONTRACT_TEMPLATES, insurers.data ?? []);
  const letterhead = useQuery({
    queryKey: ["rental-letterhead", review.brand],
    queryFn: () => loadContractLetterhead(review.brand!),
    enabled: !!review.brand && (review.guarantee !== "seguro_fianca" || !insurers.isError),
    staleTime: Infinity,
    retry: false,
  });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmedInput, setConfirmedInput] = useState<string | null>(null);
  const inputSnapshot = JSON.stringify(input);
  const [externalCandidate, setExternalCandidate] = useState<File | null>(null);

  const contractDocs = documents.documents.filter((doc) => doc.category === "contrato_aluguel");
  const current = !changesPending && contractDocs.some((doc) => doc.reviewCurrent);
  const requiresNewReview = !current && contractDocs.some((doc) => doc.reviewedAt);
  const externalCurrent = contractDocs.find(
    (doc) => doc.origin === "externo" && !doc.reviewCurrent,
  );
  const pending =
    (review.guarantee === "seguro_fianca" && insurers.isError
      ? "Não foi possível carregar as seguradoras"
      : review.issues[0]?.label) ??
    (letterhead.isError
      ? "Logo ou endereço institucional"
      : !letterhead.data
        ? "Aguardando timbre da imobiliária"
        : null);
  const focus = (field: string) => {
    if (!focusRentalField(container.current, field)) onFocusField(field);
  };

  async function run(action: () => Promise<void>, kind: WorkflowAction = "conferir") {
    if (lock.current) return;
    lock.current = true;
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (cause) {
      setError(friendlyWorkflowError(cause, kind));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  function showPreview() {
    void run(async () => {
      if (!letterhead.data || review.issues.length) return;
      await beforePreview?.();
      const revision = await persistDraft?.();
      const { data: identity } = letterhead;
      const result = await prepare({ data: { id, draft, revision, template: input.template } });
      if (!result.text || !result.brand || !result.guarantee || result.brand !== review.brand)
        throw new Error("O cadastro mudou. Revise os dados e gere novamente.");
      let key = await contractVersionKey(result.text, identity, result.versionContext);
      const { data: latestDocs, error: docsError } = await documents.refreshDocuments();
      if (docsError)
        throw new Error("Não foi possível conferir as versões salvas. Tente novamente.");
      const previous = latestDocs?.find((doc) => doc.filePath.includes(`/${key}-`));
      if (previous && previous.sourceRevision !== result.revision) {
        key = await contractVersionKey(
          result.text,
          identity,
          `${result.versionContext}|${result.revision}`,
        );
      }
      setPreview({
        text: result.text,
        revision: result.revision,
        key,
        letterhead: identity,
        model: `${GUARANTEE_LABEL[result.guarantee]}${result.purpose === "geral" ? "" : ` · ${result.purpose}`}`,
        fileName: `Contrato - ${BRAND_LABEL[result.brand]} - ${GUARANTEE_LABEL[result.guarantee]}.docx`,
      });
      if (!draft) {
        void queryClient.invalidateQueries({ queryKey: ["rental-entry-inspection", id] });
        void queryClient.invalidateQueries({ queryKey: ["rentals", "documents", id] });
      }
    }, "gerar");
  }

  async function complete(documentId: string, revision?: string) {
    const saved =
      revision === undefined
        ? await documents.setDocumentReviewed(documentId, true)
        : await documents.confirmWorkflowFile({ documentId, revision });
    if (saved.id !== documentId || saved.contractId !== id || !saved.reviewedAt) {
      throw new Error("A conferência ainda está pendente. Tente novamente.");
    }
    setConfirmedInput(inputSnapshot);
    setPreview(null);
    await onConfirmed?.();
  }

  function attach(file: File) {
    setExternalCandidate(file);
    void run(async () => {
      const revision = await persistDraft?.();
      const key = `ext-${await sha256Hex(await file.arrayBuffer())}`;
      await documents.uploadWorkflowFile({
        file,
        key,
        revision: String(revision ?? ""),
        origin: "externo",
        category: "contrato_aluguel",
      });
      setExternalCandidate(null);
    }, "anexar");
  }

  return (
    <section
      ref={container}
      className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5"
      aria-label="Checklist do contrato"
    >
      <header className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold tracking-tight">Checklist do contrato</h3>
          {review.brand && (
            <p className="text-sm text-muted-foreground">{BRAND_LABEL[review.brand]}</p>
          )}
        </div>
        <span
          role="status"
          className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary"
        >
          {current || confirmedInput === inputSnapshot
            ? "Contrato conferido"
            : requiresNewReview
              ? "Nova conferência necessária"
              : review.issues.length
                ? `${review.issues.length} ${review.issues.length === 1 ? "pendência" : "pendências"}`
                : "Checklist concluído"}
        </span>
      </header>

      <div className="grid gap-2 sm:grid-cols-2">
        {CONTRACT_GROUPS.map((group) => {
          const issues = review.issues.filter((issue) => issue.group === group);
          return (
            <details key={group} className="min-w-0 rounded-xl border bg-background px-3 py-2">
              <summary className="cursor-pointer rounded-sm text-sm focus-visible:outline-primary">
                <span className="inline-flex items-center gap-2">
                  <strong>{group}</strong>
                  {issues.length ? (
                    <span className="text-muted-foreground">{issues.length}</span>
                  ) : (
                    <Check className="size-4 text-primary" aria-label="Completo" />
                  )}
                </span>
              </summary>
              {issues.length ? (
                <ul className="mt-1 divide-y divide-border/70">
                  {issues.map((issue) => (
                    <li key={issue.field}>
                      <button
                        type="button"
                        className="flex min-h-9 w-full items-center justify-between gap-2 rounded-sm py-1.5 text-left text-xs font-medium text-primary hover:underline focus-visible:outline-primary"
                        onClick={() => focus(issue.field)}
                      >
                        {issue.label}
                        <ArrowRight className="size-3.5 shrink-0" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="pt-1 text-xs text-muted-foreground">Completo</p>
              )}
            </details>
          );
        })}
      </div>

      <div className="space-y-1.5">
        <Button
          type="button"
          className="min-h-11 w-full"
          onClick={showPreview}
          disabled={busy || !!pending}
          aria-describedby={pending ? `pending-${id}` : undefined}
        >
          <FileText aria-hidden /> {busy && !preview ? "Salvando…" : "Gerar contrato"}
        </Button>
        {pending && (
          <p className="text-xs text-muted-foreground" id={`pending-${id}`}>
            {pending}
          </p>
        )}
        {insurers.isError && review.guarantee === "seguro_fianca" && (
          <Button type="button" variant="ghost" size="sm" onClick={() => insurers.refetch()}>
            Recarregar seguradoras
          </Button>
        )}
        {letterhead.isError && (
          <Button type="button" variant="ghost" size="sm" onClick={() => letterhead.refetch()}>
            Verificar timbre novamente
          </Button>
        )}
      </div>

      <TemplateFields input={input} onChange={onTemplateChange} />
      <section className="space-y-2 border-t pt-3" aria-label="Contratos registrados">
        <input
          ref={external}
          type="file"
          hidden
          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) attach(file);
          }}
        />
        <Button
          type="button"
          variant="ghost"
          className="min-h-11 px-2 text-primary"
          disabled={busy}
          onClick={() => external.current?.click()}
        >
          <Paperclip /> Anexar contrato existente
        </Button>
        {externalCandidate && !busy && (
          <Button type="button" variant="outline" onClick={() => attach(externalCandidate)}>
            Tentar envio novamente
          </Button>
        )}
        {documents.isError && (
          <p role="alert" className="text-xs text-destructive">
            Não foi possível carregar os contratos registrados.
          </p>
        )}
        {contractDocs.length > 0 && (
          <ul className="space-y-2">
            {contractDocs.map((doc) => (
              <li
                key={doc.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-muted/40 px-3 py-2 text-xs"
              >
                <span className="min-w-0 flex-1 break-all font-medium">
                  {doc.url || doc.driveUrl ? (
                    <a
                      className="text-primary underline underline-offset-2"
                      href={doc.url ?? doc.driveUrl ?? undefined}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {doc.fileName}
                    </a>
                  ) : (
                    doc.fileName
                  )}
                </span>
                <span>{doc.origin === "gerado" ? "Gerado" : "Anexado"}</span>
                {doc.reviewedAt && (
                  <span>{doc.reviewCurrent ? "Conferido" : "Conferido em revisão anterior"}</span>
                )}
                {doc.signedAt && <span>Assinado</span>}
                {doc.id === externalCurrent?.id && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        if (draft) {
                          const issue = workspaceBaseIssues(input)[0];
                          if (issue) {
                            focus(issue.field);
                            throw new Error(issue.label);
                          }
                          const revision = await persistDraft?.();
                          await complete(doc.id, String(revision));
                        } else await complete(doc.id);
                      }, "conferir")
                    }
                  >
                    Marcar como conferido
                  </Button>
                )}
                {doc.origin === "gerado" && !doc.reviewedAt && (
                  <span className="text-primary">Conferência pendente</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}
      {preview && (
        <RentalContractGenerator
          preview={preview}
          error={error}
          busy={busy}
          registeredId={contractDocs.find((doc) => doc.filePath.includes(`/${preview.key}-`))?.id}
          onClose={() => {
            if (!busy) {
              setPreview(null);
              setError(null);
            }
          }}
          onConfirm={(documentId, getFile, rememberDocument) =>
            void run(async () => {
              let registered = documentId;
              if (!registered) {
                const result = await documents.uploadWorkflowFile({
                  file: await getFile(),
                  key: preview.key,
                  revision: preview.revision,
                  origin: "gerado",
                  category: "contrato_aluguel",
                });
                if (!result.id) throw new Error("O Word ainda não foi registrado.");
                registered = result.id;
                rememberDocument(result.id);
              }
              await complete(registered, preview.revision);
            }, "conferir")
          }
        />
      )}
    </section>
  );
}

export function RentalContractGenerator({
  preview,
  error,
  busy,
  registeredId,
  onClose,
  onConfirm,
}: {
  preview: Preview;
  error: string | null;
  busy: boolean;
  registeredId?: string;
  onClose: () => void;
  onConfirm: (
    documentId: string | undefined,
    getFile: () => Promise<File>,
    rememberDocument: (documentId: string) => void,
  ) => void;
}) {
  const file = useRef<Promise<File> | null>(null);
  const [savedId, remember] = useState(registeredId);
  const [downloadError, setDownloadError] = useState(false);
  const documentId = savedId ?? registeredId;
  function getFile() {
    file.current ??= import("@/lib/rentals/contract-docx")
      .then(async ({ contractTextToDocx }) => {
        const blob = await contractTextToDocx(preview.text, preview.letterhead);
        return new File([blob], preview.fileName, { type: WORD_MIME });
      })
      .catch((cause) => {
        file.current = null;
        throw cause;
      });
    return file.current;
  }
  async function download() {
    try {
      setDownloadError(false);
      const url = URL.createObjectURL(await getFile());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = preview.fileName;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch {
      setDownloadError(true);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex h-dvh max-h-dvh w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-[90dvh] sm:max-w-4xl sm:rounded-2xl">
        <header className="shrink-0 border-b px-5 py-4 pr-12">
          <DialogTitle>Prévia do contrato</DialogTitle>
          <DialogDescription>
            {preview.letterhead.name} · {preview.model} · Checklist concluído
          </DialogDescription>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto bg-muted/50 p-3 sm:p-6">
          <article className="mx-auto max-w-3xl rounded-lg border bg-card px-5 py-6 shadow-sm sm:px-12">
            <img
              src={preview.letterhead.logo}
              alt={preview.letterhead.name}
              className="mx-auto h-11 w-auto object-contain"
            />
            <div
              className="my-5 whitespace-pre-wrap break-words text-sm leading-relaxed"
              data-testid="contract-preview"
            >
              {preview.text}
            </div>
            <p className="border-t pt-3 text-center text-xs text-muted-foreground">
              {preview.letterhead.address}
            </p>
          </article>
        </div>
        <footer className="shrink-0 space-y-2 border-t bg-background px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
          {(error || downloadError) && (
            <p role="alert" className="text-sm text-destructive">
              {downloadError
                ? "Não foi possível baixar o Word. Tente novamente."
                : `${documentId ? "Word registrado. Conferência pendente. " : ""}${error}`}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-11 flex-1 sm:flex-none"
              onClick={() => void download()}
            >
              <Download /> Baixar Word
            </Button>
            <Button
              type="button"
              className="min-h-11 flex-1 sm:flex-none"
              disabled={busy}
              onClick={() => onConfirm(documentId, getFile, remember)}
            >
              {busy
                ? "Salvando…"
                : documentId
                  ? "Confirmar conferência"
                  : "Confirmar e salvar contrato"}
            </Button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
