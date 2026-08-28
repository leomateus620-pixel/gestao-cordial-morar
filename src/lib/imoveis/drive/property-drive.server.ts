// SERVER ONLY. Toda a conversa com a Google Drive API da Etapa 8 vive aqui.
// Reutiliza a conexão de workspace já existente (mesmo gateway/credenciais do
// módulo Aluguéis) — nenhuma segunda autenticação, nenhum token no navegador.

import { DRIVE_ENDPOINTS, driveFetch, driveJson } from "@/lib/google-drive/drive.server";
import {
  DRIVE_SUBFOLDERS,
  buildDriveFileName,
  buildFilePrefix,
  buildPropertyDriveFolderName,
  classifyOrientation,
  type DriveCategory,
} from "./naming";

const { api: DRIVE_API, upload: DRIVE_UPLOAD } = DRIVE_ENDPOINTS;
const ALL_DRIVES = "supportsAllDrives=true&includeItemsFromAllDrives=true";
export const ROOT_SETTING_KEY = "property_drive_root";
const IMAGE_BUCKET = "property-images";
const VIDEO_BUCKET = "property-videos";
/** Acima disso o upload vai por sessão resumível com checkpoint. */
const RESUMABLE_THRESHOLD = 5 * 1024 * 1024;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export type RootConfig = {
  id: string;
  name?: string | null;
  url?: string | null;
  configuredAt?: string | null;
  configuredBy?: string | null;
};

export type RootValidation = {
  status: "connected" | "not_found" | "no_permission" | "disconnected";
  folderId: string | null;
  name: string | null;
  url: string | null;
  message: string | null;
};

// ============ Configuração da raiz ============

export async function readRootConfig(admin: Admin): Promise<RootConfig | null> {
  const { data } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", ROOT_SETTING_KEY)
    .maybeSingle();
  const raw = (data as { value?: unknown } | null)?.value;
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  return typeof value.id === "string"
    ? {
        id: value.id,
        name: (value.name as string) ?? null,
        url: (value.url as string) ?? null,
        configuredAt: (value.configured_at as string) ?? null,
        configuredBy: (value.configured_by as string) ?? null,
      }
    : null;
}

export async function writeRootConfig(admin: Admin, config: RootConfig): Promise<void> {
  const { error } = await admin.from("app_settings").upsert(
    {
      key: ROOT_SETTING_KEY,
      value: {
        id: config.id,
        name: config.name ?? null,
        url: config.url ?? null,
        configured_at: config.configuredAt ?? new Date().toISOString(),
        configured_by: config.configuredBy ?? null,
      },
    } as never,
    { onConflict: "key" },
  );
  if (error) throw new Error(error.message);
}

/** Confere existência, permissão de escrita e capacidade de criar subpastas. */
export async function validateRootFolder(folderId: string): Promise<RootValidation> {
  let res: Response;
  try {
    res = await driveFetch(
      `${DRIVE_API}/files/${encodeURIComponent(folderId)}?${ALL_DRIVES}&fields=id,name,mimeType,trashed,webViewLink,capabilities(canAddChildren)`,
    );
  } catch (error) {
    return {
      status: "disconnected",
      folderId,
      name: null,
      url: null,
      message:
        error instanceof Error && /GOOGLE_DRIVE_API_KEY|LOVABLE_API_KEY/.test(error.message)
          ? "O Google Drive não está conectado ao projeto."
          : "Não foi possível falar com o Google Drive agora.",
    };
  }
  if (res.status === 404) {
    return {
      status: "not_found",
      folderId,
      name: null,
      url: null,
      message: "Pasta não encontrada.",
    };
  }
  if (res.status === 401 || res.status === 403) {
    return {
      status: "no_permission",
      folderId,
      name: null,
      url: null,
      message: "A conta conectada não tem acesso a esta pasta. É necessário reautorizar o Drive.",
    };
  }
  if (!res.ok) {
    return {
      status: "disconnected",
      folderId,
      name: null,
      url: null,
      message: "Falha ao validar a pasta.",
    };
  }
  const body = (await res.json()) as {
    id: string;
    name: string;
    mimeType: string;
    trashed?: boolean;
    webViewLink?: string;
    capabilities?: { canAddChildren?: boolean };
  };
  if (body.mimeType !== "application/vnd.google-apps.folder" || body.trashed) {
    return {
      status: "not_found",
      folderId,
      name: null,
      url: null,
      message: "O link não aponta para uma pasta ativa.",
    };
  }
  if (body.capabilities?.canAddChildren === false) {
    return {
      status: "no_permission",
      folderId,
      name: body.name,
      url: body.webViewLink ?? null,
      message: "A conta conectada não pode criar pastas aqui. Conceda acesso de editor.",
    };
  }
  return {
    status: "connected",
    folderId: body.id,
    name: body.name,
    url: body.webViewLink ?? `https://drive.google.com/drive/folders/${body.id}`,
    message: null,
  };
}

