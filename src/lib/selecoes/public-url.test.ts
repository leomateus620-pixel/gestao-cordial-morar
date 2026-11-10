import { describe, expect, it } from "vitest";
import { selectionPublicUrl, selectionRedirectTarget } from "./public-url";
import { rewritePublicInput } from "@/lib/cordial-site/routing";

describe("links das seleções", () => {
  it("Cordial usa cordialimoveis.com", () => {
    expect(selectionPublicUrl("ab", "cordial")).toBe("https://cordialimoveis.com/s/ab");
  });
  it("Morar usa imobiliariamorarimoveis.com.br", () => {
    expect(selectionPublicUrl("ab", "morar")).toBe("https://imobiliariamorarimoveis.com.br/s/ab");
  });
  it("link antigo do sistema vai para o domínio da marca", () => {
    expect(selectionRedirectTarget("https://cordialgestao.com/s/ab", "morar")).toBe("https://imobiliariamorarimoveis.com.br/s/ab");
    expect(selectionRedirectTarget("https://feb6.lovableproject.com/s/ab", "cordial")).toBe("https://cordialimoveis.com/s/ab");
  });
  it("domínio da marca errada troca de domínio; o certo fica", () => {
    expect(selectionRedirectTarget("https://cordialimoveis.com/s/ab", "morar")).toBe("https://imobiliariamorarimoveis.com.br/s/ab");
    expect(selectionRedirectTarget("https://cordialimoveis.com/s/ab", "cordial")).toBeNull();
  });
  it("/s/ não é desviado para dentro do site", () => {
    expect(rewritePublicInput(new URL("https://cordialimoveis.com/s/ab"))).toBeUndefined();
    expect(rewritePublicInput(new URL("https://imobiliariamorarimoveis.com.br/s/ab"))).toBeUndefined();
  });
});
