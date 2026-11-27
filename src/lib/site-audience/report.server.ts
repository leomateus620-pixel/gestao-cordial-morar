import { SITE_PUBLIC_HOSTS } from "@/lib/cordial-site/domains";
import { mediaPath } from "@/lib/cordial-site/presentation";
import { autoPropertySeo, propertySlug } from "@/lib/cordial-site/property-slug";
import { siteDb, summaries } from "@/lib/cordial-site/service.server";
import {
  audienceEnvironment,
  audienceOrigin,
  isProductionAudienceDashboard,
  resolveAudienceSettings,
} from "./privacy.server";
import type { AudiencePropertyRank, AudienceReport, AudienceReportInput } from "./report";

const dayInSaoPaulo = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// The shared database can legitimately lack this migration in a disabled code preview.
function disabledReport(
  input: AudienceReportInput,
  environment: "production" | "qa",
): AudienceReport {
  const now = new Date();
  const start = new Date(dayInSaoPaulo.format(now) + "T00:00:00Z");
  if (input.period === "month") {
    start.setUTCDate(1);
    start.setUTCMonth(start.getUTCMonth() - input.offset);
  } else if (input.period === "week") {
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7) - 7 * input.offset);
  } else {
    start.setUTCDate(start.getUTCDate() - input.offset);
  }
  const end = new Date(start);
  if (input.period === "month") end.setUTCMonth(end.getUTCMonth() + 1);
  else end.setUTCDate(end.getUTCDate() + (input.period === "week" ? 7 : 1));

  // Locate the first instant of the civil day, including historical UTC offset changes.
  const atStartOfDay = (civilDate: Date) => {
    const day = civilDate.toISOString().slice(0, 10);
    let before = civilDate.getTime() - 12 * 3600000;
    let after = civilDate.getTime() + 12 * 3600000;
    while (after - before > 1) {
      const middle = Math.floor((before + after) / 2);
      if (dayInSaoPaulo.format(middle) < day) before = middle;
      else after = middle;
    }
    return new Date(after).toISOString();
  };
  return {
    status: "disabled",
    brand: input.brand,
    period: input.period,
    offset: input.offset,
    environment,
    from: atStartOfDay(start),
    to: atStartOfDay(end),
    asOf: now.toISOString(),
    lastEventAt: null,
    collectionSince: null,
    collectionEnabled: false,
    partial: true,
  };
}

export async function loadSiteAudienceReport(
  input: AudienceReportInput,
  request: Request,
  userId: string,
): Promise<AudienceReport> {
  const environment = audienceEnvironment();
  if (environment === "production" && !isProductionAudienceDashboard(request))
    return disabledReport(input, environment);

  const settings = await resolveAudienceSettings(input.brand);
  const { data, error } = await siteDb().rpc("site_audience_report_for_user", {
    p_user_id: userId,
    p_brand: input.brand,
    p_environment: environment,
    p_period: input.period,
    p_offset: input.offset,
    p_view: input.view,
    p_policy_version: settings?.config.policyVersion ?? null,
  });
  if (!settings && error?.code === "PGRST202") return disabledReport(input, environment);

  if (!error && data?.status === "unauthorized") return { status: "unauthorized" };
  if (error || !data || data.brand !== input.brand || data.environment !== environment)
    throw new Error("Não foi possível consultar a audiência.");

  const report = data as AudienceReport;
  if (report.status !== "ready" || report.view !== "overview") return report;
  const ranked = report.overview.properties;
  const ids = [...new Set([...ranked.views, ...ranked.clicks].map((item) => item.publicId))];
  if (!ids.length) return report;
  try {
    const { items: publicListings } = await summaries(ids, input.brand);
    const origin =
      environment === "qa" && settings
        ? audienceOrigin(settings)
        : `https://${SITE_PUBLIC_HOSTS[input.brand]}`;
    const byId = new Map(
      publicListings.map((item) => [
        item.id,
        {
          name: autoPropertySeo(item).title,
          code: item.reference || null,
          coverUrl: item.cover
            ? new URL(mediaPath(item.cover, "card", input.brand), origin).href
            : null,
          url: new URL(`/imovel/${propertySlug(item)}`, origin).href,
        },
      ]),
    );
    const hydrate = (rank: AudiencePropertyRank[]) =>
      rank.map((item) => ({ ...item, listing: byId.get(item.publicId) ?? null }));
    return {
      ...report,
      overview: {
        ...report.overview,
        properties: { views: hydrate(ranked.views), clicks: hydrate(ranked.clicks) },
      },
    };
  } catch {
    throw new Error("Não foi possível verificar os imóveis públicos do relatório.");
  }
}
