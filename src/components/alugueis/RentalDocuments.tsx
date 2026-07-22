import { useMemo, useRef, useState } from "react";
import { FileText, Image as ImageIcon, Paperclip, Trash2, Upload } from "lucide-react";
import { useRentalDocuments } from "@/hooks/useRentalDocuments";
import {
  RENTAL_DOCUMENT_CATEGORIES,
  type RentalDocumentCategory,
} from "@/types/rental";

function fmtSize(bytes?: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,application/pdf,image/*,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const CATEGORY_LABELS: Record<RentalDocumentCategory, string> =
  RENTAL_DOCUMENT_CATEGORIES.reduce(
    (acc, c) => {
      acc[c.id] = c.label;
      return acc;
    },
    {} as Record<RentalDocumentCategory, string>,
  );

export function RentalDocuments({ contractId }: { contractId: string }) {
  const { documents, isLoading, uploadFile, deleteFile, isUploading, isDeleting } =
    useRentalDocuments(contractId);
  const [err, setErr] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<RentalDocumentCategory | null>(null);
  const inputsRef = useRef<Record<string, HTMLInputElement | null>>({});

  const grouped = useMemo(() => {
    const g: Record<RentalDocumentCategory, typeof documents> = {
      contrato_aluguel: [],
      termo_vistoria: [],
      checklist_aluguel: [],
      outro: [],
    };
    for (const d of documents) g[d.category].push(d);
    return g;
  }, [documents]);

  async function onPick(category: RentalDocumentCategory, files: FileList | null) {
    if (!files || files.length === 0) return;
    setErr(null);
    setActiveCategory(category);
    try {
      for (const f of Array.from(files)) {
        await uploadFile(f, category);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha no upload.");
    } finally {
      const el = inputsRef.current[category];
      if (el) el.value = "";
      setActiveCategory(null);
    }
  }

  return (
    <div className="liquid-panel rounded-2xl p-4">
      <h3 className="mb-3 text-[10px] font-bold uppercase tracking-wider text-foreground/55">
        Documentos do contrato
      </h3>

      {err && (
        <p className="mb-2 rounded-lg bg-rose-500/10 px-2.5 py-1.5 text-[11px] font-medium text-rose-700">
          {err}
        </p>
      )}

      <div className="space-y-3">
        {RENTAL_DOCUMENT_CATEGORIES.map((cat) => {
          const items = grouped[cat.id];
          const busy = isUploading && activeCategory === cat.id;
          return (
            <div
              key={cat.id}
              className="rounded-xl border border-white/50 bg-white/40 p-3"
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-foreground">
                    {cat.label}
                  </p>
                  <p className="truncate text-[10px] text-foreground/55">
                    {cat.description}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => inputsRef.current[cat.id]?.click()}
                  disabled={isUploading}
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/15 disabled:opacity-60"
                >
                  <Upload className="size-3" />
                  {busy ? "Enviando…" : "Adicionar"}
                </button>
                <input
                  ref={(el) => {
                    inputsRef.current[cat.id] = el;
                  }}
                  type="file"
                  multiple
                  accept={ACCEPT}
                  hidden
                  onChange={(e) => onPick(cat.id, e.target.files)}
                />
              </div>

              {isLoading ? (
                <p className="py-1 text-[11px] text-foreground/50">Carregando…</p>
              ) : items.length === 0 ? (
                <div className="flex items-center gap-2 rounded-lg border border-dashed border-white/60 bg-white/30 px-3 py-2 text-[11px] text-foreground/55">
                  <Paperclip className="size-3.5" />
                  Nenhum arquivo em {CATEGORY_LABELS[cat.id]}.
                </div>
              ) : (
                <ul className="divide-y divide-white/40">
                  {items.map((d) => {
                    const isImg = (d.mimeType ?? "").startsWith("image/");
                    return (
                      <li key={d.id} className="flex items-center gap-3 py-2">
                        <div className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-primary/10 text-primary">
                          {isImg && d.url ? (
                            <img
                              src={d.url}
                              alt={d.fileName}
                              className="size-full object-cover"
                              loading="lazy"
                            />
                          ) : isImg ? (
                            <ImageIcon className="size-4" />
                          ) : (
                            <FileText className="size-4" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          {d.url ? (
                            <a
                              href={d.url}
                              target="_blank"
                              rel="noreferrer"
                              className="block truncate text-xs font-semibold text-foreground hover:text-primary"
                            >
                              {d.fileName}
                            </a>
                          ) : (
                            <span className="block truncate text-xs font-semibold text-foreground">
                              {d.fileName}
                            </span>
                          )}
                          <p className="text-[10px] text-foreground/55">
                            {fmtSize(d.sizeBytes)}
                            {d.sizeBytes ? " · " : ""}
                            {new Date(d.createdAt).toLocaleDateString("pt-BR")}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm("Remover este documento?")) deleteFile(d.id);
                          }}
                          disabled={isDeleting}
                          className="grid size-8 shrink-0 place-items-center rounded-lg text-rose-600 hover:bg-rose-500/10 disabled:opacity-50"
                          aria-label="Excluir documento"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
