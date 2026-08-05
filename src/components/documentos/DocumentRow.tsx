import { useState } from "react";
import {
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Loader2,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatFileSize, type InternalDocument } from "@/types/internal-document";

function iconFor(mime: string | null, name: string) {
  const value = `${mime ?? ""} ${name}`.toLowerCase();
  if (value.includes("image") || /\.(png|jpe?g|webp|gif)$/.test(value)) return ImageIcon;
  if (value.includes("sheet") || value.includes("excel") || /\.(xlsx?|csv)$/.test(value))
    return FileSpreadsheet;
  return FileText;
}

type Props = {
  doc: InternalDocument;
  onOpen: (doc: InternalDocument, download?: boolean) => void;
  onRename: (doc: InternalDocument) => void;
  onDelete: (doc: InternalDocument) => void;
  isDeleting: boolean;
};

export function DocumentRow({ doc, onOpen, onRename, onDelete, isDeleting }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const Icon = iconFor(doc.mimeType, doc.fileName);

  return (
    <article className="glass-panel rounded-2xl p-4">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{doc.title}</p>
          {doc.description && (
            <p className="mt-0.5 line-clamp-2 text-[11px] text-foreground/60">{doc.description}</p>
          )}
          <p className="mt-1 text-[11px] text-foreground/55">
            {formatFileSize(doc.sizeBytes)} ·{" "}
            {new Date(doc.createdAt).toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
            {doc.uploadedByName ? ` · ${doc.uploadedByName}` : ""}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 border-t border-white/40 pt-3">
        <button
          onClick={() => onOpen(doc)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary/10 px-3 py-1.5 text-[11px] font-semibold text-primary transition hover:bg-primary/15"
        >
          <ExternalLink className="size-3.5" /> Abrir
        </button>
        <button
          onClick={() => onOpen(doc, true)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-foreground/[0.06] px-3 py-1.5 text-[11px] font-semibold text-foreground/70 transition hover:bg-foreground/10"
        >
          <Download className="size-3.5" /> Baixar
        </button>
        <button
          onClick={() => onRename(doc)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-foreground/[0.06] px-3 py-1.5 text-[11px] font-semibold text-foreground/70 transition hover:bg-foreground/10"
        >
          <Pencil className="size-3.5" /> Renomear
        </button>
        <button
          onClick={() => setConfirmOpen(true)}
          disabled={isDeleting}
          className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-destructive/10 px-3 py-1.5 text-[11px] font-semibold text-destructive transition hover:bg-destructive/15 disabled:opacity-60"
        >
          {isDeleting ? (
            <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" />
          ) : (
            <Trash2 className="size-3.5" />
          )}
          Excluir
        </button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir documento</AlertDialogTitle>
            <AlertDialogDescription>
              “{doc.title}” será removido definitivamente da nuvem da imobiliária. Esta ação não
              pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false);
                onDelete(doc);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}
