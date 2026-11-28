import { createHash } from "node:crypto";
import { buildInspectionPdf, type ImageLoader } from "./pdf";
import { toPdfModel } from "./pdf-model";
import type { InspectionData } from "./types";

export async function renderOfficialInspection(snapshot: InspectionData, loadImage: ImageLoader) {
  const i = snapshot.inspection;
  const version = i.current_version + 1;
  const model = toPdfModel(snapshot, { draft: false, version, generatedAt: i.updated_at });
  const bytes = await buildInspectionPdf(model, loadImage);
  const sha = createHash("sha256").update(bytes).digest("hex");
  return { bytes, version, sha, path: `${i.id}/docs/v${version}-${sha.slice(0, 16)}.pdf` };
}
