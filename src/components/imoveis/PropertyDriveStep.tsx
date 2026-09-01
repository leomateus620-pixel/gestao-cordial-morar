import { useRef } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FolderTree,
  Images,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import {
  ACCEPTED_DRIVE_PHOTO_MIME,
  ACCEPTED_VIDEO_MIME,
  usePropertyDrive,
  usePropertyDriveStatus,
} from "@/hooks/usePropertyDrive";
import type { DriveCategory } from "@/lib/imoveis/drive/naming";

const CARD_ICON: Record<DriveCategory, typeof Images> = {
  horizontal: Images,
  vertical: Images,
  video: Video,
};

const STATUS_LABEL: Record<string, string> = {
  aguardando: "Aguardando",
  preparando: "Preparando",
  enviando: "Enviando",
  concluido: "Concluído",
  pendencias: "Concluído com pendências",
  erro: "Erro — tentar novamente",
};

const STATUS_TONE: Record<string, string> = {
  aguardando: "bg-foreground/[0.06] text-foreground/60",
  preparando: "bg-sky-500/12 text-sky-800",
  enviando: "bg-sky-500/12 text-sky-800",
  concluido: "bg-emerald-600/12 text-emerald-800",
  pendencias: "bg-amber-500/14 text-amber-900",
  erro: "bg-rose-500/12 text-rose-800",
};

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

