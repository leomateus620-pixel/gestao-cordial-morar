import { describe, expect, it } from "vitest";
import { isRefreshDue, missingStoredDays } from "./sync.server";

const now = Date.parse("2026-10-27T18:00:00Z");
const ago = (min: number) => new Date(now - min * 60000).toISOString();

describe("atualização automática de campanhas", () => {
  it("campanha ativa atualiza após ~10 minutos", () => {
    expect(isRefreshDue({ status: "Ativa", last_synced_at: ago(10) }, now)).toBe(true);
    expect(isRefreshDue({ status: "Ativa", last_synced_at: ago(5) }, now)).toBe(false);
  });
  it("campanha pausada só atualiza a cada 6 horas", () => {
    expect(isRefreshDue({ status: "Pausada", last_synced_at: ago(60) }, now)).toBe(false);
    expect(isRefreshDue({ status: "Pausada", last_synced_at: ago(361) }, now)).toBe(true);
  });
  it("bloqueia gravação que apagaria dias com gasto já salvos", () => {
    const stored = [
      { data: "2026-10-20", spend: 12.5, impressions: 300 },
      { data: "2026-10-21", spend: 0, impressions: 0 },
    ];
    expect(missingStoredDays(stored, ["2026-10-21"])).toEqual(["2026-10-20"]);
    expect(missingStoredDays(stored, ["2026-10-20"])).toEqual([]);
  });
});

it("preserves Google days containing only fractional conversions", () => {
  const stored = [{ data: "2026-10-20", spend: 0, impressions: 0, conversions: 2.75 }];
  expect(missingStoredDays(stored, [], true)).toEqual(["2026-10-20"]);
  expect(missingStoredDays(stored, ["2026-10-20"], true)).toEqual([]);
});

describe("Google: dias omitidos", () => {
  it("dia salvo só com conversões e ausente na resposta bloqueia a gravação", () => {
    const stored = [{ data: "2026-10-20", spend: 0, impressions: 0, conversions: 2 }];
    expect(missingStoredDays(stored, [], true)).toEqual(["2026-10-20"]);
  });
  it("dia salvo zerado pode faltar na resposta do Google", () => {
    const stored = [{ data: "2026-10-21", spend: 0, impressions: 0, conversions: 0 }];
    expect(missingStoredDays(stored, [], true)).toEqual([]);
  });
});