// ============ Primitivas do Drive ============

async function createFolder(name: string, parentId: string) {
  return driveJson<{ id: string; name: string; webViewLink: string }>(
    `${DRIVE_API}/files?${ALL_DRIVES}&fields=id,name,webViewLink`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentId],
      }),
    },
  );
}

async function getFileMeta(fileId: string) {
  const res = await driveFetch(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?${ALL_DRIVES}&fields=id,name,trashed,mimeType,size,parents,webViewLink`,
  );
  if (!res.ok) return null;
  return (await res.json()) as {
    id: string;
    name: string;
    trashed?: boolean;
    mimeType: string;
    size?: string;
    parents?: string[];
    webViewLink?: string;
  };
}

async function renameFile(fileId: string, name: string) {
  await driveFetch(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?${ALL_DRIVES}&fields=id,name`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    },
  );
}

async function moveFile(fileId: string, newParentId: string, oldParentId?: string | null) {
  const params = new URLSearchParams({ addParents: newParentId, fields: "id,parents" });
  if (oldParentId) params.set("removeParents", oldParentId);
  await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?${ALL_DRIVES}&${params}`, {
    method: "PATCH",
  });
}

/** Pasta existente com o mesmo nome dentro do pai — usada só na criação inicial. */
async function findChildFolder(name: string, parentId: string) {
  const q = `mimeType='application/vnd.google-apps.folder' and name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and trashed=false`;
  const list = await driveJson<{ files: { id: string; name: string; webViewLink: string }[] }>(
    `${DRIVE_API}/files?${ALL_DRIVES}&q=${encodeURIComponent(q)}&fields=files(id,name,webViewLink)&pageSize=1`,
  );
  return list.files[0] ?? null;
}

async function uploadSimple(args: {
  parentId: string;
  name: string;
  mimeType: string;
  bytes: Uint8Array;
}) {
  const boundary = `----lovable-${crypto.randomUUID()}`;
  const enc = new TextEncoder();
  const meta = { name: args.name, parents: [args.parentId] };
  const pre = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
      `--${boundary}\r\nContent-Type: ${args.mimeType}\r\n\r\n`,
  );
  const post = enc.encode(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(pre.length + args.bytes.length + post.length);
  body.set(pre, 0);
  body.set(args.bytes, pre.length);
  body.set(post, pre.length + args.bytes.length);
  const res = await driveFetch(
    `${DRIVE_UPLOAD}/files?uploadType=multipart&${ALL_DRIVES}&fields=id,name,size,parents,webViewLink`,
    {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body: body as unknown as BodyInit,
    },
  );
  if (!res.ok) throw new Error(`Drive upload ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as { id: string; name: string; size?: string };
}

/** Abre a sessão resumível (obrigatória para vídeos e arquivos grandes). */
async function startResumableSession(args: {
  parentId: string;
  name: string;
  mimeType: string;
  size: number;
}): Promise<string> {
  const start = await driveFetch(
    `${DRIVE_UPLOAD}/files?uploadType=resumable&${ALL_DRIVES}&fields=id,name,size`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": args.mimeType,
        "X-Upload-Content-Length": String(args.size),
      },
      body: JSON.stringify({ name: args.name, parents: [args.parentId] }),
    },
  );
  if (!start.ok)
    throw new Error(`Drive resumable init ${start.status}: ${(await start.text()).slice(0, 300)}`);
  const sessionUrl = start.headers.get("location");
  if (!sessionUrl?.startsWith("http"))
    throw new Error("Drive não devolveu a sessão de upload resumível.");
  return sessionUrl;
}

/**
 * Pergunta ao Drive quantos bytes ele já recebeu nesta sessão.
 * Devolve null quando a sessão não vale mais (recomeçar do zero).
 */
async function resumeOffset(sessionUrl: string, total: number): Promise<number | null> {
  const res = await fetch(sessionUrl, {
    method: "PUT",
    headers: { "Content-Range": `bytes */${total}`, "Content-Length": "0" },
  });
  if (res.status === 200 || res.status === 201) return total;
  if (res.status !== 308) return null;
  const range = res.headers.get("range");
  if (!range) return 0;
  const end = Number(range.split("-")[1] ?? "");
  return Number.isFinite(end) ? end + 1 : 0;
}

