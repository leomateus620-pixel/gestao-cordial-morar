import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  DRIVE_SUBFOLDERS,
  buildPropertyDriveFolderName,
  classifyOrientation,
  parseDriveFolderId,
  type DriveCategory,
} from "./naming";

const VIDEO_BUCKET = "property-videos";
export const ACCEPTED_VIDEO_MIME = ["video/mp4", "video/quicktime", "video/webm"];
const MAX_VIDEO_BYTES = 500 * 1024 * 1024;

export type DriveCategoryState = {
  category: DriveCategory;
  label: string;
  total: number;
  synced: number;
  uploading: number;
  failed: number;
  status: "aguardando" | "preparando" | "enviando" | "concluido" | "pendencias" | "erro";
};

export type PropertyDriveStatus = {
  connected: boolean;
  connectionMessage: string | null;
  rootConfigured: boolean;
  folderName: string;
  folderUrl: string | null;
  folderReady: boolean;
  queueActive: boolean;
  cordialCode: string | null;
  morarCode: string | null;
  providers: string[];
  categories: DriveCategoryState[];
  videos: Array<{ id: string; fileName: string; sizeBytes: number | null; status: string }>;
  photos: Array<{ id: string; fileName: string; category: DriveCategory; status: string; error: string | null }>;
  lastError: string | null;
};

function categoryState(
  category: DriveCategory,
  items: Array<{ sync_status: string }>,
  totalMedia: number,
): DriveCategoryState {
  const synced = items.filter((i) => i.sync_status === "synced").length;
  const uploading = items.filter((i) => i.sync_status === "uploading" || i.sync_status === "verifying").length;
  const failed = items.filter((i) => i.sync_status.startsWith("failed")).length;
  let status: DriveCategoryState["status"] = "aguardando";
  if (totalMedia === 0) status = "aguardando";
  else if (failed && synced + failed >= totalMedia) status = synced ? "pendencias" : "erro";
  else if (uploading) status = "enviando";
  else if (synced >= totalMedia && totalMedia > 0) status = "concluido";
  else if (items.length) status = "preparando";
  return {
    category,
    label: DRIVE_SUBFOLDERS[category],
    total: totalMedia,
    synced,
    uploading,
    failed,
    status,
  };
}

async function kickDriveWorker() {
  try {
    const secret = process.env["PROPERTY_SYNC_WORKER_SECRET"] ?? process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!secret) return;
    const request = getRequest();
    const origin = request?.url ? new URL(request.url).origin : null;
    if (!origin) return;
    await fetch(`${origin}/api/public/hooks/property-drive-worker`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: secret },
      body: JSON.stringify({ limit: 2 }),
    });
  } catch {
    // a fila persistente garante a retomada
  }
}

// ============ Configuração administrativa da raiz ============

export const getPropertyDriveRoot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { readRootConfig, validateRootFolder } = await import("./property-drive.server");
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    const config = await readRootConfig(supabaseAdmin);
    if (!config?.id) {
      return {
        canManage: !!isAdmin,
        configured: false,
        status: "not_found" as const,
        folderName: null as string | null,
        folderUrl: null as string | null,
        message: "Nenhuma pasta raiz configurada.",
        configuredAt: null as string | null,
      };
    }
    const validation = await validateRootFolder(config.id);
    return {
      canManage: !!isAdmin,
      configured: true,
      status: validation.status,
      folderName: validation.name ?? config.name ?? null,
      folderUrl: validation.url ?? config.url ?? null,
      message: validation.message,
      configuredAt: config.configuredAt ?? null,
    };
  });

export const setPropertyDriveRoot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { link: string }) => {
    const folderId = parseDriveFolderId(data?.link ?? "");
    if (!folderId) throw new Error("Informe um link válido de pasta do Google Drive.");
    return { folderId };
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Apenas administradores configuram a pasta raiz.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { validateRootFolder, writeRootConfig } = await import("./property-drive.server");
    const validation = await validateRootFolder(data.folderId);
    if (validation.status !== "connected") {
      return { ok: false as const, status: validation.status, message: validation.message };
    }
    await writeRootConfig(supabaseAdmin, {
      id: validation.folderId as string,
      name: validation.name,
      url: validation.url,
      configuredAt: new Date().toISOString(),
      configuredBy: context.userId,
    });
    return { ok: true as const, status: validation.status, message: null, folderName: validation.name };
  });

// ============ Estado da Etapa 8 ============

