import { useRef, useState, type DragEvent } from "react";
import { Loader2, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";
import { INTERNAL_DOCUMENT_ACCEPT } from "@/types/internal-document";

type Props = {
  onFiles: (files: File[]) => void;
  isUploading: boolean;
  progressLabel?: string | null;
};

export function DocumentUploadZone({ onFiles, isUploading, progressLabel }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length) onFiles(files);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => !isUploading && inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
      }}
      className={cn(
        "glass-panel flex cursor-pointer flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed px-6 py-10 text-center transition",
        dragging ? "border-primary bg-primary/5" : "border-foreground/15 hover:border-primary/50",
        isUploading && "pointer-events-none opacity-70",
      )}
    >
      <div className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
        {isUploading ? (
          <Loader2 className="size-6 animate-spin motion-reduce:animate-none" />
        ) : (
          <UploadCloud className="size-6" />
        )}
      </div>
      <p className="text-sm font-semibold">
        {isUploading ? (progressLabel ?? "Enviando arquivos…") : "Arraste arquivos ou clique para enviar"}
      </p>
      <p className="text-[11px] text-foreground/55">
        PDF, imagens, Word, Excel, CSV ou TXT · até 50 MB por arquivo · vários de uma vez
      </p>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={INTERNAL_DOCUMENT_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onFiles(files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