export function PropertyDriveStep({
  propertyId,
  onRequestSave,
  onEditStep,
}: {
  propertyId: string | null | undefined;
  onRequestSave?: () => Promise<string | null>;
  onEditStep?: (index: number) => void;
}) {
  const status = usePropertyDriveStatus(propertyId ?? undefined);
  const drive = usePropertyDrive(propertyId ?? undefined);
  const videoInput = useRef<HTMLInputElement>(null);
  const verticalInput = useRef<HTMLInputElement>(null);
  const data = status.data;

  async function ensureSaved(): Promise<string | null> {
    if (propertyId) return propertyId;
    if (!onRequestSave) {
      toast.error("Salve o imóvel antes de organizar a pasta no Drive.");
      return null;
    }
    return onRequestSave();
  }

  async function handleSync() {
    const id = await ensureSaved();
    if (!id) return;
    try {
      const result = await drive.sync.mutateAsync();
      toast.success(`Pasta preparada no Google Drive: ${result.folderName}`);
    } catch (err) {
      toast.error((err as Error)?.message ?? "Não foi possível preparar a pasta agora.");
    }
  }

  const totalFotos =
    (data?.categories.find((c) => c.category === "horizontal")?.total ?? 0) +
    (data?.categories.find((c) => c.category === "vertical")?.total ?? 0);
  const fotosSincronizadas =
    (data?.categories.find((c) => c.category === "horizontal")?.synced ?? 0) +
    (data?.categories.find((c) => c.category === "vertical")?.synced ?? 0);
  const videosSincronizados = data?.categories.find((c) => c.category === "video")?.synced ?? 0;
  const pendentes = (data?.categories ?? []).reduce((acc, c) => acc + c.failed, 0);

  return (
    <div className="space-y-4">
      <header className="rounded-3xl bg-white/60 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="grid size-9 shrink-0 place-items-center rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
                <FolderTree className="size-4 text-primary" />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-bold">Google Drive</h3>
                <p className="text-[11px] text-foreground/55">
                  Organize automaticamente as fotos e os vídeos deste imóvel na pasta compartilhada
                  da imobiliária.
                </p>
              </div>
            </div>
            <p
              className="mt-3 truncate text-[12px] font-semibold text-foreground/80"
              title={data?.folderName}
            >
              {data?.folderName ?? "Nome da pasta será definido pelos códigos do imóvel"}
            </p>
            <p className="mt-0.5 text-[11px] text-foreground/55">
              {[
                data?.cordialCode ? `Cordial ${data.cordialCode}` : null,
                data?.morarCode ? `Morar ${data.morarCode}` : null,
              ]
                .filter(Boolean)
                .join(" · ") || "Sem código por imobiliária definido"}
              {data?.providers.length ? ` · destino: ${data.providers.join(" + ")}` : ""}
            </p>
          </div>

          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            <span
              className={
                "inline-flex items-center gap-1 self-start rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider sm:self-end " +
                (data?.connected
                  ? "bg-emerald-600/12 text-emerald-800"
                  : "bg-amber-500/14 text-amber-900")
              }
            >
              {data?.connected ? (
                <CheckCircle2 className="size-3" />
              ) : (
                <AlertTriangle className="size-3" />
              )}
              {data?.connected ? "Drive conectado" : "Drive indisponível"}
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSync}
                disabled={drive.sync.isPending}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-4 text-xs font-bold text-primary-foreground disabled:opacity-60"
              >
                {drive.sync.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
                Organizar no Drive
              </button>
              {data?.folderReady && data.folderUrl ? (
                <a
                  href={data.folderUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="glass-panel inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-xs font-semibold"
                >
                  <ExternalLink className="size-3.5" /> Abrir pasta no Drive
                </a>
              ) : null}
            </div>
          </div>
        </div>

        {data && !data.connected && data.connectionMessage ? (
          <p className="mt-3 rounded-2xl bg-amber-500/10 px-3 py-2 text-[11px] text-amber-900">
            {data.connectionMessage}
          </p>
        ) : null}
      </header>

      <div className="grid gap-3 md:grid-cols-3">
        {(data?.categories ?? []).map((card) => {
          const Icon = CARD_ICON[card.category];
          return (
            <div key={card.category} className="rounded-3xl bg-white/60 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-[12px] font-bold">
                  <Icon className="size-4 text-primary" />
                  {card.label.replace(/^\d+ - /, "")}
                </span>
                <span className="text-[11px] font-semibold text-foreground/60">{card.total}</span>
              </div>
              <p
                className={
                  "mt-3 inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider " +
                  (STATUS_TONE[card.status] ?? STATUS_TONE.aguardando)
                }
              >
                {card.status === "enviando"
                  ? `Enviando ${card.synced + card.uploading} de ${card.total}`
                  : (STATUS_LABEL[card.status] ?? "Aguardando")}
              </p>
              <p className="mt-2 text-[11px] text-foreground/55">
                {card.synced} de {card.total} sincronizado{card.total === 1 ? "" : "s"}
                {card.failed ? ` · ${card.failed} com falha` : ""}
              </p>
              {card.failed ? (
                <button
                  type="button"
                  onClick={() => drive.retry.mutate({ category: card.category })}
                  className="mt-3 inline-flex min-h-11 items-center gap-1 rounded-full bg-foreground/[0.06] px-3 text-[11px] font-semibold"
                >
                  <RefreshCw className="size-3" /> Tentar novamente
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="rounded-3xl bg-white/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[12px] font-bold">Fotos verticais (só Drive)</p>
            <p className="text-[11px] text-foreground/55">
              JPG, PNG ou WEBP até 50 MB. Estas fotos não são publicadas nos sites — vão apenas para
              a pasta Vertical do Drive.
            </p>
          </div>
          <button
            type="button"
            onClick={async () => {
              const id = await ensureSaved();
              if (id) verticalInput.current?.click();
            }}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-foreground/[0.06] px-4 text-xs font-semibold"
          >
            <Upload className="size-3.5" /> Adicionar foto vertical
          </button>
          <input
            ref={verticalInput}
            type="file"
            accept={ACCEPTED_DRIVE_PHOTO_MIME.join(",")}
            multiple
            hidden
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (files.length) drive.uploadDrivePhotos.mutate(files);
            }}
          />
        </div>

        {drive.photoProgress.length ? (
          <ul className="mt-3 space-y-1">
            {drive.photoProgress.map((item, i) => (
              <li
                key={`${item.name}-${i}`}
                className="flex items-center gap-2 text-[11px] text-foreground/65"
              >
                {item.status === "enviando" ? <Loader2 className="size-3 animate-spin" /> : null}
                <span className="truncate">{item.name}</span>
                <span className="ml-auto shrink-0 font-semibold">
                  {item.status === "erro" ? (item.error ?? "Erro") : item.status}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {(data?.drivePhotos ?? []).length ? (
          <ul className="mt-3 space-y-1.5">
            {(data?.drivePhotos ?? []).map((photo) => (
              <li
                key={photo.id}
                className="flex items-center gap-2 rounded-2xl bg-white/70 px-3 py-2 text-[11px]"
              >
                <Images className="size-3.5 shrink-0 text-primary" />
                <span className="truncate" title={photo.fileName}>
                  {photo.fileName}
                </span>
                <span className="ml-auto shrink-0 text-foreground/50">
                  {formatSize(photo.sizeBytes)}
                </span>
                <button
                  type="button"
                  aria-label={`Remover ${photo.fileName}`}
                  onClick={() => drive.removeDrivePhoto.mutate(photo.id)}
                  className="grid size-11 shrink-0 place-items-center rounded-full text-foreground/50 hover:text-rose-700"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[11px] text-foreground/50">
            Nenhuma foto vertical enviada ainda.
          </p>
        )}
      </div>

      <div className="rounded-3xl bg-white/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[12px] font-bold">Vídeos do imóvel</p>
            <p className="text-[11px] text-foreground/55">
              MP4, MOV ou WEBM até 500 MB. O envio continua em segundo plano.
            </p>
          </div>
          <button
            type="button"
            onClick={async () => {
              const id = await ensureSaved();
              if (id) videoInput.current?.click();
            }}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-foreground/[0.06] px-4 text-xs font-semibold"
          >
            <Upload className="size-3.5" /> Adicionar vídeo
          </button>
          <input
            ref={videoInput}
            type="file"
            accept={ACCEPTED_VIDEO_MIME.join(",")}
            multiple
            hidden
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (files.length) drive.uploadVideos.mutate(files);
            }}
          />
        </div>

        {drive.videoProgress.length ? (
          <ul className="mt-3 space-y-1">
            {drive.videoProgress.map((item, i) => (
              <li
                key={`${item.name}-${i}`}
                className="flex items-center gap-2 text-[11px] text-foreground/65"
              >
                {item.status === "enviando" ? <Loader2 className="size-3 animate-spin" /> : null}
                <span className="truncate">{item.name}</span>
                <span className="ml-auto shrink-0 font-semibold">
                  {item.status === "erro" ? (item.error ?? "Erro") : item.status}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {(data?.videos ?? []).length ? (
          <ul className="mt-3 space-y-1.5">
            {(data?.videos ?? []).map((video) => (
              <li
                key={video.id}
                className="flex items-center gap-2 rounded-2xl bg-white/70 px-3 py-2 text-[11px]"
              >
                <Video className="size-3.5 shrink-0 text-primary" />
                <span className="truncate" title={video.fileName}>
                  {video.fileName}
                </span>
                <span className="ml-auto shrink-0 text-foreground/50">
                  {formatSize(video.sizeBytes)}
                </span>
                <button
                  type="button"
                  aria-label={`Remover ${video.fileName}`}
                  onClick={() => drive.removeVideo.mutate(video.id)}
                  className="grid size-11 shrink-0 place-items-center rounded-full text-foreground/50 hover:text-rose-700"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[11px] text-foreground/50">Nenhum vídeo anexado ainda.</p>
        )}
      </div>

      <div className="rounded-3xl bg-white/50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[12px] font-bold">Fotos da Etapa 6</p>
          {onEditStep ? (
            <button
              type="button"
              onClick={() => onEditStep(5)}
              className="inline-flex min-h-11 items-center rounded-full bg-foreground/[0.06] px-3 text-[11px] font-semibold"
            >
              Voltar à Etapa 6
            </button>
          ) : null}
        </div>
        <p className="mt-1 text-[11px] text-foreground/55">
          As fotos do cadastro vão automaticamente para a pasta Horizontal — nada precisa ser
          reenviado.
        </p>
        {(data?.photos ?? []).length ? (
          <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
            {(data?.photos ?? []).map((photo) => (
              <li
                key={photo.id}
                className="flex items-center gap-2 rounded-2xl bg-white/70 px-3 py-2 text-[11px]"
              >
                <span className="truncate" title={photo.fileName}>
                  {photo.fileName}
                </span>
                <span className="ml-auto shrink-0 rounded-full bg-foreground/[0.05] px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-foreground/60">
                  Horizontal
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[11px] text-foreground/50">
            Nenhuma foto adicionada na Etapa 6 até agora.
          </p>
        )}
      </div>

      <p className="text-[11px] text-foreground/60">
        {status.isLoading
          ? "Carregando o estado da pasta…"
          : `${fotosSincronizadas} de ${totalFotos} fotos sincronizadas${
              videosSincronizados ? ` · ${videosSincronizados} vídeo(s) sincronizado(s)` : ""
            }${pendentes ? ` · ${pendentes} arquivo(s) aguardando nova tentativa` : ""}. O cadastro foi salvo; a sincronização continua em segundo plano.`}
      </p>
    </div>
  );
}
