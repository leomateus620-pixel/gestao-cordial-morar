import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, FolderArchive, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { RequireModuleAccess } from "@/components/auth/RequireModuleAccess";
import { KpiCard } from "@/components/kpi-card";
import { SectionHeader } from "@/components/section-header";
import { DocumentUploadZone } from "@/components/documentos/DocumentUploadZone";
import { DocumentRow } from "@/components/documentos/DocumentRow";
import { RenameDocumentDialog } from "@/components/documentos/RenameDocumentDialog";
import { useInternalDocuments } from "@/hooks/useInternalDocuments";
import { formatFileSize, type InternalDocument } from "@/types/internal-document";

type SortKey = "recentes" | "nome" | "tamanho";

const sortOptions: Array<{ id: SortKey; label: string }> = [
  { id: "recentes", label: "Mais recentes" },
  { id: "nome", label: "Nome" },
  { id: "tamanho", label: "Tamanho" },
];

export const Route = createFileRoute("/_app/documentos")({
  head: () => ({
    meta: [
      { title: "Documentos internos — Gestão Cordial" },
      {
        name: "description",
        content:
          "Repositório interno da imobiliária: envie, organize e baixe documentos com acesso restrito à administração.",
      },
      { property: "og:title", content: "Documentos internos — Gestão Cordial" },
      {
        property: "og:description",
        content: "Arquivos internos da imobiliária em um repositório seguro e centralizado.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GuardedPage,
});

function GuardedPage() {
  return (
    <RequireModuleAccess module="documentos">
      <Page />
    </RequireModuleAccess>
  );
}

function Page() {
  const {
    documents,
    isLoading,
    isError,
    error,
    uploadFile,
    updateDocument,
    deleteDocument,
    openDocument,
    isUploading,
    isSaving,
    isDeleting,
  } = useInternalDocuments();

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("recentes");
  const [editing, setEditing] = useState<InternalDocument | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const totalSize = documents.reduce((t, d) => t + Number(d.sizeBytes ?? 0), 0);
  const lastUpload = documents[0]?.createdAt;

  const list = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = term
      ? documents.filter(
          (d) =>
            d.title.toLowerCase().includes(term) ||
            (d.description ?? "").toLowerCase().includes(term) ||
            d.fileName.toLowerCase().includes(term),
        )
      : documents;
    const sorted = [...filtered];
    if (sort === "nome") sorted.sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
    else if (sort === "tamanho")
      sorted.sort((a, b) => Number(b.sizeBytes ?? 0) - Number(a.sizeBytes ?? 0));
    else sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return sorted;
  }, [documents, search, sort]);

  async function handleFiles(files: File[]) {
    let ok = 0;
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i]!;
      setProgress(`Enviando ${i + 1} de ${files.length}: ${file.name}`);
      try {
        await uploadFile(file);
        ok += 1;
      } catch (e) {
        toast.error((e as Error).message || `Falha ao enviar ${file.name}.`);
      }
    }
    setProgress(null);
    if (ok > 0) toast.success(ok === 1 ? "Documento enviado." : `${ok} documentos enviados.`);
  }

  async function handleSave(title: string, description: string) {
    if (!editing) return;
    try {
      await updateDocument(editing.id, title, description || null);
      setEditing(null);
      toast.success("Documento atualizado.");
    } catch (e) {
      toast.error((e as Error).message || "Não foi possível salvar.");
    }
  }

  async function handleDelete(doc: InternalDocument) {
    try {
      await deleteDocument(doc.id);
      toast.success("Documento excluído.");
    } catch (e) {
      toast.error((e as Error).message || "Não foi possível excluir.");
    }
  }

  async function handleOpen(doc: InternalDocument, download = false) {
    try {
      await openDocument(doc, download);
    } catch (e) {
      toast.error((e as Error).message || "Não foi possível abrir o arquivo.");
    }
  }

  return (
    <>
      <section className="mb-5 grid grid-cols-3 gap-3">
        <KpiCard
          label="Arquivos"
          value={documents.length.toString()}
          tone="primary"
          delta="total"
        />
        <KpiCard label="Espaço usado" value={formatFileSize(totalSize)} delta="nuvem" />
        <KpiCard
          label="Último envio"
          value={
            lastUpload
              ? new Date(lastUpload).toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                })
              : "—"
          }
          delta="registro"
        />
      </section>

      <section className="mb-5">
        <SectionHeader title="Enviar documento interno" />
        <DocumentUploadZone
          onFiles={handleFiles}
          isUploading={isUploading || !!progress}
          progressLabel={progress}
        />
      </section>

      <section>
        <SectionHeader title="Arquivos da imobiliária" />

        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="glass-panel flex flex-1 items-center gap-2 rounded-2xl px-3 py-2">
            <Search className="size-4 text-foreground/45" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome ou descrição"
              className="w-full bg-transparent text-sm outline-none placeholder:text-foreground/40"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {sortOptions.map((option) => (
              <button
                key={option.id}
                onClick={() => setSort(option.id)}
                className={
                  "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition " +
                  (sort === option.id
                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                    : "glass-panel text-foreground/65")
                }
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="glass-panel flex items-center justify-center gap-2 rounded-2xl p-8 text-sm text-foreground/60">
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" /> Carregando
            documentos…
          </div>
        ) : isError ? (
          <div className="glass-panel flex items-start gap-3 rounded-2xl p-5 text-sm">
            <AlertTriangle className="mt-0.5 size-5 text-amber-600" />
            <div>
              <p className="font-semibold">Não foi possível carregar os documentos.</p>
              <p className="text-[12px] text-foreground/60">{error?.message}</p>
            </div>
          </div>
        ) : list.length === 0 ? (
          <div className="glass-panel rounded-2xl p-8 text-center">
            <div className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
              <FolderArchive className="size-6" />
            </div>
            <p className="text-sm font-semibold">
              {search ? "Nenhum arquivo encontrado" : "Nenhum documento interno ainda"}
            </p>
            <p className="mt-1 text-[12px] text-foreground/58">
              {search
                ? "Tente outro termo de busca."
                : "Envie contratos internos, modelos, certidões e manuais da imobiliária."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {list.map((doc) => (
              <DocumentRow
                key={doc.id}
                doc={doc}
                onOpen={handleOpen}
                onRename={setEditing}
                onDelete={handleDelete}
                isDeleting={isDeleting}
              />
            ))}
          </div>
        )}
      </section>

      <RenameDocumentDialog
        doc={editing}
        onOpenChange={(open) => !open && setEditing(null)}
        onSave={handleSave}
        isSaving={isSaving}
      />
    </>
  );
}