/** Envia o trecho pendente a partir do checkpoint. */
async function putResumableChunk(args: {
  sessionUrl: string;
  mimeType: string;
  offset: number;
  total: number;
  stream: ReadableStream<Uint8Array>;
}) {
  const put = await fetch(args.sessionUrl, {
    method: "PUT",
    headers: {
      "Content-Type": args.mimeType,
      "Content-Length": String(args.total - args.offset),
      "Content-Range": `bytes ${args.offset}-${Math.max(args.offset, args.total - 1)}/${args.total}`,
    },
    body: args.stream as unknown as BodyInit,
    // @ts-expect-error duplex é exigido pelo runtime ao enviar stream
    duplex: "half",
  });
  if (!put.ok)
    throw new Error(`Drive resumable put ${put.status}: ${(await put.text()).slice(0, 300)}`);
  return (await put.json()) as { id: string; name: string; size?: string };
}


// ============ Estrutura idempotente ============

type PropertyRow = {
  id: string;
  codigo: string | null;
  codigo_cordial: string | null;
  codigo_morar: string | null;
  publish_targets: string[] | null;
  carteira: string | null;
};

function activeProviders(p: PropertyRow): string[] {
  const set = new Set<string>();
  for (const value of [...(p.publish_targets ?? [])]) {
    if (value === "cordial" || value === "morar") set.add(value);
  }
  if (!set.size && (p.carteira === "cordial" || p.carteira === "morar")) set.add(p.carteira);
  return Array.from(set);
}

export function folderNameFor(p: PropertyRow): string {
  return buildPropertyDriveFolderName({
    cordialCode: p.codigo_cordial,
    morarCode: p.codigo_morar,
    providers: activeProviders(p),
    fallback: p.codigo,
  });
}

export function filePrefixFor(p: PropertyRow): string {
  return buildFilePrefix({
    cordialCode: p.codigo_cordial,
    morarCode: p.codigo_morar,
    providers: activeProviders(p),
    fallback: p.codigo,
  });
}

