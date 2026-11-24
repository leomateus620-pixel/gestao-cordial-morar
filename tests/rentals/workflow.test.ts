import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { unzipSync, strFromU8 } from "fflate";
import { contractWorkflowReview } from "../../src/lib/rentals/contract-workflow";
import { contractTextToDocx } from "../../src/lib/rentals/contract-docx";
import {
  contractVersionKey,
  loadContractLetterhead,
} from "../../src/lib/rentals/contract-letterhead";
import { rentalExample } from "./example";
import { emptySpouse } from "../../src/lib/rentals/guarantor-spouse";

const builds = [
  "cordial-fiador",
  "cordial-caucao",
  "cordial-seguro_fianca",
  "morar-fiador",
  "morar-caucao",
  "morar-seguro_fianca",
] as const;
const templates = Object.fromEntries(
  await Promise.all(
    builds.map(async (key) => [
      key,
      await readFile(
        new URL(`../../src/lib/rentals/contract-templates/${key}.txt`, import.meta.url),
        "utf8",
      ),
    ]),
  ),
) as Record<(typeof builds)[number], string>;

test("checklist aponta o campo de cada pessoa e utiliza o modelo da marca e do tipo", () => {
  const input = rentalExample("morar");
  const good = contractWorkflowReview(input, templates, []);
  assert.equal(good.key, "morar-caucao");
  assert.deepEqual(good.issues, []);
  assert.match(good.text!, /DEMO-184/);
  input.tenants[0].data.cpfCnpj = "";
  assert.ok(
    contractWorkflowReview(input, templates, []).issues.some(
      ({ field }) => field === "tenant-0-cpf",
    ),
  );
  input.brand = "cordial";
  input.property.data.tipo = "sala_comercial";
  assert.ok(
    contractWorkflowReview(input, templates, []).issues.some(
      ({ field }) => field === "property-type",
    ),
  );
});

test("cônjuge habilitado pertence apenas ao fiador correspondente", () => {
  const input = rentalExample("morar");
  input.guarantees = ["A", "B"].map((name) => ({
    tipo: "fiador",
    guarantor: { data: { nome: `Fiador ${name}`, cpfCnpj: "000.000.000-00" } },
    conjuge: { ...emptySpouse(), enabled: name === "B", nome: "Pessoa Anuente" },
  }));
  input.template.guarantors = [input.template.owner!, input.template.owner!];
  input.template.guarantorAssets = "Imóvel de teste.";
  const review = contractWorkflowReview(input, templates, []);
  assert.ok(review.issues.some(({ field }) => field === "guarantor-1-spouse-cpf"));
  assert.ok(!review.issues.some(({ field }) => field.startsWith("guarantor-0-spouse-")));
  assert.match(review.text!, /Esposa anuente do\(a\) fiador\(a\) FIADOR B/);
});

test("Word incorpora a logo e o rodapé oficiais em toda a seção e mantém a versão idempotente", async (t) => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) =>
    new Response(
      new Uint8Array(await readFile(new URL(`../../public${String(url)}`, import.meta.url))),
    );
  t.after(() => {
    globalThis.fetch = original;
  });
  for (const brand of ["cordial", "morar"] as const) {
    const { text, issues } = contractWorkflowReview(rentalExample(brand), templates, []);
    assert.deepEqual(issues, []);
    const letterhead = await loadContractLetterhead(brand);
    const version = await contractVersionKey(text!, letterhead, "1");
    assert.equal(version, await contractVersionKey(text!, letterhead, "1"));
    assert.notEqual(version, await contractVersionKey(text!, letterhead, "2"));
    assert.notEqual(
      version,
      await contractVersionKey(text!, { ...letterhead, address: "Novo endereço" }, "1"),
    );
    const file = await contractTextToDocx(text!, letterhead);
    const zip = unzipSync(new Uint8Array(await file.arrayBuffer()));
    const xml = strFromU8(zip["word/document.xml"]);
    assert.match(xml, /w:headerReference w:type="default"/);
    assert.match(xml, /w:footerReference w:type="default"/);
    assert.doesNotMatch(xml, /w:titlePg/);
    assert.match(xml, /PESSOA LOCATÁRIA EXEMPLO/);
    assert.match(xml, /Testemunhas/);
    assert.match(strFromU8(zip["word/footer1.xml"]), /Rua Buriti, nº 139.*CEP 98780-753/);
    assert.match(strFromU8(zip["word/_rels/header1.xml.rels"]), /Target="media\//);
    const media = Object.entries(zip).find(
      ([name]) => name.startsWith("word/media/") && !name.endsWith("/"),
    );
    assert.deepEqual(media?.[1], letterhead.image);
  }
  globalThis.fetch = async () => new Response("<html>Ausente</html>", { status: 404 });
  await assert.rejects(loadContractLetterhead("morar"), /logo institucional/);
});
