import { useRef, useState } from "react";
import { FileText, Image as ImageIcon, Paperclip, Trash2, Upload } from "lucide-react";
import { useRentalDocuments } from "@/hooks/useRentalDocuments";

function fmtSize(bytes?: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,application/pdf,image/*,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function RentalDocuments({ contractId }: { contractId: string }) {
  const { documents, isLoading, uploadFile, deleteFile, isUploading, isDeleting } =
    useRentalDocuments(contractId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onPick(files: FileList | null) {
    if (!files || files.length === 0) return;
    setErr(null);
    try {
      for (const f of Array.from(files)) {
        await uploadFile(f);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha no upload.");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="liquid-panel rounded-2xl p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-foreground/55">
          Documentos do contrato
        </h3>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isUploading}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/15 disabled:opacity-60"
        >
          <Upload className="size-3" />
          {isUploading ? "Enviando…" : "Adicionar"}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          hidden
          onChange={(e) => onPick(e.target.files)}
        />
      </div>

      {err && (
        <p className="mb-2 rounded-lg bg-rose-500/10 px-2.5 py-1.5 text-[11px] font-medium text-rose-700">
          {err}
        </p>
      )}

      {isLoading ? (
        <p className="py-2 text-[11px] text-foreground/50">Carregando…</p>
      ) : documents.length === 0 ? (
        <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed border-white/60 bg-white/30 py-4 text-[11px] text-foreground/55">
          <Paperclip className="size-4" />
          Nenhum documento anexado ainda.
        </div>
      ) : (
        <ul className="divide-y divide-white/40">
          {documents.map((d) => {
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
}
