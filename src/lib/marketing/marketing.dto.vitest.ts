import { describe, expect, it } from "vitest";
import { marketingCampaignDto, type CampaignRow } from "./marketing.dto";
const row: CampaignRow = {
  id: "id",
  user_id: "owner",
  imobiliaria: "cordial",
  nome: "Campanha",
  canal: "Facebook",
  objetivo: "Leads qualificados",
  status: "Ativa",
  data_inicio: "2026-10-01",
  data_fim: "2026-10-31",
  investimento: "150.50",
  responsavel: null,
  observacoes: null,
  diagnostico: null,
  referencia_url: null,
  leads_esperados: null,
  created_at: "",
  updated_at: "",
  platform: "meta",
  external_campaign_id: "1234567890123456789",
  connection_id: "connection",
  currency: "USD",
  timezone: "America/New_York",
  daily_metrics: [
    {
      data: "2026-10-01",
      leads: 1,
      spend: 150.5,
      investimento: 150.5,
      cpc: 10,
      cpm: 10,
      impressions: 100,
      clicks: 10,
    },
  ],
};
describe("marketing DTO", () => {
  it("redacts financial values for operational users at serialization", () => {
    const dto = marketingCampaignDto(row, false);
    expect(dto.investment).toBeNull();
    expect(dto.costPerLead).toBeNull();
    expect(dto.dailyMetrics[0]).not.toHaveProperty("spend");
    expect(dto.dailyMetrics[0]).not.toHaveProperty("cpc");
    expect(dto.dailyMetrics[0]).not.toHaveProperty("cpm");
    expect(dto.leads).toBe(1);
  });
  it("preserves decimal financials, string external IDs and account metadata for authorized roles", () => {
    const dto = marketingCampaignDto(row, true);
    expect(dto.investment).toBe(150.5);
    expect(dto.externalCampaignId).toBe("1234567890123456789");
    expect(dto.accountTimezone).toBe("America/New_York");
    expect(dto.currency).toBe("USD");
  });
  it("never forwards credential-bearing source URLs into a client DTO", () => {
    const dto = marketingCampaignDto(
      {
        ...row,
        source_url:
          "https://adsmanager.facebook.com/?access_token=DO_NOT_FORWARD&appsecret_proof=PRIVATE",
      },
      true,
    );
    expect(JSON.stringify(dto)).not.toContain("DO_NOT_FORWARD");
    expect(JSON.stringify(dto)).not.toContain("PRIVATE");
    expect(dto.sourceUrl).toContain("selected_campaign_ids=1234567890123456789");
  });
  it("keeps legitimate zero spend instead of dropping it", () => {
    const dto = marketingCampaignDto(
      { ...row, daily_metrics: [{ data: "2026-10-01", spend: 0, investimento: 0 }] },
      true,
    );
    expect(dto.dailyMetrics[0].spend).toBe(0);
  });
});
