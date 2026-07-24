import { useMemo, useRef, useState } from "react";
import {
  Cloud,
  CloudOff,
  ExternalLink,
  FileText,
  FolderSync,
  HardDrive,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { useRentalDocuments } from "@/hooks/useRentalDocuments";
import { cn } from "@/lib/utils";
import {
  RENTAL_DOCUMENT_CATEGORIES,
  type RentalContractDocument,
  type RentalDocumentCategory,
} from "@/types/rental";

function formatSize(bytes?: number | null) {
  if (!bytes) return "Tamanho não informado";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,application/pdf,image/*,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function StorageBadge({
  hasCloud,
  driveStatus,
}: {
  hasCloud: boolean;
  driveStatus: string | null | undefined;
}) {
  const isSynced = driveStatus === "synced";
  const isFailed = driveStatus === "failed";
  const isSyncing = driveStatus === "syncing" || driveStatus === "pending";

  if (isSynced && hasCloud) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
        <FolderSync className="size-3" />
        Nuvem + Drive
      </span>
    );
  }
  if (isSynced) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-bold text-sky-800">
        <HardDrive className="size-3" />
        Google Drive
      </span>
    );
  }
  if (isFailed) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-800">
        <CloudOff className="size-3" />
        Falha no Drive
      </span>
    );
  }
  if (isSyncing) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[10px] font-bold text-foreground/65">
        <Loader2 className="size-3 animate-spin motion-reduce:animate-none" />
        Sincronizando
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[10px] font-bold text-foreground/65">
      <Cloud className="size-3" />
      Nuvem
    </span>
  );
}

function FileActions({
  document,
  driveEnabled,
  isSyncing,
  isDeleting,
  onSync,
  onTrashDrive,
  onDelete,
}: {
  document: RentalContractDocument;
  driveEnabled: boolean;
  isSyncing: boolean;
  isDeleting: boolean;
  onSync: () => void;
  onTrashDrive: () => void;
  onDelete: () => void;
}) {
  const canSync = driveEnabled && !document.driveFileId && !isSyncing;
  const buttonClass =
    "grid size-10 shrink-0 place-items-center rounded-xl transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:pointer-events-none disabled:opacity-45 motion-reduce:transition-none";

  return (
    <div className="col-span-2 flex items-center justify-end gap-1 border-t border-foreground/[0.06] pt-2 sm:col-span-1 sm:border-t-0 sm:pt-0">
      {document.driveUrl && (
        <a
          href={document.driveUrl}
          target="_blank"
          rel="noreferrer"
          className={cn(buttonClass, "text-primary hover:bg-primary/8")}
          aria-label={`Abrir ${document.fileName} no Google Drive`}
          title="Abrir no Google Drive"
        >
          <ExternalLink className="size-4" />
        </a>
      )}
      {canSync && (
        <button
          type="button"
          onClick={onSync}
          disabled={isSyncing}
          className={cn(buttonClass, "text-primary hover:bg-primary/8")}
          aria-label={`Enviar ${document.fileName} ao Google Drive`}
          title="Enviar ao Google Drive"
        >
          <HardDrive className="size-4" />
        </button>
      )}
      {document.driveFileId && (
        <button
          type="button"
          onClick={onTrashDrive}
          disabled={isSyncing}
          className={cn(buttonClass, "text-amber-800 hover:bg-amber-500/10")}
          aria-label={`Remover cópia de ${document.fileName} do Google Drive`}
          title="Remover apenas do Google Drive"
        >
          <CloudOff className="size-4" />
        </button>
      )}
      <button
        type="button"
        onClick={onDelete}
        disabled={isDeleting}
        className={cn(buttonClass, "text-rose-700 hover:bg-rose-500/[0.08]")}
        aria-label={`Excluir documento ${document.fileName}`}
        title="Excluir documento"
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}

export function RentalDocuments({
  contractId,
  sectionId,
}: {
  contractId: string;
  sectionId: string;
}) {
  const {
    documents,
    isLoading,
    isError,
    error: documentsError,
    uploadFile,
    deleteFile,
    isUploading,
    isDeleting,
    driveFolder,
    enableDriveSync,
    disableDriveSync,
    syncDocumentToDrive,
    syncAllToDrive,
    trashDriveCopy,
    isEnablingSync,
    isDisablingSync,
    isSyncing,
    driveError,
  } = useRentalDocuments(contractId);
  const [localError, setLocalError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<RentalDocumentCategory | null>(null);
  const inputsRef = useRef<Record<string, HTMLInputElement | null>>({});

  const grouped = useMemo(() => {
    const groups: Record<RentalDocumentCategory, RentalContractDocument[]> = {
      contrato_aluguel: [],
      termo_vistoria: [],
      checklist_aluguel: [],
      outro: [],
    };
    for (const document of documents) groups[document.category].push(document);
    return groups;
  }, [documents]);

  async function onPick(category: RentalDocumentCategory, files: FileList | null) {
    if (!files?.length) return;
    setLocalError(null);
    setActiveCategory(category);
    try {
      for (const file of Array.from(files)) {
        await uploadFile(file, category);
      }
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Não foi possível enviar o arquivo.");
    } finally {
      const input = inputsRef.current[category];
      if (input) input.value = "";
      setActiveCategory(null);
    }
  }

  function runDocumentAction(action: () => Promise<unknown>) {
    setLocalError(null);
    void action().catch((error) => {
      setLocalError(error instanceof Error ? error.message : "Não foi possível concluir a ação.");
    });
  }

  const driveEnabled = Boolean(driveFolder?.sync_enabled);
  const visibleError =
    localError ||
    driveError?.message ||
    (isError ? documentsError?.message || "Não foi possível carregar os documentos." : null);

  return (
    <section
      id={sectionId}
      data-rental-section="documentos"
      className="scroll-mt-16 rounded-[1.35rem] border border-foreground/[0.07] bg-white/58 p-4 shadow-[0_18px_42px_-34px_rgba(22,56,70,0.4)] sm:p-5"
      aria-labelledby={`${sectionId}-title`}
    >
      <div className="flex flex-col gap-4 border-b border-foreground/[0.07] pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/9 text-primary ring-1 ring-primary/10">
            <FileText className="size-4.5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3
                id={`${sectionId}-title`}
                className="text-[15px] font-extrabold leading-5 tracking-[-0.015em]"
              >
                Documentos
              </h3>
              {!isLoading && (
                <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[10px] font-bold text-foreground/58">
                  {documents.length} arquivo{documents.length === 1 ? "" : "s"}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] leading-4 text-foreground/55">
              Contrato, vistoria, check-list e anexos complementares.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {driveEnabled ? (
            <>
              <span className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-emerald-500/10 px-3 text-[11px] font-bold text-emerald-800 ring-1 ring-emerald-500/14">
                <HardDrive className="size-3.5" />
                Drive ativo
              </span>
              {driveFolder?.folder_url && (
                <a
                  href={driveFolder.folder_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-white/72 px-3 text-[11px] font-bold text-primary ring-1 ring-foreground/[0.07] transition duration-200 hover:bg-white motion-reduce:transition-none"
                >
                  <ExternalLink className="size-3.5" />
                  Abrir pasta
                </a>
              )}
              <button
                type="button"
                onClick={() => runDocumentAction(syncAllToDrive)}
                disabled={isSyncing}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-primary/9 px-3 text-[11px] font-bold text-primary transition duration-200 hover:bg-primary/14 disabled:pointer-events-none disabled:opacity-55 motion-reduce:transition-none"
              >
                {isSyncing ? (
                  <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
                Sincronizar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (
                    window.confirm(
                      "Desativar sincronização Drive? Os arquivos no Drive permanecerão.",
                    )
                  ) {
                    runDocumentAction(() => disableDriveSync(false));
                  }
                }}
                disabled={isDisablingSync}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3 text-[11px] font-bold text-foreground/58 ring-1 ring-foreground/[0.08] transition duration-200 hover:bg-white/70 hover:text-foreground disabled:pointer-events-none disabled:opacity-55 motion-reduce:transition-none"
              >
                <CloudOff className="size-3.5" />
                Desativar
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => runDocumentAction(enableDriveSync)}
              disabled={isEnablingSync}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary/9 px-3.5 text-xs font-bold text-primary transition duration-200 hover:bg-primary/14 disabled:pointer-events-none disabled:opacity-55 motion-reduce:transition-none"
            >
              {isEnablingSync ? (
                <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
              ) : (
                <HardDrive className="size-4" />
              )}
              Ativar Google Drive
            </button>
          )}
        </div>
      </div>

      {visibleError && (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-rose-500/16 bg-rose-500/[0.07] px-3.5 py-3 text-xs font-semibold leading-5 text-rose-800"
        >
          {visibleError}
        </div>
      )}

      <div className="mt-4 grid items-start gap-3 xl:grid-cols-2">
        {RENTAL_DOCUMENT_CATEGORIES.map((category) => {
          const items = grouped[category.id];
          const busy = isUploading && activeCategory === category.id;

          return (
            <article
              key={category.id}
              className="min-w-0 rounded-2xl border border-foreground/[0.07] bg-background/35 p-3.5 sm:p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="break-words text-sm font-bold leading-5 [overflow-wrap:anywhere]">
                    {category.label}
                  </h4>
                  <p className="mt-0.5 break-words text-[11px] leading-4 text-foreground/55 [overflow-wrap:anywhere]">
                    {category.description}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => inputsRef.current[category.id]?.click()}
                  disabled={isUploading}
                  className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl bg-primary/9 px-3 text-[11px] font-bold text-primary transition duration-200 hover:bg-primary/14 disabled:pointer-events-none disabled:opacity-55 motion-reduce:transition-none"
                  aria-label={`Adicionar arquivo em ${category.label}`}
                >
                  {busy ? (
                    <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" />
                  ) : (
                    <Upload className="size-3.5" />
                  )}
                  {busy ? "Enviando…" : "Adicionar"}
                </button>
                <input
                  ref={(element) => {
                    inputsRef.current[category.id] = element;
                  }}
                  type="file"
                  multiple
                  accept={ACCEPT}
                  hidden
                  onChange={(event) => onPick(category.id, event.target.files)}
                />
              </div>

              <div className="mt-3">
                {isLoading ? (
                  <div className="space-y-2" aria-label={`Carregando ${category.label}`}>
                    <div className="h-14 animate-pulse rounded-xl bg-foreground/[0.05] motion-reduce:animate-none" />
                    <div className="h-14 animate-pulse rounded-xl bg-foreground/[0.04] motion-reduce:animate-none" />
                  </div>
                ) : items.length === 0 ? (
                  <div className="flex min-h-16 items-center gap-2.5 rounded-xl border border-dashed border-foreground/12 bg-white/38 px-3 text-xs font-medium leading-5 text-foreground/55">
                    <Paperclip className="size-4 shrink-0" />
                    Nenhum arquivo nesta categoria.
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {items.map((document) => {
                      const isImage = (document.mimeType ?? "").startsWith("image/");
                      const driveStatus = document.driveSyncStatus ?? "not_enabled";

                      return (
                        <li
                          key={document.id}
                          className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 rounded-xl border border-foreground/[0.06] bg-white/66 p-2.5 animate-in fade-in slide-in-from-top-1 duration-200 motion-reduce:animate-none sm:grid-cols-[auto_minmax(0,1fr)_auto]"
                        >
                          <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-primary/9 text-primary">
                            {isImage && document.url ? (
                              <img
                                src={document.url}
                                alt=""
                                className="size-full object-cover"
                                loading="lazy"
                              />
                            ) : isImage ? (
                              <ImageIcon className="size-4.5" />
                            ) : (
                              <FileText className="size-4.5" />
                            )}
                          </div>

                          <div className="min-w-0">
                            {document.url ? (
                              <a
                                href={document.url}
                                target="_blank"
                                rel="noreferrer"
                                className="line-clamp-2 break-words text-xs font-bold leading-4 text-foreground hover:text-primary [overflow-wrap:anywhere]"
                                title={document.fileName}
                              >
                                {document.fileName}
                              </a>
                            ) : (
                              <p
                                className="line-clamp-2 break-words text-xs font-bold leading-4 [overflow-wrap:anywhere]"
                                title={document.fileName}
                              >
                                {document.fileName}
                              </p>
                            )}
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              <span className="text-[10px] font-medium text-foreground/52">
                                {formatSize(document.sizeBytes)} ·{" "}
                                {new Date(document.createdAt).toLocaleDateString("pt-BR")}
                              </span>
                              <StorageBadge
                                hasCloud={Boolean(document.filePath)}
                                driveStatus={driveStatus}
                              />
                            </div>
                            {document.driveLastError && (
                              <p
                                className="mt-1 line-clamp-2 break-words text-[10px] font-medium leading-4 text-amber-800 [overflow-wrap:anywhere]"
                                title={document.driveLastError}
                              >
                                {document.driveLastError}
                              </p>
                            )}
                          </div>

                          <FileActions
                            document={document}
                            driveEnabled={driveEnabled}
                            isSyncing={isSyncing}
                            isDeleting={isDeleting}
                            onSync={() => runDocumentAction(() => syncDocumentToDrive(document.id))}
                            onTrashDrive={() => {
                              if (
                                window.confirm("Remover apenas a cópia deste arquivo no Drive?")
                              ) {
                                runDocumentAction(() => trashDriveCopy(document.id));
                              }
                            }}
                            onDelete={() => {
                              if (window.confirm("Remover este documento?")) {
                                runDocumentAction(() => deleteFile(document.id, "both"));
                              }
                            }}
                          />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
