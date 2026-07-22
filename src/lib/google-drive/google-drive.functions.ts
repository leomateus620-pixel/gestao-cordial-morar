import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ============ Connection management ============

export const startGoogleDriveOAuth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { signState, buildAuthUrl } = await import("./drive.server");
    const req = getRequest();
    const origin = new URL(req.url).origin;
    const state = signState({ userId: context.userId, origin });
    return { url: buildAuthUrl(state, origin) };
  });

export const getMyDriveConnection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("google_drive_connections")
      .select("google_email,scope,last_error,created_at,updated_at,expires_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    return data;
  });

export const disconnectGoogleDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { revokeToken, logAudit } = await import("./drive.server");
    const { data: conn } = await supabaseAdmin
      .from("google_drive_connections")
      .select("refresh_token,access_token")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (conn) {
      const row = conn as unknown as { refresh_token: string; access_token: string };
      await revokeToken(row.refresh_token || row.access_token);
      await supabaseAdmin
        .from("google_drive_connections")
        .delete()
        .eq("user_id", context.userId);
      await logAudit({
        userId: context.userId,
        action: "disconnect_account",
        result: "ok",
      });
    }
    return { ok: true };
  });

// ============ Rental folder + sync ============

async function assertContractManageable(supabase: any, contractId: string) {
  const { data, error } = await supabase
    .from("rental_contracts")
    .select("id, property:rental_properties(logradouro,numero,bairro,cidade,uf), tenant:rental_tenants(nome)")
    .eq("id", contractId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Contrato não encontrado ou sem permissão.");
  return data;
}

export const getRentalDriveFolder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { contractId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("rental_drive_folders")
      .select(
        "contract_id,folder_id,folder_name,folder_url,google_email,sync_enabled,sync_status,last_synced_at,last_error,owner_user_id",
      )
      .eq("contract_id", data.contractId)
      .maybeSingle();
    return row;
  });

