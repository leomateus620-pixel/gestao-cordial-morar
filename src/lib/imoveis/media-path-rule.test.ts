import { describe, expect, it } from "vitest";
import { isUnsafeStoragePath } from "./media-path-rule";

describe("regra de caminho das fotos dos sites", () => {
  it.each(["../x", "a/../b", "a/..", "..", "https://x", "HTTP://x"])("bloqueia %s", (p) => {
    expect(isUnsafeStoragePath(p)).toBe(true);
  });
  it.each(["imovel/originais/123-full...jpg", "a..b.jpg"])("permite %s", (p) => {
    expect(isUnsafeStoragePath(p)).toBe(false);
  });
});
