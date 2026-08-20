/* Script temporário de validação da integração ImobiBrasil (execução manual). */
import { createClient } from "@supabase/supabase-js";
import { fetchAccountStatus, refreshProviderCatalogs } from "@/lib/imobibrasil/catalogs.server";
import { processJob, reconcilePublication, type SyncJob } from "@/lib/imobibrasil/sync.server";

const admin = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
  auth: { persistSession: false },
});

const provider = (process.argv[3] ?? "cordial") as "cordial" | "morar";
const step = process.argv[2] ?? "all";

function job(propertyId: string, action: SyncJob["action"]): SyncJob {
  return {
    id: crypto.randomUUID(),
    property_id: propertyId,
    provider,
    action,
    requested_revision: 1,
    correlation_id: crypto.randomUUID(),
    attempts: 1,
    max_attempts: 3,
  };
}

async function publicationRow(propertyId: string) {
  const { data } = await admin
    .from("property_provider_publications")
    .select("id, provider, status, external_property_id, external_reference, last_payload_hash, last_error_message")
    .eq("property_id", propertyId)
    .eq("provider", provider)
    .maybeSingle();
  return data;
}

async function ensureTestProperty() {
  const { data: existing } = await admin
    .from("properties")
    .select("id")
    .eq("source_property_id", "QA-IMOBI-TEST")
    .maybeSingle();
  if (existing) return existing.id as string;
  const { data, error } = await admin
    .from("properties")
    .insert({
      carteira: provider,
      operacao: "venda",
      finalidade: "venda",
      tipo: "Casa",
      cidade: "Santa Rosa",
      uf: "RS",
      bairro: "Centro",
      logradouro: "Rua de Teste da Integração",
      numero: "100",
      cep: "98900000",
      valor: 350000,
      dormitorios: 2,
      suites: 1,
      banheiros: 2,
      vagas: 1,
      area_total: 120,
      area_principal: 90,
      descricao_imovel: "Imóvel de teste automatizado da integração. Não publicar.",
      source: "qa_integration",
      source_property_id: "QA-IMOBI-TEST",
      is_draft: true,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

async function run() {
  if (step === "status") {
    console.log(await fetchAccountStatus(provider));
    return;
  }
  if (step === "catalogs") {
    console.log(await refreshProviderCatalogs(admin, provider));
    return;
  }

  const propertyId = await ensureTestProperty();
  console.log("imóvel de teste:", propertyId);

  if (step === "publish" || step === "all") {
    console.log("publish:", await processJob(admin, job(propertyId, "publish")));
    console.log("pub row:", await publicationRow(propertyId));
  }
  if (step === "idempotency" || step === "all") {
    console.log("republish:", await processJob(admin, job(propertyId, "publish")));
  }
  if (step === "update" || step === "all") {
    await admin
      .from("properties")
      .update({ valor: 379000, dormitorios: 3, descricao_imovel: "Descrição atualizada pelo teste." })
      .eq("id", propertyId);
    console.log("update:", await processJob(admin, job(propertyId, "update")));
  }
  if (step === "images" || step === "all") {
    const files: Array<{ name: string; cover: boolean; position: number }> = [
      { name: "qa-capa.jpg", cover: true, position: 0 },
      { name: "qa-segunda.jpg", cover: false, position: 1 },
    ];
    for (const file of files) {
      const bytes = new Uint8Array(await (await fetch(`https://picsum.photos/seed/${file.position}/800/600`)).arrayBuffer());
      const path = `${propertyId}/${file.name}`;
      const up = await admin.storage.from("property-images").upload(path, bytes, { contentType: "image/jpeg", upsert: true });
      if (up.error) throw new Error(up.error.message);
      const hash = String(bytes.length);
      await admin.from("property_images").delete().eq("property_id", propertyId).eq("storage_path", path);
      await admin.from("property_images").insert(
        {
          property_id: propertyId,
          storage_path: path,
          file_name: file.name,
          mime_type: "image/jpeg",
          size_bytes: bytes.length,
          content_hash: hash,
          is_cover: file.cover,
          position: file.position,
        },
      );
    }
    console.log("imagens:", await processJob(admin, job(propertyId, "update")));
    const { data: rows } = await admin
      .from("property_image_provider_publications")
      .select("external_image_id, is_cover, status, last_error_message");
    console.log("imagens publicadas:", rows);
  }
  if (step === "reconcile" || step === "all") {
    const row = await publicationRow(propertyId);
    console.log("reconcile:", await reconcilePublication(admin, row as never, crypto.randomUUID()));
  }
  if (step === "unpublish" || step === "all") {
    console.log("unpublish:", await processJob(admin, job(propertyId, "unpublish")));
  }
  if (step === "concurrency") {
    const { runSyncWorker } = await import("@/lib/imobibrasil/sync.server");
    await admin.from("property_sync_jobs").insert({
      property_id: propertyId,
      provider,
      action: "reconcile",
      requested_revision: 99,
      status: "pending",
      next_run_at: new Date().toISOString(),
    });
    const [a, b] = await Promise.all([
      runSyncWorker(admin, { limit: 5, workerId: "qa-a" }),
      runSyncWorker(admin, { limit: 5, workerId: "qa-b" }),
    ]);
    console.log("worker A:", JSON.stringify(a));
    console.log("worker B:", JSON.stringify(b));
  }
  if (step === "cleanup") {
    console.log("delete remoto:", await processJob(admin, job(propertyId, "delete")));
    await admin.from("property_provider_publications").delete().eq("property_id", propertyId);
    await admin.from("properties").delete().eq("id", propertyId);
    console.log("limpeza local concluída");
  }
}

run().catch((error) => {
  console.error("FALHA:", error?.message ?? error);
  process.exit(1);
});
