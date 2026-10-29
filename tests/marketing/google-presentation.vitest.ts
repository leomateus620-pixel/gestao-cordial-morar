import { afterEach, describe, expect, it, vi } from "vitest";
import { googleTodayInZone } from "../../src/components/marketing/google-metrics";

const scope = {
  agency: "cordial",
  accountId: "1234567890",
  since: "2026-10-01",
  until: "2026-10-29",
  page: 1,
  pageSize: 25,
  sort: "name_asc",
};

async function preview(search = "") {
  vi.resetModules();
  vi.stubGlobal("location", { search });
  return import("./transport-fixture");
}

function scaled(value: string, digits: number) {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole + fraction.padEnd(digits, "0"));
}

afterEach(() => vi.unstubAllGlobals());

describe("Google presentation dates", () => {
  it("identifies the current account day instead of the machine's UTC day", () => {
    const now = new Date("2026-10-29T01:30:00Z");
    expect(googleTodayInZone("America/Sao_Paulo", now)).toBe("2026-10-28");
    expect(googleTodayInZone("UTC", now)).toBe("2026-10-29");
    expect(googleTodayInZone("Asia/Tokyo", now)).toBe("2026-10-29");
  });

  it("does not invent an account day when its timezone is unknown or invalid", () => {
    const now = new Date("2026-10-29T01:30:00Z");
    expect(googleTodayInZone(null, now)).toBeNull();
    expect(googleTodayInZone("Invalid/Zone", now)).toBeNull();
  });
});

describe("Google synthetic presentation evidence", () => {
  it("keeps the existing default transport unchanged", async () => {
    const transport = await preview();
    const result = await transport.getGoogleMarketingOverview({ data: scope });
    expect(result.total).toBe(1);
    expect(result.summary.cost).toBe("120.456789");
    expect(result.summary.conversions).toBe("2.75");
    expect(result.series?.map((point) => point.date)).toEqual(["2026-10-15"]);
    expect(result.items[0].name).toBe("Pesquisa Google · EXEMPLO SINTÉTICO");
  });

  it("provides observed points with initial gaps and exact full-scope totals", async () => {
    const transport = await preview("?googleScenario=trend&longNames=1");
    const result = await transport.getGoogleMarketingOverview({ data: scope });
    expect(result.total).toBe(3);
    expect(result.coverage).toBe("partial");
    expect(result.series?.[0].date).toBe("2026-10-15");
    expect(result.series?.at(-1)?.date).toBe("2026-10-29");
    expect(result.series).toHaveLength(15);
    expect(result.items.every((row) => row.name.includes("EXEMPLO SINTÉTICO"))).toBe(true);
    expect(result.items.every((row) => row.name.includes("nome completo preservado"))).toBe(true);
    for (const [key, digits] of [
      ["cost", 6],
      ["clicks", 0],
      ["impressions", 0],
      ["conversions", 2],
    ] as const) {
      const seriesSum = result.series!.reduce(
        (sum, point) => sum + scaled(point.metrics[key]!, digits),
        0n,
      );
      expect(scaled(result.summary[key]!, digits)).toBe(seriesSum);
    }
    const paused = result.items.find((row) => row.status === "Pausada")!;
    expect(paused.coverage).toBe("unavailable");
    expect(paused.dailySeries).toBeNull();
    expect(Object.values(paused.metrics).every((value) => value === null)).toBe(true);
    // The collected zero remains a real zero, rather than being converted to a gap.
    expect(result.series?.at(-1)?.metrics.clicks).toBe("0");
  });

  it("sorts and counts the complete filtered set before applying page boundaries", async () => {
    const transport = await preview("?googleScenario=trend");
    const first = await transport.getGoogleMarketingOverview({
      data: { ...scope, sort: "cost_desc", pageSize: 1 },
    });
    const last = await transport.getGoogleMarketingOverview({
      data: { ...scope, sort: "cost_desc", pageSize: 1, page: 3 },
    });
    expect(first.items).toHaveLength(1);
    expect(first.items[0].name).toContain("Performance Max");
    expect(last.items[0].status).toBe("Pausada");
    expect(first.total).toBe(3);
    expect(first.summary).toEqual(last.summary);
    expect(first.series).toEqual(last.series);
  });

  it("applies account, agency, search, status and period filters to the optional scenarios", async () => {
    const transport = await preview("?googleScenario=trend");
    const paused = await transport.getGoogleMarketingOverview({
      data: { ...scope, search: "remarketing", status: "Pausada" },
    });
    expect(paused.total).toBe(1);
    expect(paused.coverage).toBe("unavailable");
    expect(paused.series).toBeNull();
    for (const patch of [
      { accountId: "9999999999" },
      { agency: "morar" },
      { search: "campanha inexistente" },
      { search: "remarketing", status: "Ativa" },
    ]) {
      const result = await transport.getGoogleMarketingOverview({ data: { ...scope, ...patch } });
      expect(result.total).toBe(0);
      expect(result.summary.clicks).toBeNull();
    }
    const earlier = await transport.getGoogleMarketingOverview({
      data: { ...scope, until: "2026-10-14" },
    });
    expect(earlier.total).toBe(3);
    expect(earlier.coverage).toBe("unavailable");
    expect(earlier.series).toBeNull();
  });

  it("keeps explicit empty, complete and internal-gap scenarios distinct", async () => {
    const empty = await preview("?googleScenario=empty");
    const noData = await empty.getGoogleMarketingOverview({ data: scope });
    expect(noData.total).toBe(3);
    expect(noData.coverage).toBe("unavailable");
    expect(noData.series).toBeNull();
    expect(Object.values(noData.summary).every((value) => value === null)).toBe(true);
    const complete = await preview("?googleScenario=complete");
    const fullData = await complete.getGoogleMarketingOverview({ data: scope });
    expect(fullData.coverage).toBe("complete");
    expect(fullData.series).toHaveLength(29);
    expect(fullData.items.every((row) => row.coverage === "complete")).toBe(true);
    const gaps = await preview("?googleScenario=gaps");
    const incomplete = await gaps.getGoogleMarketingOverview({ data: scope });
    expect(incomplete.coverage).toBe("partial");
    expect(incomplete.series?.some((point) => point.date === "2026-10-19")).toBe(false);
    expect(incomplete.series?.some((point) => point.date === "2026-10-20")).toBe(false);
    expect(incomplete.series?.some((point) => point.date === "2026-10-25")).toBe(false);
  });

  it("keeps the loading scenario pending for a stable skeleton capture", async () => {
    const transport = await preview("?googleScenario=loading");
    let settled = false;
    void transport.getGoogleMarketingOverview({ data: scope }).then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
  });

  it.each(["secretaria", "bianca", "meta_reviewer"])(
    "keeps financial values absent in optional evidence for %s",
    async (role) => {
      const transport = await preview(`?googleScenario=trend&role=${role}`);
      const result = await transport.getGoogleMarketingOverview({ data: scope });
      expect(result.summary.cost).toBeNull();
      expect(result.summary.cpc).toBeNull();
      expect(result.summary.costPerConversion).toBeNull();
      expect(result.series?.every((point) => point.metrics.cost === null)).toBe(true);
      expect(result.items.every((row) => row.metrics.cost === null)).toBe(true);
      expect(result.summary.clicks).not.toBeNull();
    },
  );
});