async function loadProperty(admin: Admin, propertyId: string): Promise<PropertyRow> {
  const { data, error } = await admin
    .from("properties")
    .select("id, codigo, codigo_cordial, codigo_morar, publish_targets, carteira")
    .eq("id", propertyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Imóvel não encontrado.");
  return data as unknown as PropertyRow;
}

export type DriveStructure = {
  propertyFolderId: string;
  propertyFolderUrl: string;
  folderName: string;
  folders: Record<DriveCategory, string>;
};

/**
 * Idempotente: devolve a estrutura existente, cria só o que falta e grava cada
 * ID assim que o Drive responde — duplo clique, refresh e retry convergem.
 */
export async function ensurePropertyDriveStructure(
  admin: Admin,
  propertyId: string,
): Promise<DriveStructure> {
  const root = await readRootConfig(admin);
  if (!root?.id) throw new Error("Pasta raiz dos imóveis não configurada no Google Drive.");
  const property = await loadProperty(admin, propertyId);
  const folderName = folderNameFor(property);

  const { data: existingRow } = await admin
    .from("property_drive_folders")
    .select("*")
    .eq("property_id", propertyId)
    .maybeSingle();
  let row = existingRow as {
    property_folder_id: string | null;
    property_folder_url: string | null;
    horizontal_folder_id: string | null;
    vertical_folder_id: string | null;
    videos_folder_id: string | null;
    folder_name: string | null;
  } | null;

  if (!row) {
    // Constraint UNIQUE(property_id) garante uma linha só sob concorrência.
    await admin.from("property_drive_folders").upsert(
      {
        property_id: propertyId,
        root_folder_id: root.id,
        folder_name: folderName,
        status: "pending",
      } as never,
      { onConflict: "property_id" },
    );
    const { data: created } = await admin
      .from("property_drive_folders")
      .select("*")
      .eq("property_id", propertyId)
      .maybeSingle();
    row = created as typeof row;
  }

  // Pasta principal: confirma o ID salvo antes de criar qualquer coisa nova.
  let propertyFolderId = row?.property_folder_id ?? null;
  let propertyFolderUrl = row?.property_folder_url ?? null;
  if (propertyFolderId) {
    const meta = await getFileMeta(propertyFolderId);
    if (!meta || meta.trashed) {
      propertyFolderId = null;
      propertyFolderUrl = null;
    } else if (meta.name !== folderName) {
      // Código mudou: renomeia a MESMA pasta pelo ID.
      await renameFile(propertyFolderId, folderName);
    }
  }
  if (!propertyFolderId) {
    const found = await findChildFolder(folderName, root.id);
    const folder = found ?? (await createFolder(folderName, root.id));
    propertyFolderId = folder.id;
    propertyFolderUrl = folder.webViewLink ?? `https://drive.google.com/drive/folders/${folder.id}`;
    await admin
      .from("property_drive_folders")
      .update({
        property_folder_id: propertyFolderId,
        property_folder_url: propertyFolderUrl,
        folder_name: folderName,
        root_folder_id: root.id,
      } as never)
      .eq("property_id", propertyId);
  } else if (row?.folder_name !== folderName) {
    await admin
      .from("property_drive_folders")
      .update({ folder_name: folderName } as never)
      .eq("property_id", propertyId);
  }

  const columns: Record<
    DriveCategory,
    "horizontal_folder_id" | "vertical_folder_id" | "videos_folder_id"
  > = {
    horizontal: "horizontal_folder_id",
    vertical: "vertical_folder_id",
    video: "videos_folder_id",
  };
  const folders = {} as Record<DriveCategory, string>;
  for (const category of ["horizontal", "vertical", "video"] as DriveCategory[]) {
    const column = columns[category];
    let id = (row?.[column] as string | null) ?? null;
    if (id) {
      const meta = await getFileMeta(id);
      if (!meta || meta.trashed) id = null;
    }
    if (!id) {
      const name = DRIVE_SUBFOLDERS[category];
      const found = await findChildFolder(name, propertyFolderId);
      const folder = found ?? (await createFolder(name, propertyFolderId));
      id = folder.id;
      // Persistência imediata: criação parcial se recupera sem duplicar.
      await admin
        .from("property_drive_folders")
        .update({ [column]: id } as never)
        .eq("property_id", propertyId);
    }
    folders[category] = id;
  }

  await admin
    .from("property_drive_folders")
    .update({
      status: "ready",
      verified_at: new Date().toISOString(),
      last_error_message: null,
    } as never)
    .eq("property_id", propertyId);

  return {
    propertyFolderId,
    propertyFolderUrl:
      propertyFolderUrl ?? `https://drive.google.com/drive/folders/${propertyFolderId}`,
    folderName,
    folders,
  };
}

// ============ Sincronização dos arquivos ============

type ImageRow = {
  id: string;
  file_name: string;
  position: number;
  width: number | null;
  height: number | null;
  orientation_override: string | null;
  processing_status: string;
  processed_storage_path: string | null;
  storage_path: string;
  processed_checksum: string | null;
  content_hash: string | null;
  size_bytes: number | null;
};

type VideoRow = {
  id: string;
  file_name: string;
  position: number;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  checksum: string | null;
};

type DriveFileRow = {
  id: string;
  image_id: string | null;
  video_id: string | null;
  category: string;
  drive_file_id: string | null;
  drive_file_name: string | null;
  source_checksum: string | null;
  sync_status: string;
  retry_count: number;
  verified_at?: string | null;
  resumable_session_url?: string | null;
  resumable_offset?: number | null;
  resumable_expires_at?: string | null;
};

/** Reconfirmação no Drive só depois desta janela: economiza chamadas por lote. */
const REVERIFY_AFTER_MS = 24 * 60 * 60 * 1000;
/** Orçamento de envios por execução: o restante continua no próximo lote. */
const MAX_UPLOADS_PER_RUN = 6;


async function downloadBytes(admin: Admin, bucket: string, path: string): Promise<Uint8Array> {
  const { data, error } = await admin.storage.from(bucket).download(path);
  if (error || !data) throw new Error(error?.message ?? "Arquivo não encontrado no armazenamento.");
  return new Uint8Array(await (data as Blob).arrayBuffer());
}

export type SyncOutcome = {
  folderUrl: string;
  folderName: string;
  totals: Record<DriveCategory, { total: number; synced: number; pending: number; failed: number }>;
  photosComplete: boolean;
  waitingWatermark: boolean;
  /** Sobrou arquivo para o próximo lote (orçamento de envios por execução). */
  hasMore: boolean;
};

/** Orçamento compartilhado entre os arquivos de uma mesma execução. */
type Budget = { remaining: number };

/**
 * Reconcilia o imóvel em blocos: garante a estrutura, cria/atualiza os vínculos
 * de cada mídia ativa e envia apenas o que ainda não está confirmado, até o
 * limite de envios da execução. O restante continua no lote seguinte.
 */
export async function syncPropertyDrive(admin: Admin, propertyId: string): Promise<SyncOutcome> {

  const structure = await ensurePropertyDriveStructure(admin, propertyId);
  const property = await loadProperty(admin, propertyId);
  const prefix = filePrefixFor(property);

  const [{ data: imageRows }, { data: videoRows }, { data: linkRows }] = await Promise.all([
    admin
      .from("property_images")
      .select(
        "id, file_name, position, width, height, orientation_override, processing_status, processed_storage_path, storage_path, processed_checksum, content_hash, size_bytes",
      )
      .eq("property_id", propertyId)
      .order("position", { ascending: true }),
    admin
      .from("property_videos")
      .select("id, file_name, position, storage_path, mime_type, size_bytes, checksum")
      .eq("property_id", propertyId)
      .order("position", { ascending: true }),
    admin.from("property_drive_files").select("*").eq("property_id", propertyId),
  ]);

  const images = (imageRows ?? []) as ImageRow[];
  const videos = (videoRows ?? []) as VideoRow[];
  const links = (linkRows ?? []) as DriveFileRow[];
  const byImage = new Map(links.filter((l) => l.image_id).map((l) => [l.image_id as string, l]));
  const byVideo = new Map(links.filter((l) => l.video_id).map((l) => [l.video_id as string, l]));

  let waitingWatermark = false;
  const counters: Record<
    DriveCategory,
    { total: number; synced: number; pending: number; failed: number }
  > = {
    horizontal: { total: 0, synced: 0, pending: 0, failed: 0 },
    vertical: { total: 0, synced: 0, pending: 0, failed: 0 },
    video: { total: 0, synced: 0, pending: 0, failed: 0 },
  };
  const indexes: Record<DriveCategory, number> = { horizontal: 0, vertical: 0, video: 0 };
  const budget: Budget = { remaining: MAX_UPLOADS_PER_RUN };
  let hasMore = false;


  // -------- Fotos --------
  for (const image of images) {
    const category = classifyOrientation({
      width: image.width,
      height: image.height,
      override: image.orientation_override,
    });
    indexes[category] += 1;
    counters[category].total += 1;
    const index = indexes[category];
    const link = byImage.get(image.id) ?? null;

    // A versão que vai ao Drive é sempre a processada com marca.
    const ready = image.processing_status === "ready" || image.processing_status === "legacy";
    const sourcePath =
      image.processed_storage_path ??
      (image.processing_status === "legacy" ? image.storage_path : null);
    if (!ready || !sourcePath) {
      waitingWatermark = true;
      counters[category].pending += 1;
      if (!link) {
        await admin.from("property_drive_files").insert({
          property_id: propertyId,
          image_id: image.id,
          category,
          sync_status: "pending",
        } as never);
      }
      continue;
    }

    const checksum = image.processed_checksum ?? image.content_hash ?? null;
    const name = buildDriveFileName({
      prefix,
      category,
      index,
      mimeType: "image/jpeg",
      originalName: image.file_name,
    });

    const outcome = await syncOneFile(admin, {
      propertyId,
      link,
      insert: { image_id: image.id },
      category,
      folderId: structure.folders[category],
      name,
      checksum,
      bucket: IMAGE_BUCKET,
      path: sourcePath,
      mimeType: "image/jpeg",
      size: image.size_bytes ?? null,
      budget,
    });
    if (outcome === "deferred") {
      hasMore = true;
      counters[category].pending += 1;
      continue;
    }
    counters[category][outcome] += 1;
  }


  // -------- Vídeos --------
  for (const video of videos) {
    indexes.video += 1;
    counters.video.total += 1;
    const link = byVideo.get(video.id) ?? null;
    const mimeType = video.mime_type ?? "video/mp4";
    const name = buildDriveFileName({
      prefix,
      category: "video",
      index: indexes.video,
      mimeType,
      originalName: video.file_name,
    });
    const outcome = await syncOneFile(admin, {
      propertyId,
      link,
      insert: { video_id: video.id },
      category: "video",
      folderId: structure.folders.video,
      name,
      checksum: video.checksum,
      bucket: VIDEO_BUCKET,
      path: video.storage_path,
      mimeType,
      size: video.size_bytes ?? null,
      budget,
    });
    if (outcome === "deferred") {
      hasMore = true;
      counters.video.pending += 1;
      continue;
    }
    counters.video[outcome] += 1;
  }

  const photosComplete =
    counters.horizontal.total + counters.vertical.total > 0 &&
    counters.horizontal.pending + counters.horizontal.failed === 0 &&
    counters.vertical.pending + counters.vertical.failed === 0 &&
    !waitingWatermark;

  return {
    folderUrl: structure.propertyFolderUrl,
    folderName: structure.folderName,
    totals: counters,
    photosComplete,
    waitingWatermark,
    hasMore,
  };
}


/** Envia (ou confirma) um arquivo. Nunca reenvia o que já está confirmado. */
async function syncOneFile(
  admin: Admin,
  args: {
    propertyId: string;
    link: DriveFileRow | null;
    insert: { image_id?: string; video_id?: string };
    category: DriveCategory;
    folderId: string;
    name: string;
    checksum: string | null;
    bucket: string;
    path: string;
    mimeType: string;
    size: number | null;
    budget: Budget;
  },
): Promise<"synced" | "pending" | "failed" | "deferred"> {
  let link = args.link;
  if (!link) {
    const { data } = await admin
      .from("property_drive_files")
      .insert({
        property_id: args.propertyId,
        ...args.insert,
        category: args.category,
        sync_status: "pending",
      } as never)
      .select("*")
      .maybeSingle();
    link = (data as DriveFileRow) ?? null;
  }
  if (!link) return "failed";

  if (link.sync_status === "failed_permanent") return "failed";

  const confirmed =
    link.drive_file_id && link.sync_status === "synced" && link.source_checksum === args.checksum;

  // Confirmado e reconferido há pouco, com nome/categoria iguais: nada a fazer.
  if (
    confirmed &&
    link.drive_file_name === args.name &&
    link.category === args.category &&
    link.verified_at &&
    Date.now() - new Date(link.verified_at).getTime() < REVERIFY_AFTER_MS
  ) {
    return "synced";
  }

  // Já confirmado: só corrige nome/pasta/categoria quando o cadastro mudou.
  const confirmedId = link.drive_file_id;
  if (confirmed && confirmedId) {
    const meta = await getFileMeta(confirmedId);
    if (meta && !meta.trashed) {
      if (meta.name !== args.name) await renameFile(confirmedId, args.name);
      const parent = meta.parents?.[0];
      if (parent && parent !== args.folderId) await moveFile(confirmedId, args.folderId, parent);
      await admin
        .from("property_drive_files")
        .update({
          drive_file_name: args.name,
          category: args.category,
          verified_at: new Date().toISOString(),
        } as never)
        .eq("id", link.id);
      return "synced";
    }
  }

  // Orçamento da execução esgotado: o arquivo continua no próximo lote.
  if (args.budget.remaining <= 0) return "deferred";
  args.budget.remaining -= 1;

  try {
    await admin
      .from("property_drive_files")
      .update({ sync_status: "uploading", category: args.category } as never)
      .eq("id", link.id);


    let uploaded: { id: string; name: string; size?: string };
    const size = args.size ?? 0;
    if (size > RESUMABLE_THRESHOLD || args.category === "video") {
      const { data: signed, error } = await admin.storage
        .from(args.bucket)
        .createSignedUrl(args.path, 900);
      if (error || !signed?.signedUrl) throw new Error(error?.message ?? "Arquivo indisponível.");

      // Sessão anterior ainda válida: retoma do último byte confirmado.
      const savedSession =
        link.resumable_session_url &&
        link.resumable_expires_at &&
        new Date(link.resumable_expires_at).getTime() > Date.now()
          ? link.resumable_session_url
          : null;

      const head = await fetch(signed.signedUrl, { method: "HEAD" });
      const total = Number(head.headers.get("content-length") ?? size);
      if (!total) throw new Error("Tamanho do arquivo desconhecido.");

      let sessionUrl = savedSession;
      let offset = 0;
      if (sessionUrl) {
        const resumed = await resumeOffset(sessionUrl, total);
        if (resumed === null) sessionUrl = null;
        else if (resumed >= total) {
          // Google já recebeu tudo: confirma pelo próprio status da sessão.
          sessionUrl = null;
        } else offset = resumed;
      }

      if (!sessionUrl) {
        // Substituição da mesma mídia: revisa o arquivo existente em vez de duplicar.
        if (link.drive_file_id) {
          try {
            await driveFetch(
              `${DRIVE_API}/files/${encodeURIComponent(link.drive_file_id)}?${ALL_DRIVES}`,
              {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ trashed: true }),
              },
            );
          } catch {
            // segue: o arquivo novo é a referência autoritativa
          }
        }
        sessionUrl = await startResumableSession({
          parentId: args.folderId,
          name: args.name,
          mimeType: args.mimeType,
          size: total,
        });
        offset = 0;
        await admin
          .from("property_drive_files")
          .update({
            resumable_session_url: sessionUrl,
            resumable_offset: 0,
            // Sessões resumíveis do Drive valem cerca de uma semana.
            resumable_expires_at: new Date(Date.now() + 6 * 24 * 3600 * 1000).toISOString(),
          } as never)
          .eq("id", link.id);
      } else {
        await admin
          .from("property_drive_files")
          .update({ resumable_offset: offset } as never)
          .eq("id", link.id);
      }

      const rangeRes = await fetch(signed.signedUrl, {
        headers: offset > 0 ? { Range: `bytes=${offset}-` } : {},
      });
      if (!rangeRes.ok || !rangeRes.body) throw new Error("Falha ao ler o arquivo do armazenamento.");
      uploaded = await putResumableChunk({
        sessionUrl,
        mimeType: args.mimeType,
        offset,
        total,
        stream: rangeRes.body as ReadableStream<Uint8Array>,
      });
      await admin
        .from("property_drive_files")
        .update({
          resumable_session_url: null,
          resumable_offset: 0,
          resumable_expires_at: null,
        } as never)
        .eq("id", link.id);
    } else {

      const bytes = await downloadBytes(admin, args.bucket, args.path);
      if (link.drive_file_id) {
        const res = await driveFetch(
          `${DRIVE_UPLOAD}/files/${encodeURIComponent(link.drive_file_id)}?uploadType=media&${ALL_DRIVES}&fields=id,name,size`,
          {
            method: "PATCH",
            headers: { "Content-Type": args.mimeType },
            body: bytes as unknown as BodyInit,
          },
        );
        if (res.ok) {
          uploaded = (await res.json()) as { id: string; name: string; size?: string };
          await renameFile(uploaded.id, args.name);
        } else {
          uploaded = await uploadSimple({
            parentId: args.folderId,
            name: args.name,
            mimeType: args.mimeType,
            bytes,
          });
        }
      } else {
        uploaded = await uploadSimple({
          parentId: args.folderId,
          name: args.name,
          mimeType: args.mimeType,
          bytes,
        });
      }
    }

    // O ID é persistido antes de qualquer marcação de sucesso.
    await admin
      .from("property_drive_files")
      .update({
        drive_file_id: uploaded.id,
        drive_file_name: args.name,
        sync_status: "verifying",
        mime_type: args.mimeType,
        uploaded_at: new Date().toISOString(),
      } as never)
      .eq("id", link.id);

    const meta = await getFileMeta(uploaded.id);
    const parentOk = !meta?.parents || meta.parents.includes(args.folderId);
    if (!meta || meta.trashed || !parentOk) throw new Error("Arquivo não confirmado no Drive.");

    await admin
      .from("property_drive_files")
      .update({
        sync_status: "synced",
        source_checksum: args.checksum,
        size_bytes: meta.size ? Number(meta.size) : args.size,
        verified_at: new Date().toISOString(),
        last_error_code: null,
        last_error_message: null,
      } as never)
      .eq("id", link.id);
    return "synced";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const retries = (link.retry_count ?? 0) + 1;
    const permanent = retries >= 5;
    await admin
      .from("property_drive_files")
      .update({
        sync_status: permanent ? "failed_permanent" : "failed_retryable",
        retry_count: retries,
        last_error_code: permanent ? "max_retries" : "upload_failed",
        last_error_message: message.slice(0, 400),
      } as never)
      .eq("id", link.id);
    return "failed";
  }
}