export const enableRentalDriveSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { contractId: string }) => d)
  .handler(async ({ data, context }) => {
    const {
      withAccessToken,
      buildFolderName,
      ensureFolder,
      logAudit,
      getConnectionForUser,
    } = await import("./drive.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const contract = await assertContractManageable(context.supabase, data.contractId);
    const conn = await getConnectionForUser(context.userId);
    if (!conn) throw new Error("Conecte sua conta Google Drive nas Configurações antes.");

    const address = [
      contract.property?.logradouro,
      contract.property?.numero,
      contract.property?.bairro,
      contract.property?.cidade,
    ]
      .filter(Boolean)
      .join(", ");
    const folderName = buildFolderName({
      address,
      tenantName: contract.tenant?.nome ?? "Locatário",
      contractId: data.contractId,
    });

    try {
      const folder = await withAccessToken(context.userId, (t) => ensureFolder(t, folderName));
      const { error: upErr } = await supabaseAdmin.from("rental_drive_folders").upsert(
        {
          contract_id: data.contractId,
          folder_id: folder.id,
          folder_name: folder.name,
          folder_url: folder.webViewLink,
          owner_user_id: context.userId,
          google_email: conn.google_email,
          sync_enabled: true,
          sync_status: "synced",
          last_synced_at: new Date().toISOString(),
          last_error: null,
        },
        { onConflict: "contract_id" },
      );
      if (upErr) throw new Error(upErr.message);
      await logAudit({
        contractId: data.contractId,
        userId: context.userId,
        action: "folder_ensure",
        result: "ok",
        destination: folder.id,
      });
      return {
        folderId: folder.id,
        folderUrl: folder.webViewLink,
        folderName: folder.name,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await logAudit({
        contractId: data.contractId,
        userId: context.userId,
        action: "folder_ensure",
        result: "error",
        error: msg,
      });
      throw e;
    }
  });

export const disableRentalDriveSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { contractId: string; trash?: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { withAccessToken, moveToTrash, logAudit } = await import("./drive.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: folder } = await supabaseAdmin
      .from("rental_drive_folders")
      .select("folder_id,owner_user_id")
      .eq("contract_id", data.contractId)
      .maybeSingle();
    const row = folder as unknown as { folder_id: string; owner_user_id: string } | null;
    if (row && data.trash) {
      try {
        await withAccessToken(row.owner_user_id, (t) => moveToTrash(t, row.folder_id));
      } catch (e) {
        console.error("[disableRentalDriveSync] trash falhou:", e);
      }
    }
    await supabaseAdmin
      .from("rental_drive_folders")
      .delete()
      .eq("contract_id", data.contractId);
    // Reset all docs of this contract to cloud_only.
    await supabaseAdmin
      .from("rental_contract_documents")
      .update({ drive_sync_status: "not_enabled" })
      .eq("contract_id", data.contractId);
    await logAudit({
      contractId: data.contractId,
      userId: context.userId,
      action: data.trash ? "folder_trash" : "folder_detach",
      result: "ok",
    });
    return { ok: true };
  });

/**
 * Best-effort sync of one document to Drive. Fetches the file from the
 * rental-documents bucket (server-side using service role since RLS check
 * already happened by contract access) and uploads to the pinned folder.
 */
export const syncRentalDocumentToDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { documentId: string }) => d)
  .handler(async ({ data, context }) => {
    const { withAccessToken, uploadFile, logAudit } = await import("./drive.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Ensure caller can access the contract of this document.
    const { data: doc, error: docErr } = await context.supabase
      .from("rental_contract_documents")
      .select("id,contract_id,file_path,file_name,mime_type,drive_file_id")
      .eq("id", data.documentId)
      .maybeSingle();
    if (docErr) throw new Error(docErr.message);
    if (!doc) throw new Error("Documento não encontrado.");
    const d = doc as unknown as {
      id: string;
      contract_id: string;
      file_path: string;
      file_name: string;
      mime_type: string | null;
      drive_file_id: string | null;
    };

    const { data: folder } = await supabaseAdmin
      .from("rental_drive_folders")
      .select("folder_id,owner_user_id,folder_url")
      .eq("contract_id", d.contract_id)
      .maybeSingle();
    const f = folder as unknown as {
      folder_id: string;
      owner_user_id: string;
      folder_url: string;
    } | null;
    if (!f) throw new Error("Sincronização Drive não habilitada para este contrato.");

    if (d.drive_file_id) {
      return { alreadySynced: true, driveFileId: d.drive_file_id };
    }

    try {
      await supabaseAdmin
        .from("rental_contract_documents")
        .update({ drive_sync_status: "syncing", drive_last_error: null })
        .eq("id", d.id);

      const { data: file, error: dlErr } = await supabaseAdmin.storage
        .from("rental-documents")
        .download(d.file_path);
      if (dlErr || !file) throw new Error(dlErr?.message || "Falha ao baixar do storage.");
      const bytes = new Uint8Array(await file.arrayBuffer());

      const uploaded = await withAccessToken(f.owner_user_id, (t) =>
        uploadFile(t, {
          folderId: f.folder_id,
          name: d.file_name,
          mimeType: d.mime_type || "application/octet-stream",
          bytes,
        }),
      );

      await supabaseAdmin
        .from("rental_contract_documents")
        .update({
          drive_file_id: uploaded.id,
          drive_web_view_url: uploaded.webViewLink,
          drive_mime_type: uploaded.mimeType,
          drive_sync_status: "synced",
          drive_last_synced_at: new Date().toISOString(),
          drive_last_error: null,
        })
        .eq("id", d.id);

      await logAudit({
        contractId: d.contract_id,
        documentId: d.id,
        userId: context.userId,
        action: "document_upload",
        result: "ok",
        destination: uploaded.id,
      });
      return {
        alreadySynced: false,
        driveFileId: uploaded.id,
        driveUrl: uploaded.webViewLink,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabaseAdmin
        .from("rental_contract_documents")
        .update({ drive_sync_status: "failed", drive_last_error: msg.slice(0, 500) })
        .eq("id", d.id);
      await logAudit({
        contractId: d.contract_id,
        documentId: d.id,
        userId: context.userId,
        action: "document_upload",
        result: "error",
        error: msg,
      });
      throw e;
    }
  });

export const syncRentalContractToDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { contractId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Access check via user client:
    await assertContractManageable(context.supabase, data.contractId);
    const { data: rows, error } = await supabaseAdmin
      .from("rental_contract_documents")
      .select("id,drive_file_id")
      .eq("contract_id", data.contractId);
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as { id: string; drive_file_id: string | null }[];
    const pending = list.filter((r) => !r.drive_file_id);

    // Small batches to respect rate limits
    let ok = 0;
    let failed = 0;
    for (let i = 0; i < pending.length; i += 3) {
      const chunk = pending.slice(i, i + 3);
      const results = await Promise.allSettled(
        chunk.map((r) => syncRentalDocumentToDrive({ data: { documentId: r.id } })),
      );
      ok += results.filter((r) => r.status === "fulfilled").length;
      failed += results.filter((r) => r.status === "rejected").length;
    }
    return { processed: pending.length, ok, failed };
  });

export const trashRentalDocumentOnDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { documentId: string }) => d)
  .handler(async ({ data, context }) => {
    const { withAccessToken, moveToTrash, logAudit } = await import("./drive.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Access check via user client
    const { data: doc, error } = await context.supabase
      .from("rental_contract_documents")
      .select("id,contract_id,drive_file_id")
      .eq("id", data.documentId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!doc) throw new Error("Documento não encontrado.");
    const d = doc as unknown as {
      id: string;
      contract_id: string;
      drive_file_id: string | null;
    };
    if (!d.drive_file_id) return { ok: true };

    const { data: folder } = await supabaseAdmin
      .from("rental_drive_folders")
      .select("owner_user_id")
      .eq("contract_id", d.contract_id)
      .maybeSingle();
    const f = folder as unknown as { owner_user_id: string } | null;
    if (!f) throw new Error("Pasta Drive não encontrada.");

    try {
      await withAccessToken(f.owner_user_id, (t) => moveToTrash(t, d.drive_file_id!));
      await supabaseAdmin
        .from("rental_contract_documents")
        .update({
          drive_file_id: null,
          drive_web_view_url: null,
          drive_sync_status: "cloud_only",
          drive_last_synced_at: new Date().toISOString(),
        })
        .eq("id", d.id);
      await logAudit({
        contractId: d.contract_id,
        documentId: d.id,
        userId: context.userId,
        action: "document_trash",
        result: "ok",
      });
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await logAudit({
        contractId: d.contract_id,
        documentId: d.id,
        userId: context.userId,
        action: "document_trash",
        result: "error",
        error: msg,
      });
      throw e;
    }
  });
