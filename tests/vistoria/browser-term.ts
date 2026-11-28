// Run against tests/vistoria/vite.config.ts with Playwright available on NODE_PATH.
// Transport is local. The renderer, rental UI, version registration and RLS are real.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { rentalDatabase } from "../rentals/database";
import { seedTerm, inspectionId } from "./term-fixture";
import { PdfPhotoError } from "../../src/lib/vistoria/pdf";
import { PDFDocument } from "pdf-lib";

const { chromium } = createRequire(import.meta.url)("playwright") as typeof import("playwright");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const out = resolve(process.env.VISTORIA_TERM_DEMOS ?? "docs/vistoria-evidencias/termos");
const qa = resolve(process.env.VISTORIA_TERM_QA ?? "/tmp/vistoria-termos");
await Promise.all([mkdir(out, { recursive: true }), mkdir(qa, { recursive: true })]);
try {
  for (const brand of ["cordial", "morar"] as const) {
    const db = await rentalDatabase();
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      acceptDownloads: true,
    });
    try {
      const fixture = await seedTerm(db, brand);
      const page = await ctx.newPage();
      page.setDefaultTimeout(12000);
      await page.route("**/__inspection_qa/**", async (route) => {
        const action = route.request().url().split("/").pop();
        try {
          if (action === "document")
            return await route.fulfill({
              body: Buffer.from((await fixture.download(1)).bytes),
              contentType: "application/pdf",
            });
          const payload = JSON.parse(route.request().postData() ?? "{}");
          let response: unknown;
          if (action === "snapshot") {
            const s = await fixture.snapshot();
            const docs = await db.query(
              "SELECT id,version,byte_size,created_at,created_by FROM inspection_documents WHERE inspection_id=$1",
              [inspectionId],
            );
            response = {
              ...s,
              documents: docs.rows,
              events: [],
              serverTime: s.inspection.updated_at,
            };
          } else if (action === "sign-photos")
            response = Object.fromEntries(
              payload.paths.map((p: string) => [
                p,
                "data:image/png;base64," + Buffer.from(fixture.photos.get(p)!).toString("base64"),
              ]),
            );
          else if (action === "emit") {
            const s = await fixture.snapshot();
            assert.equal(payload.id, s.inspection.id);
            assert.equal(payload.expectedRevision, s.inspection.revision);
            assert.equal(payload.termRevision, s.termRevision);
            assert.equal(payload.reviewed, true);
            try {
              response = { version: (await fixture.emit(s)).version };
            } catch (error) {
              if (!(error instanceof PdfPhotoError)) throw error;
              response = {
                photoErrors: error.failed.map(({ number, room }) => ({ number, room })),
              };
            }
          } else if (action === "sign-document") {
            assert.equal(payload.version, 1);
            response = { url: "/__inspection_qa/document" };
          } else throw new Error("Transporte de teste desconhecido");
          await route.fulfill({ json: response });
        } catch (e) {
          await route.fulfill({ status: 409, body: String(e) });
        }
      });
      async function download(name: string, match: RegExp | string) {
        const file = page.waitForEvent("download");
        await page.getByRole("button", { name: match, exact: typeof match === "string" }).click();
        await (await file).saveAs(name);
        return readFile(name);
      }
      const url = "http://127.0.0.1:5176/tests/vistoria/preview.html?termQa&brand=" + brand;
      await page.goto(url + "&state=rental");
      await page
        .getByRole("button", { name: /Continuar vistoria de entrada|Revisar vistoria de entrada/ })
        .click();
      await page.getByRole("button", { name: "Revisão", exact: true }).click();
      const preview = await download(qa + "/" + brand + "-previa.pdf", /Baixar prévia/);
      await page.getByRole("checkbox").check();
      const [photo, bytes] = [...fixture.photos][0];
      fixture.photos.delete(photo);
      await page.getByRole("button", { name: "Concluir e registrar termo" }).click();
      await page.getByText("Foto 1 (Vestíbulo)", { exact: true }).waitFor();
      fixture.photos.set(photo, bytes);
      await db.exec("BEGIN");
      const official = await download(out + "/" + brand + ".pdf", "Concluir e registrar termo");
      assert.deepEqual(official, Buffer.from((await fixture.download(1)).bytes));
      assert.equal(
        (await PDFDocument.load(official)).getPageCount(),
        (await PDFDocument.load(preview)).getPageCount(),
      );
      await page.goto(url + "&state=list");
      await page
        .locator('a[href*="' + inspectionId + '"]')
        .first()
        .click();
      await page.getByRole("button", { name: "Revisão", exact: true }).click();
      const same = await download(qa + "/" + brand + "-central.pdf", "Baixar termo v1");
      assert.deepEqual(same, official);
      // Rewind only the isolated DB to the same reviewed snapshot, then initiate
      // emission from the other menu and compare the actual downloaded bytes.
      await db.exec("ROLLBACK");
      await page.goto(url + "&state=list");
      await page
        .locator('a[href*="' + inspectionId + '"]')
        .first()
        .click();
      await page.getByRole("button", { name: "Revisão", exact: true }).click();
      await page.getByRole("checkbox").check();
      const emittedFromCentral = await download(
        qa + "/" + brand + "-central-emitido.pdf",
        "Concluir e registrar termo",
      );
      assert.deepEqual(emittedFromCentral, official);
      console.log(brand, "· dois menus, prévia, emissão e download v1", official.length, "bytes.");
    } finally {
      await ctx.close();
      await db.close();
    }
  }
} finally {
  await browser.close();
}
