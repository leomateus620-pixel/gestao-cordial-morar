import { useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, ImagePlus, Link2, Loader2, Paperclip, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  addAgendaLink,
  deleteAgendaAttachment,
  listAgendaAttachments,
  registerAgendaPhoto,
  signAgendaAttachmentUrls,
} from "@/lib/agenda/agenda-attachments.functions";
import { cn } from "@/lib/utils";

const BUCKET = "agenda-attachments";
const MAX_BYTES = 25 * 1024 * 1024;

function safeName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .slice(-80);
}

/** Bloco de anexos internos (fotos e links) de um compromisso da agenda. */
export function AgendaAttachments({ eventId, canEdit }: { eventId: string; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const list = useServerFn(listAgendaAttachments);
  const registerPhoto = useServerFn(registerAgendaPhoto);
  const addLink = useServerFn(addAgendaLink);
  const removeAttachment = useServerFn(deleteAgendaAttachment);
  const signUrls = useServerFn(signAgendaAttachmentUrls);

  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryKey = ["agenda", "attachments", eventId];
  const attachmentsQuery = useQuery({
    queryKey,
    queryFn: () => list({ data: { eventId } }),
    staleTime: 30_000,
  });
  const attachments = attachmentsQuery.data ?? [];
  const photoPaths = attachments
    .filter((item) => item.kind === "foto" && item.filePath)
    .map((item) => item.filePath as string);

  const previewsQuery = useQuery({
    queryKey: ["agenda", "attachments", "urls", eventId, photoPaths.join("|")],
    queryFn: () => signUrls({ data: { paths: photoPaths } }),
    enabled: photoPaths.length > 0,
    staleTime: 10 * 60_000,
  });
  const previews = previewsQuery.data ?? {};

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const linkMutation = useMutation({
    mutationFn: () => addLink({ data: { eventId, url: linkUrl, label: linkLabel } }),
    onSuccess: () => {
      setLinkUrl("");
      setLinkLabel("");
      setError(null);
      void invalidate();
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => removeAttachment({ data: { id } }),
    onSuccess: () => void invalidate(),
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  async function handleFiles(inputEvent: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(inputEvent.target.files ?? []);
    inputEvent.target.value = "";
    if (files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of files) {
        if (!file.type.startsWith("image/")) {
          throw new Error(`"${file.name}" não é uma imagem.`);
        }
        if (file.size > MAX_BYTES) {
          throw new Error(`"${file.name}" passa de 25 MB.`);
        }
        const filePath = `${eventId}/${crypto.randomUUID()}-${safeName(file.name)}`;
        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(filePath, file, { contentType: file.type, upsert: false });
        if (uploadError) throw new Error(uploadError.message);
        await registerPhoto({
          data: {
            eventId,
            filePath,
            fileName: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
          },
        });
      }
      await invalidate();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Falha ao enviar a foto.");
    } finally {
      setUploading(false);
    }
  }

  const photos = attachments.filter((item) => item.kind === "foto");
  const links = attachments.filter((item) => item.kind === "link");

  return (
    <div className="space-y-3">
      <p className="flex items-center gap-1.5 text-[11px] leading-5 text-foreground/52">
        <Paperclip className="size-3.5" />
        Fotos e links ficam somente aqui no Gestão — não vão para os sites Cordial/Morar.
      </p>

      {error && (
        <p role="alert" className="rounded-2xl bg-rose-50 px-3 py-2 text-[11px] text-rose-800">
          {error}
        </p>
      )}

      {canEdit && (
        <div className="space-y-2">
          <label
            className={cn(
              "flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-teal-700/30 bg-white/60 px-3 py-3 text-xs font-semibold text-teal-800 transition hover:bg-white/80",
              uploading && "opacity-70",
            )}
          >
            {uploading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ImagePlus className="size-4" />
            )}
            {uploading ? "Enviando fotos..." : "Adicionar fotos"}
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFiles}
              disabled={uploading}
            />
          </label>

          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                value={linkUrl}
                onChange={(inputEvent) => setLinkUrl(inputEvent.target.value)}
                placeholder="Cole um link (ex.: pasta de fotos)"
                className="w-full rounded-2xl border border-white/65 bg-white/74 px-3 py-2.5 text-sm outline-none focus:border-teal-700/45"
              />
              <input
                value={linkLabel}
                onChange={(inputEvent) => setLinkLabel(inputEvent.target.value)}
                placeholder="Rótulo (opcional)"
                className="w-full rounded-2xl border border-white/65 bg-white/74 px-3 py-2.5 text-sm outline-none focus:border-teal-700/45"
              />
            </div>
            <button
              type="button"
              onClick={() => linkUrl.trim() && linkMutation.mutate()}
              disabled={linkMutation.isPending || !linkUrl.trim()}
              className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-teal-700 px-3 py-2.5 text-xs font-bold text-white transition hover:bg-teal-800 disabled:opacity-60"
            >
              <Link2 className="size-3.5" />
              Salvar link
            </button>
          </div>
        </div>
      )}

      {attachmentsQuery.isLoading ? (
        <p className="text-[11px] text-foreground/50">Carregando anexos...</p>
      ) : attachments.length === 0 ? (
        <p className="text-[11px] text-foreground/50">Nenhum anexo neste compromisso.</p>
      ) : (
        <>
          {photos.length > 0 && (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {photos.map((photo) => {
                const url = photo.filePath ? previews[photo.filePath] : undefined;
                return (
                  <li
                    key={photo.id}
                    className="group relative aspect-square overflow-hidden rounded-2xl bg-white/60 ring-1 ring-white/65"
                  >
                    {url ? (
                      <img
                        src={url}
                        alt={photo.fileName ?? "Foto do compromisso"}
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    ) : (
                      <span className="grid size-full place-items-center text-[10px] text-foreground/45">
                        Foto
                      </span>
                    )}
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => deleteMutation.mutate(photo.id)}
                        aria-label={`Remover ${photo.fileName ?? "foto"}`}
                        className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-full bg-white/85 text-rose-700 shadow-sm transition hover:bg-white"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {links.length > 0 && (
            <ul className="space-y-1.5">
              {links.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-2 rounded-2xl bg-white/60 px-3 py-2 text-xs ring-1 ring-white/65"
                >
                  <Link2 className="size-3.5 shrink-0 text-teal-700" />
                  <a
                    href={item.url ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 flex-1 truncate font-medium text-teal-900 hover:underline"
                  >
                    {item.label || item.url}
                  </a>
                  <ExternalLink className="size-3 shrink-0 text-foreground/35" />
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => deleteMutation.mutate(item.id)}
                      aria-label="Remover link"
                      className="text-foreground/40 transition hover:text-rose-600"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
