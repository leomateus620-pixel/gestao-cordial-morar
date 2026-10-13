import type { ParsedCampaignLink } from "./types";

const digits = (v: string | null | undefined) => {
  if (!v) return undefined;
  const clean = v.replace(/[-\s]/g, "");
  return /^\d{4,}$/.test(clean) ? clean : undefined;
};

function firstId(v: string | null) {
  if (!v) return undefined;
  return digits(decodeURIComponent(v).split(/[,%]/)[0]);
}

export function parseCampaignLink(raw: string): ParsedCampaignLink {
  const text = raw.trim();
  if (!text) return { error: "Cole o link da campanha." };
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return { error: "Link inválido." };
  }
  const host = url.hostname.toLowerCase();
  const q = url.searchParams;

  if (/(^|\.)(adsmanager|business)\.facebook\.com$/.test(host) || host === "facebook.com" || host === "www.facebook.com") {
    const pathMatch = url.pathname.match(/\/campaigns\/(\d+)/);
    const campaignId =
      firstId(q.get("selected_campaign_ids")) ?? firstId(q.get("campaign_ids")) ?? digits(pathMatch?.[1]);
    const accountId = digits(q.get("act")?.replace(/^act_/, ""));
    if (!campaignId)
      return { platform: "meta", accountId, error: "Selecione a campanha no Gerenciador e copie o link novamente." };
    return { platform: "meta", accountId, campaignId };
  }

  if (host === "ads.google.com" || host.endsWith(".ads.google.com")) {
    const campaignId = digits(q.get("campaignId"));
    const accountId = digits(q.get("__e")) ?? digits(q.get("__c")) ?? digits(q.get("customerId")) ?? digits(q.get("ocid"));
    if (!campaignId)
      return { platform: "google", accountId, error: "Abra a campanha no Google Ads e copie o link novamente." };
    if (!accountId) return { platform: "google", campaignId, error: "O link não traz o ID da conta Google Ads." };
    return { platform: "google", accountId, campaignId };
  }

  return { error: "Use um link do Gerenciador de Anúncios da Meta ou do Google Ads." };
}
