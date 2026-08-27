import { describe, expect, it } from "vitest";
import { providerExternalCode } from "./sync.server";

describe("providerExternalCode", () => {
  it("entrega a cada provedor exclusivamente o seu código", () => {
    const property = { codigo_cordial: "1234", codigo_morar: "9876" };
    expect(providerExternalCode(property, "cordial")).toBe("1234");
    expect(providerExternalCode(property, "morar")).toBe("9876");
  });

  it("nunca usa o código do outro provedor como fallback", () => {
    const property = { codigo_cordial: "1234", codigo_morar: null };
    expect(providerExternalCode(property, "morar")).toBeNull();
  });

  it("ignora valores vazios", () => {
    expect(providerExternalCode({ codigo_cordial: "   " }, "cordial")).toBeNull();
    expect(providerExternalCode(null, "cordial")).toBeNull();
  });
});
