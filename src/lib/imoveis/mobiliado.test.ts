import { describe, it } from "node:test";
import assert from "node:assert/strict";
const expect = (a: unknown) => ({ toBe: (b: unknown) => assert.equal(a, b), toBeNull: () => assert.equal(a, null) });
import { mobiliadoLabel, parseMobiliado, serializeMobiliado } from "./mobiliado";

describe("mobiliado: conversor", () => {
  it("lê textos e booleanos", () => {
    expect(parseMobiliado("false")).toBe(false);
    expect(parseMobiliado("true")).toBe(true);
    expect(parseMobiliado("sim")).toBe(true);
    expect(parseMobiliado("nao")).toBe(false);
    expect(parseMobiliado("não")).toBe(false);
    expect(parseMobiliado(" TRUE ")).toBe(true);
    expect(parseMobiliado(true)).toBe(true);
    expect(parseMobiliado(false)).toBe(false);
    expect(parseMobiliado(null)).toBeNull();
    expect(parseMobiliado("")).toBeNull();
    expect(parseMobiliado("talvez")).toBeNull();
  });
  it("grava de forma reversível", () => {
    expect(serializeMobiliado(false)).toBe("false");
    expect(serializeMobiliado(true)).toBe("true");
    expect(serializeMobiliado(null)).toBeNull();
    for (const v of [true, false, null]) expect(parseMobiliado(serializeMobiliado(v))).toBe(v);
  });
  it("ficha só mostra Sim quando verdadeiro (texto 'false' não é Sim)", () => {
    expect(mobiliadoLabel("false")).toBeNull();
    expect(mobiliadoLabel(null)).toBeNull();
    expect(mobiliadoLabel(false)).toBeNull();
    expect(mobiliadoLabel("true")).toBe("Sim");
  });
  it("desmarcar/marcar, salvar e recarregar mantém o valor", () => {
    expect(parseMobiliado(serializeMobiliado(false))).toBe(false);
    expect(mobiliadoLabel(parseMobiliado(serializeMobiliado(false)))).toBeNull();
    expect(parseMobiliado(serializeMobiliado(true))).toBe(true);
    expect(mobiliadoLabel(parseMobiliado(serializeMobiliado(true)))).toBe("Sim");
  });
});
