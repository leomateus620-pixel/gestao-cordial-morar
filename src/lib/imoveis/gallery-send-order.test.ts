import { describe, expect, it } from "vitest";
import { sendOrderForSite } from "./gallery-plan";

const img = (id: string, position: number) => ({ id, position });

describe("sendOrderForSite", () => {
  it("envia a capa primeiro e o resto da última para a primeira", () => {
    const out = sendOrderForSite([img("a", 0), img("b", 1), img("c", 2), img("d", 3)], "a");
    expect(out.map((i) => i.id)).toEqual(["a", "d", "c", "b"]);
  });
  it("sem capa pendente, só inverte as demais", () => {
    const out = sendOrderForSite([img("b", 1), img("c", 2)], "a");
    expect(out.map((i) => i.id)).toEqual(["c", "b"]);
  });
});
