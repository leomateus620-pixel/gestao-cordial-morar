import { describe, expect, it } from "vitest";
import { siteDomainRedirect } from "./domains";
import { rewritePublicInput } from "./routing";

describe("domínios dos sites", () => {
  it("links antigos do Gestão vão para o domínio da marca", () => {
    expect(siteDomainRedirect("https://cordialgestao.com/site/imovel/abc?x=1")).toBe(
      "https://cordialimoveis.com/imovel/abc?x=1",
    );
    expect(siteDomainRedirect("https://cordialgestao.com/site")).toBe("https://cordialimoveis.com/");
    expect(siteDomainRedirect("https://cordialgestao.com/site-morar/buscar")).toBe(
      "https://imobiliariamorarimoveis.com.br/buscar",
    );
  });
  it("www vai para o domínio sem www", () => {
    expect(siteDomainRedirect("https://www.imobiliariamorarimoveis.com.br/sobre")).toBe(
      "https://imobiliariamorarimoveis.com.br/sobre",
    );
    expect(siteDomainRedirect("https://www.cordialimoveis.com/")).toBe("https://cordialimoveis.com/");
  });
  it("Gestão e APIs não são redirecionados", () => {
    expect(siteDomainRedirect("https://cordialgestao.com/imoveis")).toBeNull();
    expect(siteDomainRedirect("https://cordialgestao.com/api/public/x")).toBeNull();
    expect(siteDomainRedirect("https://cordialimoveis.com/buscar")).toBeNull();
  });
  it("cada domínio abre o site da própria marca", () => {
    expect(rewritePublicInput(new URL("https://cordialimoveis.com/buscar"))?.pathname).toBe(
      "/site/buscar",
    );
    expect(
      rewritePublicInput(new URL("https://imobiliariamorarimoveis.com.br/imovel/1"))?.pathname,
    ).toBe("/site-morar/imovel/1");
    expect(rewritePublicInput(new URL("https://cordialgestao.com/imoveis"))).toBeUndefined();
  });
});
