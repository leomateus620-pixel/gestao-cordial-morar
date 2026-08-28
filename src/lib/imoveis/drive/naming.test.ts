import { describe, expect, it } from "vitest";
import {
  buildDriveFileName,
  buildFilePrefix,
  buildPropertyDriveFolderName,
  classifyOrientation,
  parseDriveFolderId,
  sanitizeDriveSegment,
} from "./naming";

describe("buildPropertyDriveFolderName", () => {
  it("usa apenas o código Cordial quando só a Cordial é destino", () => {
    expect(
      buildPropertyDriveFolderName({ cordialCode: "1234", morarCode: "5678", providers: ["cordial"] }),
    ).toBe("IMÓVEL - CORDIAL 1234");
  });

  it("usa apenas o código Morar quando só a Morar é destino", () => {
    expect(
      buildPropertyDriveFolderName({ cordialCode: "1234", morarCode: "5678", providers: ["morar"] }),
    ).toBe("IMÓVEL - MORAR 5678");
  });

  it("preserva os dois códigos quando ambos os sites são destino", () => {
    expect(
      buildPropertyDriveFolderName({
        cordialCode: "1234",
        morarCode: "5678",
        providers: ["cordial", "morar"],
      }),
    ).toBe("IMÓVEL - CORDIAL 1234 - MORAR 5678");
  });

  it("cai para o código interno quando nenhum código por provedor existe", () => {
    expect(buildPropertyDriveFolderName({ providers: ["cordial"], fallback: "A-99" })).toBe(
      "IMÓVEL - A-99",
    );
  });
});

describe("classifyOrientation", () => {
  it("classifica pela dimensão real", () => {
    expect(classifyOrientation({ width: 1600, height: 900 })).toBe("horizontal");
    expect(classifyOrientation({ width: 900, height: 1600 })).toBe("vertical");
  });
  it("trata quadrada como horizontal", () => {
    expect(classifyOrientation({ width: 1000, height: 1000 })).toBe("horizontal");
  });
  it("respeita a correção manual", () => {
    expect(classifyOrientation({ width: 1600, height: 900, override: "vertical" })).toBe("vertical");
  });
});

describe("nomes de arquivo", () => {
  it("segue prefixo, categoria e ordem", () => {
    const prefix = buildFilePrefix({ cordialCode: "1234", morarCode: "5678", providers: ["cordial", "morar"] });
    expect(prefix).toBe("CORDIAL-1234_MORAR-5678");
    expect(
      buildDriveFileName({ prefix, category: "horizontal", index: 1, mimeType: "image/jpeg", originalName: "a.jpeg" }),
    ).toBe("CORDIAL-1234_MORAR-5678_HORIZONTAL_001.jpg");
    expect(
      buildDriveFileName({ prefix, category: "video", index: 1, mimeType: "video/mp4", originalName: "v.mp4" }),
    ).toBe("CORDIAL-1234_MORAR-5678_VIDEO_001.mp4");
  });
});

describe("parseDriveFolderId", () => {
  it("aceita link de pasta do Drive", () => {
    expect(
      parseDriveFolderId("https://drive.google.com/drive/folders/1JRCFkohIiGUjQNF5kboEaXfrhcoGosEf?usp=drive_link"),
    ).toBe("1JRCFkohIiGUjQNF5kboEaXfrhcoGosEf");
  });
  it("recusa host estranho", () => {
    expect(parseDriveFolderId("https://example.com/drive/folders/1JRCFkohIiGUjQNF5kboEaXfrhcoGosEf")).toBeNull();
  });
  it("sanitiza segmentos", () => {
    expect(sanitizeDriveSegment("  a/b:c  ")).toBe("a b c");
  });
});
