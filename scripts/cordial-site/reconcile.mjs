// Read-only reconciliation. Never imports website data into Gestão.
import { load } from "cheerio";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
const output = process.env.SITE_AUDIT_OUTPUT || ".local/cordial-site-audit";
const base = "https://www.cordialimoveis.com";
const snapshot = JSON.parse(await readFile(`${output}/snapshot.json`, "utf8"));
const clean = (s) => s.replace(/\s+/g, " ").trim();
async function html(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw Error(`HTTP ${r.status}`);
      const bytes = await r.arrayBuffer();
      const sample = new TextDecoder().decode(bytes.slice(0, 1000));
      return load(new TextDecoder(/utf-8/i.test(sample) ? "utf-8" : "windows-1252").decode(bytes));
    } catch (e) {
      if (attempt === 2) throw e;
    }
  }
}
async function catalog() {
  const seen = new Set(),
    queue = [`${base}/imovel/`],
    items = new Map();
  let displayed = null;
  while (queue.length) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    const $ = await html(url);
    const body = clean($("body").text());
    displayed ??= body.match(/(\d+)\s+im[oó]ve(?:is|l)\s+encontrad/i)?.[1] ?? null;
    $(".imovelcard[data-link]").each((_, node) => {
      const el = $(node),
        path = el.attr("data-link"),
        id = path?.match(/^\/imovel\/(\d+)\//)?.[1];
      if (!id) return;
      items.set(id, {
        externalId: id,
        path,
        reference: clean(el.find(".imovelcard__info__ref strong").text()).replace(/^Ref:\s*/i, ""),
        operation: clean(el.find(".imovelcard__info__tag").text()),
        location: clean(el.find(".imovelcard__info__local").text()),
        price: clean(el.find(".imovelcard__valor__valor").text()),
        cover: el.find("img").first().attr("src") ?? null,
      });
    });
    $(".lista_imoveis_paginacao a[href]").each((_, a) => {
      const u = new URL($(a).attr("href"), base);
      if (u.origin === base && !seen.has(u.href)) queue.push(u.href);
    });
    if (seen.size > 200) throw Error("Unexpected pagination boundary");
  }
  return {
    pages: seen.size,
    displayed,
    items: [...items.values()].sort((a, b) => a.externalId.localeCompare(b.externalId)),
  };
}
const start = new Date().toISOString(),
  a = await catalog();
console.log(`First complete scan: ${a.items.length} identities, ${a.pages} pages`);
const b = await catalog();
const hash = (x) => createHash("sha256").update(JSON.stringify(x.items)).digest("hex");
const stable = hash(a) === hash(b);
const details = [];
let index = 0;
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (index < b.items.length) {
      const item = b.items[index++];
      try {
        const $ = await html(base + item.path);
        const images = [
          ...new Set(
            $("#galeria-inicial img")
              .map((_, a) => $(a).attr("src"))
              .get()
              .filter((u) => /\/imagens\/imoveis\/.*\.(jpg|jpeg|png|webp)(\?|$)/i.test(u)),
          ),
        ];
        const description = clean(
          $(".imovel_descricao, .imovel__descricao, #descricao, [itemprop=description]").text(),
        );
        const ld = $('script[type="application/ld+json"]')
          .map((_, e) => $(e).text())
          .get();
        details.push({ ...item, images, description, structuredData: ld, detailFetched: true });
      } catch (e) {
        details.push({ ...item, detailFetched: false, error: e.message });
      }
      if (details.length % 50 === 0) console.log(`Details ${details.length}/${b.items.length}`);
    }
  }),
);
details.sort((a, b) => a.externalId.localeCompare(b.externalId));
const reconciliation = details.map((old) => {
  const pubs = snapshot.property_provider_publications.filter(
    (p) => p.provider === "cordial" && String(p.external_property_id) === old.externalId,
  );
  const ids = [...new Set(pubs.map((p) => p.property_id))];
  if (ids.length !== 1)
    return {
      old,
      status: ids.length ? "ambiguous_external_link" : "absent_confirmed_gestao_link",
      candidates: ids,
    };
  const p = snapshot.properties.find((p) => p.id === ids[0]);
  if (!p) return { old, status: "missing_canonical_property", propertyId: ids[0] };
  const photos = snapshot.property_images
    .filter((i) => i.property_id === p.id)
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  const oldValue = old.price.includes("R$")
    ? Number(old.price.replace(/[^\d,]/g, "").replace(",", "."))
    : null;
  const differences = [];
  if (String(p.codigo_cordial ?? "").toLowerCase() !== old.reference.toLowerCase())
    differences.push("reference");
  if ((old.operation.toLowerCase().includes("venda") ? "venda" : "aluguel") !== p.operacao)
    differences.push("operation");
  if (oldValue !== null && p.valor != null && Math.abs(oldValue - Number(p.valor)) > 0.01)
    differences.push("price");
  if (old.images.length && old.images.length !== photos.length) differences.push("photo_count");
  return {
    old,
    status: "confirmed_external_relation",
    propertyId: p.id,
    canonicalReference: p.codigo_cordial,
    providerEnabled: pubs.some((p) => p.enabled),
    differences,
    canonicalPhotos: photos.map((i) => ({
      id: i.id,
      position: i.position,
      status: i.processing_status,
    })),
    pending: [
      "description_comparison",
      "area_semantics",
      "availability_review",
      "image_visual_identity_cover_order",
    ],
    exclusions: [
      ...(p.autorizacao === false ? ["authorization_denied"] : []),
      ...(p.exibir_imovel !== true ? ["not_visible"] : []),
      ...(p.autorizacao === null ? ["own_channel_approval_required"] : []),
    ],
  };
});
const matched = new Set(
  reconciliation.filter((r) => r.status === "confirmed_external_relation").map((r) => r.propertyId),
);
const missingFromOld = snapshot.properties
  .filter((p) => !matched.has(p.id))
  .map((p) => ({
    id: p.id,
    origin: p.carteira,
    cordialEnabled: snapshot.property_provider_publications.some(
      (x) => x.property_id === p.id && x.provider === "cordial" && x.enabled,
    ),
  }));
const summary = {
  start,
  finishedAt: new Date().toISOString(),
  stableDoubleScan: stable,
  pages: b.pages,
  oldUnique: b.items.length,
  oldDisplayed: b.displayed,
  detailSuccess: details.filter((x) => x.detailFetched).length,
  detailsWithPhotoList: details.filter((x) => x.images.length).length,
  detailsWithDescription: details.filter((x) => x.description).length,
  statuses: Object.fromEntries(
    [...new Set(reconciliation.map((x) => x.status))].map((s) => [
      s,
      reconciliation.filter((x) => x.status === s).length,
    ]),
  ),
  canonicalWithoutConfirmedOld: missingFromOld.length,
  differences: Object.fromEntries(
    ["reference", "operation", "price", "photo_count"].map((k) => [
      k,
      reconciliation.filter((x) => x.differences?.includes(k)).length,
    ]),
  ),
  pending:
    "Photo binary equivalence, exact descriptions and areas are not inferred from names or reference.",
};
await mkdir(output, { recursive: true });
await writeFile(
  `${output}/reconciliation.json`,
  JSON.stringify({ summary, reconciliation, missingFromOld }, null, 2),
);
await writeFile(`${output}/reconciliation-summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
if (!stable) process.exitCode = 2;