export const getPropertyDriveStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { propertyId: string }) => data)
  .handler(async ({ data, context }): Promise<PropertyDriveStatus> => {
    const { data: propertyRow, error } = await context.supabase
      .from("properties")
      .select("id, codigo, codigo_cordial, codigo_morar, providers, publish_targets, carteira")
      .eq("id", data.propertyId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!propertyRow) throw new Error("Imóvel não encontrado ou sem permissão.");
    const property = propertyRow as {
      codigo: string | null;
      codigo_cordial: string | null;
      codigo_morar: string | null;
      providers: string[] | null;
      publish_targets: string[] | null;
      carteira: string | null;
    };

    const providers = Array.from(
      new Set(
        [...(property.publish_targets ?? []), ...(property.providers ?? [])].filter(
          (p) => p === "cordial" || p === "morar",
        ),
      ),
    );
    if (!providers.length && (property.carteira === "cordial" || property.carteira === "morar")) {
      providers.push(property.carteira);
    }

    const [{ data: images }, { data: videos }, { data: files }, { data: folder }, { data: jobs }] =
      await Promise.all([
        context.supabase
          .from("property_images")
          .select("id, file_name, width, height, orientation_override, processing_status, position")
          .eq("property_id", data.propertyId)
          .order("position", { ascending: true }),
        context.supabase
          .from("property_videos")
          .select("id, file_name, size_bytes, upload_status, position")
          .eq("property_id", data.propertyId)
          .order("position", { ascending: true }),
        context.supabase
          .from("property_drive_files")
          .select("id, image_id, video_id, category, sync_status, last_error_message")
          .eq("property_id", data.propertyId),
        context.supabase
          .from("property_drive_folders")
          .select("property_folder_url, folder_name, status, last_error_message")
          .eq("property_id", data.propertyId)
          .maybeSingle(),
        context.supabase
          .from("property_drive_jobs")
          .select("id")
          .eq("property_id", data.propertyId)
          .in("status", ["pending", "processing", "retry"]),
      ]);

    const imageRows = (images ?? []) as Array<{
      id: string;
      file_name: string;
      width: number | null;
      height: number | null;
      orientation_override: string | null;
      processing_status: string;
    }>;
    const videoRows = (videos ?? []) as Array<{
      id: string;
      file_name: string;
      size_bytes: number | null;
      upload_status: string;
    }>;
    const fileRows = (files ?? []) as Array<{
      id: string;
      image_id: string | null;
      video_id: string | null;
      category: string;
      sync_status: string;
      last_error_message: string | null;
    }>;
    const byImage = new Map(fileRows.filter((f) => f.image_id).map((f) => [f.image_id as string, f]));
    const byVideo = new Map(fileRows.filter((f) => f.video_id).map((f) => [f.video_id as string, f]));

    const photos = imageRows.map((image) => {
      const category = classifyOrientation({
        width: image.width,
        height: image.height,
        override: image.orientation_override,
      });
      const link = byImage.get(image.id);
      return {
        id: image.id,
        fileName: image.file_name,
        category: category as DriveCategory,
        status:
          link?.sync_status ??
          (image.processing_status === "ready" || image.processing_status === "legacy"
            ? "pending"
            : "aguardando_marca"),
        error: link?.last_error_message ?? null,
      };
    });

    const categories: DriveCategoryState[] = (["horizontal", "vertical", "video"] as DriveCategory[]).map(
      (category) => {
        if (category === "video") {
          const items = videoRows.map((v) => byVideo.get(v.id) ?? { sync_status: "pending" });
          return categoryState(category, items, videoRows.length);
        }
        const inCategory = photos.filter((p) => p.category === category);
        const items = inCategory.map((p) => ({ sync_status: p.status }));
        return categoryState(category, items, inCategory.length);
      },
    );

    let connected = true;
    let connectionMessage: string | null = null;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { readRootConfig } = await import("./property-drive.server");
    const root = await readRootConfig(supabaseAdmin);
    if (!root?.id) {
      connected = false;
      connectionMessage = "A pasta raiz dos imóveis ainda não foi configurada nas Configurações.";
    }

    const folderRow = folder as {
      property_folder_url: string | null;
      folder_name: string | null;
      status: string;
      last_error_message: string | null;
    } | null;

    return {
      connected,
      connectionMessage,
      rootConfigured: !!root?.id,
      folderName:
        folderRow?.folder_name ??
        buildPropertyDriveFolderName({
          cordialCode: property.codigo_cordial,
          morarCode: property.codigo_morar,
          providers,
          fallback: property.codigo,
        }),
      folderUrl: folderRow?.property_folder_url ?? null,
      folderReady: folderRow?.status === "ready" && !!folderRow.property_folder_url,
      queueActive: ((jobs ?? []) as unknown[]).length > 0,
      cordialCode: property.codigo_cordial,
      morarCode: property.codigo_morar,
      providers,
      categories,
      videos: videoRows.map((v) => ({
        id: v.id,
        fileName: v.file_name,
        sizeBytes: v.size_bytes,
        status: byVideo.get(v.id)?.sync_status ?? "pending",
      })),
      photos,
      lastError: folderRow?.last_error_message ?? null,
    };
  });

