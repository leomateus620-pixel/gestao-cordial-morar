import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ============ Connection status (workspace-shared) ============

export const getDriveConnectionStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    try {
      const { pingDrive, getRootFolder } = await import("./drive.server");
      const info = await pingDrive();
      const root = await getRootFolder();
      return {
        connected: true as const,
        account: info.email || info.displayName || "conta compartilhada do workspace",
        rootFolderId: root.id,
        rootFolderName: root.name,
        rootFolderUrl: root.url,
        lastError: null as string | null,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        connected: false as const,
        account: null,
        rootFolderId: null,
        rootFolderName: null,
        rootFolderUrl: null,
        lastError: msg,
      };
    }
  });

// ============ Rental folder + sync ============

type ContractLike = {
  id: string;
  property?: {
    logradouro?: string | null;
    numero?: string | null;
    bairro?: string | null;
    cidade?: string | null;
    uf?: string | null;
  } | null;
  tenant?: { nome?: string | null } | null;
};

async function assertContractManageable(
  supabase: ReturnType<typeof globalThis.Object>,
  contractId: string,
): Promise<ContractLike> {
  const client = supabase as unknown as {
    from: (t: string) => {
      select: (s: string) => {
        eq: (
          c: string,
          v: string,
        ) => {
          maybeSingle: () => Promise<{ data: ContractLike | null; error: { message: string } | null }>;
        };
      };
    };
  };
  const { data, error } = await client
    .from("rental_contracts")
    .select(
      "id, property:rental_properties(logradouro,numero,bairro,cidade,uf), tenant:rental_tenants(nome)",
    )
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
        "contract_id,folder_id,folder_name,folder_url,sync_enabled,sync_status,last_synced_at,last_error",
      )
      .eq("contract_id", data.contractId)
      .maybeSingle();
    return row;
  });

export const enableRentalDriveSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { contractId: string }) => d)
  .handler(async ({ data, context }) => {
    const { buildFolderName, ensureContractFolder, logAudit } = await import("./drive.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const contract = await assertContractManageable(context.supabase, data.contractId);
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
      const folder = await ensureContractFolder(folderName);
      const { error: upErr } = await supabaseAdmin.from("rental_drive_folders").upsert(
        {
          contract_id: data.contractId,
          folder_id: folder.id,
          folder_name: folder.name,
          folder_url: folder.webViewLink,
          sync_enabled: true,
          sync_status: "synced",
          last_synced_at: new Date().toISOString(),
          last_error: null,
        } as never,
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
    const { moveToTrash, logAudit } = await import("./drive.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: folder } = await supabaseAdmin
      .from("rental_drive_folders")
      .select("folder_id")
      .eq("contract_id", data.contractId)
      .maybeSingle();
    const row = folder as unknown as { folder_id: string } | null;
    if (row && data.trash) {
      try {
        await moveToTrash(row.folder_id);
      } catch (e) {
        console.error("[disableRentalDriveSync] trash falhou:", e);
      }
    }
    await supabaseAdmin
      .from("rental_drive_folders")
      .delete()
      .eq("contract_id", data.contractId);
    await supabaseAdmin
      .from("rental_contract_documents")
      .update({ drive_sync_status: "not_enabled" } as never)
      .eq("contract_id", data.contractId);
    await logAudit({
      contractId: data.contractId,
      userId: context.userId,
      action: data.trash ? "folder_trash" : "folder_detach",
      result: "ok",
    });
    return { ok: true };
  });

export const syncRentalDocumentToDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { documentId: string }) => d)
  .handler(async ({ data, context }) => {
    const { uploadFileToFolder, logAudit } = await import("./drive.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

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
      .select("folder_id,folder_url")
      .eq("contract_id", d.contract_id)
      .maybeSingle();
    const f = folder as unknown as { folder_id: string; folder_url: string } | null;
    if (!f) throw new Error("Sincronização Drive não habilitada para este contrato.");

    if (d.drive_file_id) {
      return { alreadySynced: true, driveFileId: d.drive_file_id };
    }

    try {
      await supabaseAdmin
        .from("rental_contract_documents")
        .update({ drive_sync_status: "syncing", drive_last_error: null } as never)
        .eq("id", d.id);

      const { data: file, error: dlErr } = await supabaseAdmin.storage
        .from("rental-documents")
        .download(d.file_path);
      if (dlErr || !file) throw new Error(dlErr?.message || "Falha ao baixar do storage.");
      const bytes = new Uint8Array(await file.arrayBuffer());

      const uploaded = await uploadFileToFolder({
        folderId: f.folder_id,
        name: d.file_name,
        mimeType: d.mime_type || "application/octet-stream",
        bytes,
      });

      await supabaseAdmin
        .from("rental_contract_documents")
        .update({
          drive_file_id: uploaded.id,
          drive_web_view_url: uploaded.webViewLink,
          drive_mime_type: uploaded.mimeType,
          drive_sync_status: "synced",
          drive_last_synced_at: new Date().toISOString(),
          drive_last_error: null,
        } as never)
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
        .update({ drive_sync_status: "failed", drive_last_error: msg.slice(0, 500) } as never)
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
    await assertContractManageable(context.supabase, data.contractId);
    const { data: rows, error } = await supabaseAdmin
      .from("rental_contract_documents")
      .select("id,drive_file_id")
      .eq("contract_id", data.contractId);
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as { id: string; drive_file_id: string | null }[];
    const pending = list.filter((r) => !r.drive_file_id);

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
    const { moveToTrash, logAudit } = await import("./drive.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

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

    try {
      await moveToTrash(d.drive_file_id);
      await supabaseAdmin
        .from("rental_contract_documents")
        .update({
          drive_file_id: null,
          drive_web_view_url: null,
          drive_sync_status: "cloud_only",
          drive_last_synced_at: new Date().toISOString(),
        } as never)
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
