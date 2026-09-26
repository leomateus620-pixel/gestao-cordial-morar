// Idempotent dry-run only. Generates no SQL capable of publishing an unreviewed property.
import { readFile, writeFile } from "node:fs/promises";
const dir = process.env.SITE_AUDIT_OUTPUT || ".local/cordial-site-audit";
const snapshot = JSON.parse(await readFile(`${dir}/snapshot.json`, "utf8"));
const report = JSON.parse(await readFile(`${dir}/reconciliation.json`, "utf8"));
const rows = snapshot.properties
  .map((p) => {
    const links = snapshot.property_provider_publications.filter(
      (x) => x.property_id === p.id && x.enabled,
    );
    const cordial = links.some((x) => x.provider === "cordial"),
      morar = links.some((x) => x.provider === "morar");
    const blocked = [
      ...(p.is_draft ? ["draft"] : []),
      ...(p.archived_at ? ["archived"] : []),
      ...(p.removal_state ? ["removal"] : []),
      ...(p.exibir_imovel !== true ? ["hidden"] : []),
      ...(p.autorizacao === false ? ["authorization_denied"] : []),
      ...(p.disponibilidade &&
      !["sim", "disponivel", "disponível"].includes(p.disponibilidade.toLowerCase())
        ? ["availability"]
        : []),
    ];
    const old = report.reconciliation.filter(
      (r) => r.status === "confirmed_external_relation" && r.propertyId === p.id,
    );
    return {
      propertyId: p.id,
      scope:
        cordial && morar
          ? "shared"
          : cordial
            ? "cordial_only"
            : morar
              ? "morar_only"
              : "no_enabled_provider",
      blocked,
      decision: blocked.length
        ? "blocked"
        : cordial
          ? "operator_review_required"
          : "no_confirmed_cordial_provider_link",
      required: [
        "own_channel_authorization",
        "availability",
        "public_content_privacy",
        "media_integrity_rights_watermark",
        "area_units_if_exposed",
      ],
      publicReferenceProposal:
        p.codigo_cordial && !/^GC-/i.test(p.codigo_cordial)
          ? p.codigo_cordial
          : "Allocate stable C- sequence on first explicit approval",
      redirects: old.map((r) => ({
        oldPath: r.old.path,
        canonicalPropertyId: p.id,
        applyOnlyAfter: "own publication exists and relation is reviewed",
      })),
      pending: old.flatMap((r) => r.differences ?? []),
    };
  })
  .sort((a, b) => a.propertyId.localeCompare(b.propertyId));
const scope = Object.fromEntries(
  ["shared", "cordial_only", "morar_only", "no_enabled_provider"].map((k) => [
    k,
    rows.filter((r) => r.scope === k).length,
  ]),
);
await writeFile(
  `${dir}/activation-plan.json`,
  JSON.stringify({ mode: "dry-run", productionWrites: 0, scope, rows }, null, 2),
);
console.log(
  JSON.stringify({
    scope,
    blocked: rows.filter((r) => r.blocked.length).length,
    reviewCandidates: rows.filter((r) => r.decision === "operator_review_required").length,
    redirectCandidates: rows.reduce((n, r) => n + r.redirects.length, 0),
  }),
);