/** Cria a estrutura e enfileira a sincronização. Idempotente por imóvel. */
export const syncPropertyDriveNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { propertyId: string }) => data)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("properties")
      .select("id")
      .eq("id", data.propertyId)
      .maybeSingle();
    if (error) throw new Error(error.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ensurePropertyDriveStructure, enqueueDriveJob } = await import("./property-drive.server");
    const structure = await ensurePropertyDriveStructure(supabaseAdmin, data.propertyId);
    await enqueueDriveJob(supabaseAdmin, data.propertyId);
    await kickDriveWorker();
    return { folderUrl: structure.propertyFolderUrl, folderName: structure.folderName };
  });

export const retryPropertyDriveFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { propertyId: string; category?: DriveCategory; fileId?: string }) => data)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { enqueueDriveJob } = await import("./property-drive.server");
    let query = supabaseAdmin
      .from("property_drive_files")
      .update({ sync_status: "pending", retry_count: 0, last_error_code: null, last_error_message: null } as never)
      .eq("property_id", data.propertyId);
    if (data.fileId) query = query.eq("id", data.fileId);
    if (data.category) query = query.eq("category", data.category);
    if (!data.fileId && !data.category) query = query.like("sync_status", "failed%");
    await query;
    await enqueueDriveJob(supabaseAdmin, data.propertyId);
    await kickDriveWorker();
    return { ok: true };
  });

/** Correção manual da orientação: move o vínculo, nunca duplica o arquivo. */
export const setPropertyImageOrientation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { propertyId: string; imageId: string; orientation: "horizontal" | "vertical" | null }) => data)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("property_images")
      .update({ orientation_override: data.orientation })
      .eq("id", data.imageId)
      .eq("property_id", data.propertyId);
    if (error) throw new Error(error.message);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("property_drive_files")
      .update({ category: data.orientation ?? "horizontal" } as never)
      .eq("image_id", data.imageId);
    return { ok: true };
  });

// ============ Vídeos ============

export const createPropertyVideoUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { propertyId: string; fileName: string; mimeType: string; sizeBytes: number }) => {
    if (!ACCEPTED_VIDEO_MIME.includes(data.mimeType)) throw new Error("Formato de vídeo não suportado.");
    if (data.sizeBytes > MAX_VIDEO_BYTES) throw new Error("O vídeo excede o limite de 500 MB.");
    return data;
  })
  .handler(async ({ data, context }) => {
    const safe = data.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
    const path = `${data.propertyId}/videos/${crypto.randomUUID()}-${safe}`;
    const { data: signed, error } = await context.supabase.storage
      .from(VIDEO_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !signed) throw new Error(error?.message ?? "Falha ao preparar o envio do vídeo.");
    return { path: signed.path, token: signed.token };
  });

export const registerPropertyVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      propertyId: string;
      storagePath: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
      checksum?: string | null;
    }) => {
      if (!ACCEPTED_VIDEO_MIME.includes(data.mimeType)) throw new Error("Formato de vídeo não suportado.");
      return data;
    },
  )
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("property_videos")
      .select("id, position")
      .eq("property_id", data.propertyId);
    const rows = (existing ?? []) as Array<{ position: number }>;
    const position = rows.length ? Math.max(...rows.map((r) => r.position)) + 1 : 0;
    const { error } = await context.supabase.from("property_videos").insert({
      property_id: data.propertyId,
      storage_path: data.storagePath,
      file_name: data.fileName,
      mime_type: data.mimeType,
      size_bytes: data.sizeBytes,
      checksum: data.checksum ?? null,
      position,
      uploaded_by: context.userId,
    });
    if (error) throw new Error(error.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { enqueueDriveJob } = await import("./property-drive.server");
    await enqueueDriveJob(supabaseAdmin, data.propertyId);
    await kickDriveWorker();
    return { ok: true };
  });

export const deletePropertyVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { propertyId: string; videoId: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("property_videos")
      .select("storage_path")
      .eq("id", data.videoId)
      .eq("property_id", data.propertyId)
      .maybeSingle();
    const { error } = await context.supabase
      .from("property_videos")
      .delete()
      .eq("id", data.videoId)
      .eq("property_id", data.propertyId);
    if (error) throw new Error(error.message);
    const path = (row as { storage_path?: string } | null)?.storage_path;
    if (path) await context.supabase.storage.from(VIDEO_BUCKET).remove([path]);
    // O arquivo já confirmado no Drive é histórico: não é apagado aqui.
    return { ok: true };
  });
