import { describe, expect, it } from "vitest";
import { parseCampaignLink } from "./link-parser";

describe("parseCampaignLink", () => {
  it("Meta selected_campaign_ids + act", () => {
    expect(
      parseCampaignLink(
        "https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=123456789&selected_campaign_ids=23850001",
      ),
    ).toEqual({ platform: "meta", accountId: "123456789", campaignId: "23850001" });
  });
  it("Meta campaign_ids and business host", () => {
    expect(parseCampaignLink("https://business.facebook.com/adsmanager?act=act_555555&campaign_ids=777777,888888").campaignId).toBe("777777");
  });
  it("Meta path /campaigns/<id>", () => {
    expect(parseCampaignLink("adsmanager.facebook.com/campaigns/99999999").campaignId).toBe("99999999");
  });
  it("Meta without campaign returns friendly error", () => {
    const r = parseCampaignLink("https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=123456");
    expect(r.platform).toBe("meta");
    expect(r.error).toBeTruthy();
  });
  it("Google __e + campaignId", () => {
    expect(
      parseCampaignLink("https://ads.google.com/aw/overview?ocid=111&__u=222&__c=333333&__e=1234567890&campaignId=20001234"),
    ).toEqual({ platform: "google", accountId: "1234567890", campaignId: "20001234" });
  });
  it("Google falls back to __c then ocid", () => {
    expect(parseCampaignLink("https://ads.google.com/aw/campaigns?__c=4444444&campaignId=55555").accountId).toBe("4444444");
    expect(parseCampaignLink("https://ads.google.com/aw/campaigns?ocid=66666&campaignId=55555").accountId).toBe("66666");
  });
  it("Google missing ids", () => {
    expect(parseCampaignLink("https://ads.google.com/aw/overview?__e=1234567").error).toBeTruthy();
  });
  it("unknown host", () => {
    const r = parseCampaignLink("https://example.com/x");
    expect(r.platform).toBeUndefined();
    expect(r.error).toBeTruthy();
  });
  it("empty", () => {
    expect(parseCampaignLink("  ").error).toBeTruthy();
  });
});
