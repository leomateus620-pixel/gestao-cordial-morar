// Explicitly read-only on Gestão; prepares a restricted local integration sample.
import { createClient } from "@supabase/supabase-js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
const out = ".local/cordial-site-audit";
const snapshot = JSON.parse(await readFile(`${out}/snapshot.json`, "utf8"));
const reconciliation = JSON.parse(await readFile(`${out}/reconciliation.json`, "utf8"));
const candidates = reconciliation.reconciliation
  .filter((r) => r.status === "confirmed_external_relation")
  .map((r) => snapshot.properties.find((p) => p.id === r.propertyId))
  .filter((p) => p.exibir_imovel && p.autorizacao !== false && !p.archived_at && !p.is_draft);
const chosen = candidates
  .filter((p) => snapshot.property_images.some((i) => i.property_id === p.id))
  .sort(
    (a, b) =>
      Number(b.destaque_inicial) - Number(a.destaque_inicial) ||
      b.codigo_cordial.localeCompare(a.codigo_cordial),
  )
  .slice(0, 30);
const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { error } = await client.auth.signInWithPassword({
  email: process.env.SITE_AUDIT_EMAIL,
  password: process.env.SITE_AUDIT_PASSWORD,
});
if (error) throw Error("Sign-in failed");
const { data: properties, error: readError } = await client
  .from("properties")
  .select(
    "id,carteira,operacao,tipo,codigo_cordial,is_draft,exibir_imovel,autorizacao,disponibilidade,archived_at,removal_state,valor,valor_modo,descricao_imovel,pontos_fortes,caracteristicas,cidade,bairro,uf,exibir_endereco_site,area_util,area_total,area_construida,area_terreno,destaque_inicial,estagio_empreendimento,mobiliado,dormitorios,banheiros,suites,vagas,permuta,aceita_financiamento,updated_at,created_at",
  )
  .in(
    "id",
    chosen.map((p) => p.id),
  );
if (readError) throw Error(readError.message);
const images = snapshot.property_images.filter((i) => chosen.some((p) => p.id === i.property_id));
const paths = [
  ...new Set(
    images
      .map((i) => (i.processing_status === "ready" ? i.processed_storage_path : i.storage_path))
      .filter(Boolean),
  ),
];
await mkdir(`${out}/qa-images`, { recursive: true });
const media = {};
let cursor = 0;
await Promise.all(
  Array.from({ length: 5 }, async () => {
    while (cursor < paths.length) {
      const path = paths[cursor++];
      const key = createHash("sha256").update(path).digest("hex");
      const { data, error } = await client.storage.from("property-images").download(path);
      if (error) continue;
      await writeFile(`${out}/qa-images/${key}`, new Uint8Array(await data.arrayBuffer()));
      media[path] = { key, type: data.type };
    }
  }),
);
await writeFile(
  `${out}/qa-sample.json`,
  JSON.stringify(
    {
      notice:
        "Restricted local integration sample. Publication approval is simulated in an in-memory database only.",
      properties,
      images,
      media,
    },
    null,
    2,
  ),
);
await client.auth.signOut({ scope: "local" });
console.log(
  JSON.stringify({
    properties: properties.length,
    images: images.length,
    downloaded: Object.keys(media).length,
  }),
);