// ============ Fila ============

export async function enqueueDriveJob(admin: Admin, propertyId: string): Promise<void> {
  const { data: active } = await admin
    .from("property_drive_jobs")
    .select("id")
    .eq("property_id", propertyId)
    .in("status", ["pending", "processing", "retry"])
    .maybeSingle();
  if (active) return;
  await admin.from("property_drive_jobs").insert({ property_id: propertyId } as never);
}

export async function runDriveWorker(
  admin: Admin,
  options: { limit?: number } = {},
): Promise<{ claimed: number; synced: number; failed: number }> {
  const worker = `drive-${crypto.randomUUID().slice(0, 8)}`;
  const { data: jobs, error } = await admin.rpc("property_drive_claim_jobs", {
    _worker: worker,
    _limit: Math.min(3, Math.max(1, options.limit ?? 2)),
    _lease_seconds: 240,
  });
  if (error) throw new Error(error.message);
  const list = (jobs ?? []) as Array<{
    id: string;
    property_id: string;
    attempts: number;
    max_attempts: number;
  }>;
  let synced = 0;
  let failed = 0;

  for (const job of list) {
    try {
      const result = await syncPropertyDrive(admin, job.property_id);
      const stillPending =
        result.waitingWatermark ||
        result.hasMore ||
        (["horizontal", "vertical", "video"] as DriveCategory[]).some(
          (c) => result.totals[c].pending > 0,
        );
      if (stillPending && job.attempts < job.max_attempts) {
        // hasMore = sobrou lote; waiting = a marca ainda está sendo aplicada.
        // Em nenhum dos casos o original sem marca sobe ao Drive.
        const delay = result.hasMore ? 2_000 : 20_000 * Math.max(1, job.attempts);
        await admin
          .from("property_drive_jobs")
          .update({
            status: "retry",
            run_after: new Date(Date.now() + delay).toISOString(),
            lease_expires_at: null,
            // Continuar o mesmo lote não consome tentativa: só falha real consome.
            attempts: result.hasMore ? Math.max(0, job.attempts - 1) : job.attempts,
            // Continuar de onde parou é responsabilidade do próprio vínculo
            // de cada arquivo (drive_file_id + checkpoint resumível).
            cursor: { has_more: result.hasMore, at: new Date().toISOString() },
          } as never)
          .eq("id", job.id);

      } else {

        await admin
          .from("property_drive_jobs")
          .update({ status: "succeeded", lease_expires_at: null } as never)
          .eq("id", job.id);
      }
      await applyDriveChecklist(admin, job.property_id, result);
      synced += 1;
    } catch (e) {
      failed += 1;
      const message = e instanceof Error ? e.message : String(e);
      const terminal = job.attempts >= job.max_attempts;
      await admin
        .from("property_drive_jobs")
        .update({
          status: terminal ? "failed" : "retry",
          run_after: new Date(Date.now() + 30_000 * Math.pow(2, job.attempts)).toISOString(),
          lease_expires_at: null,
          last_error_code: terminal ? "max_attempts" : "sync_failed",
          last_error_message: message.slice(0, 400),
        } as never)
        .eq("id", job.id);
      await admin
        .from("property_drive_folders")
        .update({
          status: terminal ? "error" : "pending",
          last_error_message: message.slice(0, 400),
        } as never)
        .eq("property_id", job.property_id);
    }
  }

  return { claimed: list.length, synced, failed };
}

