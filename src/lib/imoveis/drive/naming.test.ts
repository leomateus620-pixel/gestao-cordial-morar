import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDriveFileName,
  buildFilePrefix,
  buildPropertyDriveFolderName,
  classifyOrientation,
  parseDriveFolderId,
  sanitizeDriveSegment,
} from "./naming.ts";

test("somente Cordial gera pasta com o código Cordial", () => {
  assert.equal(
    buildPropertyDriveFolderName({
      cordialCode: "1234",
      morarCode: "5678",
      providers: ["cordial"],
    }),
    "IMÓVEL - CORDIAL 1234",
  );
});

test("somente Morar gera pasta com o código Morar", () => {
  assert.equal(
    buildPropertyDriveFolderName({ cordialCode: "1234", morarCode: "5678", providers: ["morar"] }),
    "IMÓVEL - MORAR 5678",
  );
});

test("ambos preservam os dois códigos", () => {
  assert.equal(
    buildPropertyDriveFolderName({
      cordialCode: "1234",
      morarCode: "5678",
      providers: ["cordial", "morar"],
    }),
    "IMÓVEL - CORDIAL 1234 - MORAR 5678",
  );
});

test("sem código por provedor usa o código interno", () => {
  assert.equal(
    buildPropertyDriveFolderName({ providers: ["cordial"], fallback: "A-99" }),
    "IMÓVEL - A-99",
  );
});

test("orientação segue a dimensão real", () => {
  assert.equal(classifyOrientation({ width: 1600, height: 900 }), "horizontal");
  assert.equal(classifyOrientation({ width: 900, height: 1600 }), "vertical");
  assert.equal(classifyOrientation({ width: 1000, height: 1000 }), "horizontal");
  assert.equal(classifyOrientation({ width: 1600, height: 900, override: "vertical" }), "vertical");
});

test("nome de arquivo previsível e ordenável", () => {
  const prefix = buildFilePrefix({
    cordialCode: "1234",
    morarCode: "5678",
    providers: ["cordial", "morar"],
  });
  assert.equal(prefix, "CORDIAL-1234_MORAR-5678");
  assert.equal(
    buildDriveFileName({
      prefix,
      category: "horizontal",
      index: 1,
      mimeType: "image/jpeg",
      originalName: "a.jpeg",
    }),
    "CORDIAL-1234_MORAR-5678_HORIZONTAL_001.jpg",
  );
  assert.equal(
    buildDriveFileName({
      prefix,
      category: "video",
      index: 1,
      mimeType: "video/mp4",
      originalName: "v.mp4",
    }),
    "CORDIAL-1234_MORAR-5678_VIDEO_001.mp4",
  );
});

test("link da pasta raiz é validado por host e formato", () => {
  assert.equal(
    parseDriveFolderId(
      "https://drive.google.com/drive/folders/1JRCFkohIiGUjQNF5kboEaXfrhcoGosEf?usp=drive_link",
    ),
    "1JRCFkohIiGUjQNF5kboEaXfrhcoGosEf",
  );
  assert.equal(
    parseDriveFolderId("https://example.com/drive/folders/1JRCFkohIiGUjQNF5kboEaXfrhcoGosEf"),
    null,
  );
  assert.equal(sanitizeDriveSegment("  a/b:c  "), "a b c");
});
