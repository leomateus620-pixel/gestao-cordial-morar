import type { SiteBrand } from "@/lib/cordial-site/brand";
import { SITE_PUBLIC_HOSTS } from "@/lib/cordial-site/domains";
import type {
  AudiencePropertyRank,
  AudienceReport,
  AudienceReportInput,
} from "@/lib/site-audience/report";

const DAY = 86_400_000;
const NOVEMBER = new Date("2026-11-01T03:00:00.000Z").getTime();
const NOVEMBER_23 = new Date("2026-11-23T03:00:00.000Z").getTime();
const NOVEMBER_26 = new Date("2026-11-26T03:00:00.000Z").getTime();
const now = new Date("2026-11-26T18:03:00.000Z").getTime();
const fixtureBrand = {
  cordial: {
    names: [
      "Casa térrea no Jardim Europa",
      "Apartamento na Vila Madalena",
      "Sobrado na Vila Nova",
      "Apartamento no Centro",
      "Casa na Vila Real",
    ],
    code: "CD",
    scale: 1,
  },
  morar: {
    names: [
      "Casa com varanda no Jardim das Oliveiras",
      "Apartamento no Alto do Lago",
      "Casa na Vila Santa Cecília",
      "Apartamento no Jardim América",
      "Chácara no Vale Verde",
    ],
    code: "MI",
    scale: 0.63,
  },
};

function getProperty(
  brand: SiteBrand,
  index: number,
  views: number,
  clicks: number,
  coverUrl: string | null,
): AudiencePropertyRank {
  const config = fixtureBrand[brand];
  return {
    publicId: brand + "-" + index,
    listing:
      index === 3
        ? null
        : {
            name: config.names[index],
            code: config.code + "-" + (1042 + index),
            coverUrl: index === 0 ? coverUrl : null,
            url: "https://" + SITE_PUBLIC_HOSTS[brand] + "/",
          },
    views,
    clicks,
    sessions: Math.floor(views * 0.86),
    reopens: Math.ceil(views * 0.08),
    returnSessions: index === 0 ? Math.floor(views * 0.03) : null,
    whatsapp: Math.floor(views * 0.12),
    forms: index === 0 ? Math.floor(views * 0.02) : null,
    previews: Math.floor(views * 0.25),
  };
}