// ============ Checklist do agenciamento ============

/**
 * "Fotos enviadas ao Drive" só fecha quando todas as fotos ativas estão
 * confirmadas. Evento repetido não reescreve nem duplica histórico.
 */
export async function applyDriveChecklist(
  admin: Admin,
  propertyId: string,
  result: SyncOutcome,
): Promise<void> {
  if (!result.photosComplete) return;
  const { data: rows } = await admin
    .from("agenciamentos")
    .select("id, corretor_id, fotos_drive, video_realizado, endereco")
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false })
    .limit(1);
  const agenciamento = (rows ?? [])[0] as
    | {
        id: string;
        corretor_id: string | null;
        fotos_drive: boolean;
        video_realizado: boolean;
        endereco: string | null;
      }
    | undefined;
  if (!agenciamento || agenciamento.fotos_drive) return;

  const patch: Record<string, unknown> = { fotos_drive: true };
  // Vídeo tem regra própria: só marca quando existir vídeo confirmado.
  if (
    !agenciamento.video_realizado &&
    result.totals.video.total > 0 &&
    result.totals.video.synced === result.totals.video.total
  ) {
    patch.video_realizado = true;
  }
  await admin
    .from("agenciamentos")
    .update(patch as never)
    .eq("id", agenciamento.id);

  if (agenciamento.corretor_id) {
    try {
      await admin.from("notifications").insert({
        user_id: agenciamento.corretor_id,
        tipo: "agenciamento",
        category: "agenciamentos",
        titulo: "Fotos enviadas ao Drive",
        mensagem: `As fotos do imóvel ${result.folderName} já estão organizadas na pasta compartilhada.`,
        entity_type: "agenciamento",
        entity_id: agenciamento.id,
        dedup_key: `drive-photos:${propertyId}`,
      } as never);
    } catch {
      // dedup_key já existente: nada a fazer
    }
  }
}
