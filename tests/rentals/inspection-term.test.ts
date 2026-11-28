import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { rentalDatabase } from "./database";
import { seedTerm, inspectionId } from "../vistoria/term-fixture";
import { inspectionTerm } from "../../src/lib/vistoria/term";
import { renderOfficialInspection } from "../../src/lib/vistoria/official-pdf.server";
import { toPdfModel } from "../../src/lib/vistoria/pdf-model";

for (const brand of ["cordial", "morar"] as const)
  test(`Secretaria · ${brand}: contrato, fotos, emissão e arquivo versionado`, async (t) => {
    const db = await rentalDatabase(t),
      f = await seedTerm(db, brand);
    const before = await f.snapshot(),
      term = inspectionTerm(before);
    assert.equal(term.brand, brand);
    assert.deepEqual(term.issues, []);
    assert.deepEqual(
      term.parties.map((p) => p.role),
      ["Locador", "Locatário", "Locatário"],
    );
    const model = toPdfModel(before, { draft: false, version: 1 });
    assert.deepEqual(
      model.rooms.map((r) => r.photos.length),
      [0, 1, 2, 3, 4, 7, 2],
    );
    const reads: string[] = [];
    const preview = await renderOfficialInspection(before, async (p) => {
      reads.push(p);
      return f.loader(p);
    });
    assert.deepEqual(
      reads,
      model.rooms.flatMap((r) => r.photos.map((p) => p.path)),
    );
    assert.equal(new Set(reads).size, 19);
    const wrongRoom = structuredClone(before);
    wrongRoom.media[0].room_id = before.rooms[0].id;
    assert.throws(() => toPdfModel(wrongRoom, { draft: true, version: null }), /vínculo/);
    const wrongBrand = structuredClone(before);
    wrongBrand.inspection.agency = brand === "morar" ? "cordial" : "morar";
    assert.throws(() => toPdfModel(wrongBrand, { draft: false, version: 1 }), /imobiliária/);
    const standalone = structuredClone(before);
    standalone.inspection.rental_contract_id = null;
    standalone.termRental = null;
    standalone.inspection.participants = [
      { papel: "Locador", nome: "Locador Alfa", qualificacao: "Documento fictício A" },
      { papel: "Locadora", nome: "Locadora Beta", qualificacao: "Documento fictício B" },
      { papel: "Locatária", nome: "Pessoa Gama", qualificacao: "Documento fictício C" },
    ];
    assert.deepEqual(inspectionTerm(standalone).issues, []);
    assert.deepEqual(
      inspectionTerm(standalone).parties.map((p) => p.role),
      ["Locador", "Locador", "Locatário"],
    );
    const commercial = structuredClone(before);
    commercial.inspection.term_purpose = "comercial";
    assert.match(inspectionTerm(commercial).issues.join(" "), /aprovação.*comercial/);
    const missing = structuredClone(before);
    missing.termRental!.tenants[0].document = null;
    await assert.rejects(renderOfficialInspection(missing, f.loader), /Partes.*Locatário 1.*CPF/);
    const exit = structuredClone(before);
    exit.inspection.kind = exit.inspection.rental_kind = "saida";
    await assert.rejects(renderOfficialInspection(exit, f.loader), /pendente de aprovação.*saída/);
    const failed = model.rooms[1].photos[0].path,
      restore = f.photos.get(failed)!;
    f.photos.delete(failed);
    await assert.rejects(f.emit(before), /foto 1.*Vestíbulo/);
    assert.equal(
      (await db.query("SELECT id FROM inspection_documents WHERE inspection_id=$1", [inspectionId]))
        .rows.length,
      0,
    );
    f.photos.set(failed, restore);
    await db.exec("RESET ROLE");
    await db.query(
      "UPDATE rental_tenants SET nome='Nome da parte atualizado' WHERE nome='Pessoa Locatária Alfa'",
    );
    await db.exec("SET ROLE authenticated");
    const changed = await f.snapshot();
    assert.equal(changed.inspection.revision, before.inspection.revision);
    assert.notEqual(changed.termRevision, before.termRevision);
    await assert.rejects(f.emit(before), /dados do laudo mudaram/);
    await db.exec("RESET ROLE");
    await db.query(
      "UPDATE rental_tenants SET nome='Pessoa Locatária Alfa' WHERE nome='Nome da parte atualizado'",
    );
    await db.exec("SET ROLE authenticated");
    const output = await f.emit(before),
      stored = await f.download(1);
    assert.deepEqual(stored.bytes, preview.bytes);
    assert.equal(createHash("sha256").update(stored.bytes).digest("hex"), stored.sha);
    assert.ok((await PDFDocument.load(stored.bytes)).getPageCount() > 2);
    const rendered = await f.snapshot();
    await db.query("SELECT inspection_reopen($1,$2,'Revisão fictícia da observação')", [
      inspectionId,
      rendered.inspection.revision,
    ]);
    await db.query(
      "UPDATE inspections SET conclusion='Observação adicional da segunda versão.' WHERE id=$1",
      [inspectionId],
    );
    const next = await f.emit(await f.snapshot());
    assert.equal(next.version, 2);
    assert.notEqual(next.path, output.path);
    assert.deepEqual((await f.download(1)).bytes, stored.bytes);
  });