export function createAudienceFixture(
  variant: string | null,
  coverUrls: Partial<Record<SiteBrand, string>> = {},
) {
  return async ({ brand, period, offset, view }: AudienceReportInput): Promise<AudienceReport> => {
    if (variant === "loading") await new Promise((resolve) => setTimeout(resolve, 2500));
    if (variant === "error") throw new Error("Erro de demonstração");
    if (variant === "unauthorized") return { status: "unauthorized" };
    const offsetMonth = (months: number) => Date.UTC(2026, 10 - months, 1, 3);
    const start =
      period === "day"
        ? NOVEMBER_26 - offset * DAY
        : period === "week"
          ? NOVEMBER_23 - offset * 7 * DAY
          : offsetMonth(offset);
    const end =
      period === "day"
        ? start + DAY
        : period === "week"
          ? start + 7 * DAY
          : offsetMonth(offset - 1);
    const metadata = {
      brand,
      period,
      offset,
      from: new Date(start).toISOString(),
      to: new Date(end).toISOString(),
      asOf: new Date(now).toISOString(),
      lastEventAt: variant === "zero" ? null : "2026-11-26T17:56:37.000Z",
      collectionSince: variant === "disabled" ? null : new Date(NOVEMBER - 5 * DAY).toISOString(),
      collectionEnabled: variant !== "disabled" && variant !== "retained",
      partial: variant === "partial" || variant === "retained",
      environment: "qa" as const,
    };
    if (variant === "disabled") return { ...metadata, status: "disabled" };
    if (variant === "unavailable" || offset > 1) return { ...metadata, status: "unavailable" };
    const step = period === "day" ? DAY / 24 : DAY;
    const hours = [
      14, 9, 6, 3, 7, 13, 22, 30, 38, 46, 33, 54, 63, 40, 56, 33, 44, 57, 65, 46, 57, 38, 34, 24,
    ];
    const days = [264, 330, 293, 407, 526, 405, 273];
    const currentScale = fixtureBrand[brand].scale * (variant === "zero" ? 0 : 1);
    const currentAmount = (value: number) => Math.round(value * currentScale);
    const partialDay = hours.slice(0, Math.ceil((now - NOVEMBER_26) / (DAY / 24)));
    const todayViews = partialDay.reduce((total, hour) => total + currentAmount(hour), 0);
    const dailyAmount = (date: number) => days[(new Date(date).getUTCDay() + 6) % 7];
    const trend = Array.from(
      { length: Math.ceil((Math.min(end, now) - start) / step) },
      (_, index) => {
        const date = start + index * step;
        const count = period === "day" ? hours[index] : dailyAmount(date);
        return {
          start: new Date(date).toISOString(),
          views:
            step === DAY && date === NOVEMBER_26
              ? todayViews
              : Math.round(count * currentScale * (offset === 0 ? 1 : 0.82)),
        };
      },
    );
    const summary = (views: number) => {
      const sessions = Math.round(views * 0.58);
      return { views, sessions, visitors: Math.round(sessions * 0.79) };
    };
    const { visitors, sessions, views } = summary(
      trend.reduce((sum, point) => sum + point.views, 0),
    );
    const thisWeek = summary(
      days.slice(0, 3).reduce((total, day) => total + currentAmount(day), todayViews),
    );
    const pages = [
      "property",
      "home",
      "buy",
      "rent",
      "search",
      "news",
      "districts",
      "contact",
      "advertise",
    ]
      .map((key, index) => ({
        key,
        count: Math.round(views * [0.36, 0.29, 0.13, 0.09, 0.06, 0.02, 0.02, 0.02, 0.01][index]),
      }))
      .filter((row) => row.count > 0);
    const menus = ["buy", "rent", "search", "districts", "contact", "news", "advertise"]
      .map((key, index) => ({
        key,
        count: Math.floor(sessions * [0.25, 0.18, 0.08, 0.07, 0.05, 0.03, 0.02][index]),
      }))
      .filter((row) => row.count > 0);
    if (view === "pages") return { ...metadata, status: "ready", view, pages, menus };
    if (view === "origins") {
      const origins = [
        {
          channel: "organic" as const,
          source: "google.com",
          medium: "organic",
          campaign: null,
          entryPage: "home",
          portion: 0.32,
        },
        {
          channel: "paid" as const,
          source: "google",
          medium: "cpc",
          campaign: "visita-agendada",
          entryPage: "buy",
          portion: 0.26,
        },
        {
          channel: "direct" as const,
          source: null,
          medium: null,
          campaign: null,
          entryPage: "property",
          portion: 0.24,
        },
        {
          channel: "social" as const,
          source: "instagram.com",
          medium: "social",
          campaign: null,
          entryPage: "home",
          portion: 0.11,
        },
        {
          channel: "referral" as const,
          source: "parceiros.example",
          medium: null,
          campaign: null,
          entryPage: "home",
          portion: 0.04,
        },
      ]
        .map(({ portion, ...value }, index) => ({
          ...value,
          sessions: Math.floor(sessions * portion),
          propertySessions: Math.floor(sessions * portion * 0.46),
          contactSessions: index === 4 ? null : Math.floor(sessions * portion * 0.07),
        }))
        .filter((row) => row.sessions > 0);
      return {
        ...metadata,
        status: "ready",
        view,
        origins,
        withheldSessions: sessions - origins.reduce((sum, row) => sum + row.sessions, 0),
        totalSessions: sessions,
      };
    }
    const properties = [0.12, 0.088, 0.069, 0.041, 0.026]
      .map((portion, index) =>
        getProperty(
          brand,
          index,
          Math.floor(views * portion),
          Math.floor(views * (index === 1 ? 0.083 : portion * 0.61)),
          coverUrls[brand] ?? null,
        ),
      )
      .filter((row) => row.views > 0);
    const active = Math.floor(sessions * 0.65);
    const withProperty = Math.floor(sessions * 0.55);
    const ratio = (value: number, sample = sessions) =>
      sample > 0 ? { count: Math.round(value * sample), sample } : null;
    return {
      ...metadata,
      status: "ready",
      view,
      overview: {
        totals: { visitors, sessions, views },
        previous: {
          visitors: Math.round(visitors * 0.85),
          sessions: Math.round(sessions * 0.93),
          views: Math.round(views * 1.05),
        },
        today: summary(todayViews),
        week: thisWeek,
        trend,
        properties: {
          views: properties,
          clicks: [...properties].sort((a, b) => b.clicks - a.clicks),
        },
        pages: pages.slice(0, 5),
        menus: menus.slice(0, 5),
        behavior: {
          quickExits: ratio(0.245, active),
          activeTime: active ? { medianSeconds: 76, sample: active, total: sessions } : null,
          multipleProperties: ratio(0.351),
          sameSessionReopen: ratio(0.112, withProperty),
          laterSessionReturn: ratio(0.063, withProperty),
          searchToSecondProperty: ratio(0.214),
          propertyToWhatsapp: ratio(0.081),
          forms: ratio(0.026),
        },
      },
    };
  };
}
