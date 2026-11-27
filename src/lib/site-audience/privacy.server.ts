import { isIP } from "node:net";
import type { SiteBrand } from "@/lib/cordial-site/brand";
import { getSiteBrand } from "@/lib/cordial-site/brand";
import { GESTAO_HOSTS, SITE_PUBLIC_HOSTS, sitePublicHost } from "@/lib/cordial-site/domains";
import { siteDb } from "@/lib/cordial-site/service.server";
import type { AudienceAttribution, AudienceConfig } from "./contract";
import { audienceConfigSchema } from "./contract";
import type { AudienceChannel } from "./report";

type Environment = "production" | "qa";
export type AudienceSettings = {
  brand: SiteBrand;
  environment: Environment;
  host: string;
  config: AudienceConfig;
  approvedReferrers: string[];
  secret: string;
};
type Attribution = {
  channel: AudienceChannel;
  source: string | null;
  medium: string | null;
  campaign: string | null;
};

const officialHosts = Object.values(SITE_PUBLIC_HOSTS).flatMap((host) => [host, `www.${host}`]);
const restrictedHosts = new Set([...GESTAO_HOSTS, ...officialHosts]);
const productionDashboardHosts = new Set([...GESTAO_HOSTS, "gestao-cordial-morar.lovable.app"]);
const label = /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/;
const domain = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const localQaHost = /^(?:[a-z0-9][a-z0-9-]*\.)+localhost(?::[1-9][0-9]{0,4})?$/;
const approvedPolicy = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const list = (value?: string) => [
  ...new Set(
    (value ?? "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  ),
];
const safeLabel = (value?: string) => !!value && value.length <= 48 && label.test(value);

export function audienceEnvironment(env = process.env): Environment {
  return env.SITE_AUDIENCE_ENV === "qa" ? "qa" : "production";
}

export function isProductionAudienceDashboard(request: Request) {
  const url = new URL(request.url);
  return url.protocol === "https:" && productionDashboardHosts.has(url.host.toLowerCase());
}

function brandPrefix(brand: SiteBrand) {
  return brand === "cordial" ? "CORDIAL_SITE" : "MORAR_SITE";
}

function productionHost(brand: SiteBrand, env: NodeJS.ProcessEnv): string | null {
  const prefix = brandPrefix(brand);
  const host = sitePublicHost(brand, env[`VITE_${prefix}_PUBLIC_HOST`]);
  return (!env.SITE_AUDIENCE_ENV || env.SITE_AUDIENCE_ENV === "production") &&
    (env.SITE_AUDIENCE_INGRESS_VERIFIED === undefined ||
      env.SITE_AUDIENCE_INGRESS_VERIFIED === "true") &&
    (!env[`${prefix}_ENV`] || env[`${prefix}_ENV`] === "production") &&
    host === SITE_PUBLIC_HOSTS[brand]
    ? host
    : null;
}

function qaSettings(brand: SiteBrand, env: NodeJS.ProcessEnv): AudienceSettings | null {
  if (env.SITE_AUDIENCE_ENV !== "qa") return null;
  const prefix = brandPrefix(brand);
  const otherPrefix = brandPrefix(brand === "cordial" ? "morar" : "cordial");
  const siteEnvironment = env[`${prefix}_ENV`];
  const host = sitePublicHost(brand, env[`VITE_${prefix}_PUBLIC_HOST`]);
  const policyVersion = env[`${prefix}_AUDIENCE_POLICY_VERSION`];
  const secret = env.SITE_AUDIENCE_RATE_SECRET;
  const loopback = localQaHost.test(host) && env.SITE_AUDIENCE_LOCAL_QA === "true";
  if (
    !policyVersion ||
    !approvedPolicy.test(policyVersion) ||
    !secret ||
    secret.length < 32 ||
    env.SITE_AUDIENCE_INGRESS_VERIFIED !== "true" ||
    !siteEnvironment ||
    siteEnvironment === "production" ||
    (!domain.test(host) && !loopback) ||
    restrictedHosts.has(host) ||
    host !== env[`${prefix}_AUDIENCE_QA_HOST`]?.toLowerCase() ||
    host === env[`${otherPrefix}_AUDIENCE_QA_HOST`]?.toLowerCase() ||
    host === env[`VITE_${otherPrefix}_PUBLIC_HOST`]?.toLowerCase()
  )
    return null;

  const pairs = list(env[`${prefix}_AUDIENCE_UTM_PAIRS`])
    .flatMap((pair) => {
      const [source, medium, extra] = pair.split(":");
      return extra === undefined && safeLabel(source) && safeLabel(medium)
        ? [{ source, medium }]
        : [];
    })
    .slice(0, 100);
  const campaigns = list(env[`${prefix}_AUDIENCE_CAMPAIGNS`]).filter(safeLabel).slice(0, 100);
  const approvedReferrers = list(env[`${prefix}_AUDIENCE_REFERRERS`])
    .filter((value) => value.length <= 80 && domain.test(value))
    .slice(0, 100);
  const config = audienceConfigSchema.parse({ enabled: true, policyVersion, pairs, campaigns });
  return { brand, environment: "qa", host, config, approvedReferrers, secret };
}

async function readProductionSettings(brand: SiteBrand): Promise<unknown> {
  const { data, error } = await siteDb(AbortSignal.timeout(2000)).rpc(
    "site_audience_production_settings",
    { p_brand: brand },
  );
  if (error?.code === "PGRST202") return null;
  if (error) throw new Error("Não foi possível consultar a configuração de audiência.");
  return data;
}

export async function resolveAudienceSettings(
  brand: SiteBrand,
  env = process.env,
  readProduction = readProductionSettings,
): Promise<AudienceSettings | null> {
  if (env.SITE_AUDIENCE_ENV === "qa") return qaSettings(brand, env);
  const host = productionHost(brand, env);
  if (!host) return null;
  const read = await readProduction(brand);
  if (!read || typeof read !== "object") return null;
  const { policyVersion, notice, pairs, campaigns, referrers, secret } = read as Record<
    string,
    unknown
  >;
  const config = audienceConfigSchema.safeParse({
    enabled: true,
    policyVersion,
    notice,
    pairs,
    campaigns,
  });
  if (
    !config.success ||
    !config.data.notice ||
    !approvedPolicy.test(config.data.policyVersion) ||
    typeof secret !== "string" ||
    !/^[a-f0-9]{64}$/.test(secret) ||
    !Array.isArray(referrers) ||
    referrers.length > 100 ||
    !referrers.every(
      (value): value is string =>
        typeof value === "string" && value.length <= 80 && domain.test(value),
    )
  )
    return null;
  return {
    brand,
    environment: "production",
    host,
    config: config.data,
    approvedReferrers: referrers,
    secret,
  };
}

export function isAudienceHost(
  request: Request,
  brand: SiteBrand,
  endpoint: "audience" | "leads",
  env = process.env,
): boolean {
  const url = new URL(request.url);
  if (url.search || url.pathname !== `${getSiteBrand(brand).apiBase}/${endpoint}`) return false;
  const qa = env.SITE_AUDIENCE_ENV === "qa" ? qaSettings(brand, env) : null;
  const host = qa?.host ?? productionHost(brand, env);
  const localQa = qa && localQaHost.test(qa.host) && env.SITE_AUDIENCE_LOCAL_QA === "true";
  return !!host && url.host.toLowerCase() === host && (url.protocol === "https:" || !!localQa);
}

export function audienceOrigin(settings: AudienceSettings, env = process.env) {
  const local =
    settings.environment === "qa" &&
    localQaHost.test(settings.host) &&
    env.SITE_AUDIENCE_LOCAL_QA === "true";
  return `${local ? "http" : "https"}://${settings.host}`;
}

const sourceDomains: { channel: "organic" | "social"; source: string; domains: string[] }[] = [
  {
    channel: "organic",
    source: "google",
    domains: ["google.com", "google.com.br", "google.pt", "google.co.uk", "google.com.ar"],
  },
  { channel: "organic", source: "bing", domains: ["bing.com"] },
  { channel: "organic", source: "duckduckgo", domains: ["duckduckgo.com"] },
  { channel: "organic", source: "yahoo", domains: ["search.yahoo.com"] },
  { channel: "social", source: "facebook", domains: ["facebook.com", "fb.com"] },
  { channel: "social", source: "instagram", domains: ["instagram.com"] },
  { channel: "social", source: "linkedin", domains: ["linkedin.com"] },
  { channel: "social", source: "youtube", domains: ["youtube.com"] },
  { channel: "social", source: "tiktok", domains: ["tiktok.com"] },
  { channel: "social", source: "x", domains: ["x.com", "twitter.com", "t.co"] },
  { channel: "social", source: "whatsapp", domains: ["whatsapp.com", "wa.me"] },
];
const under = (hostname: string, parent: string) =>
  hostname === parent || hostname.endsWith(`.${parent}`);
const direct: Attribution = { channel: "direct", source: null, medium: null, campaign: null };

export function classifyAudienceAttribution(
  input: AudienceAttribution | undefined,
  settings: AudienceSettings,
): Attribution {
  if (!input) return direct;
  const pair = settings.config.pairs?.find(
    (candidate) => candidate.source === input.source && candidate.medium === input.medium,
  );
  if (pair) {
    const medium = pair.medium;
    const channel = /^(cpc|ppc|paid([-_][a-z0-9]+)?|cpm|cpa|display|retargeting|remarketing)$/.test(
      medium,
    )
      ? "paid"
      : /^(organic|organic_search)$/.test(medium)
        ? "organic"
        : /^(social|social_media)$/.test(medium)
          ? "social"
          : medium === "referral"
            ? "referral"
            : "campaign";
    return {
      channel,
      ...pair,
      campaign: settings.config.campaigns?.find((campaign) => campaign === input.campaign) ?? null,
    };
  }

  const hostname = input.referrerDomain;
  if (
    !hostname ||
    under(hostname, settings.host.replace(/:\d+$/, "")) ||
    [...restrictedHosts].some((host) => under(hostname, host))
  )
    return direct;
  const known = sourceDomains.find(({ domains }) =>
    domains.some((parent) => under(hostname, parent)),
  );
  if (known)
    return { channel: known.channel, source: known.source, medium: known.channel, campaign: null };
  const approved = settings.approvedReferrers.find((parent) => under(hostname, parent));
  return { channel: "referral", source: approved ?? null, medium: "referral", campaign: null };
}

function edgeIp(raw: string): string | null {
  if (raw.includes("%")) return null;
  const format = isIP(raw);
  if (!format) return null;
  if (format === 4) return Number(raw.split(".")[0]) < 240 ? raw : null;
  const ip = new URL(`http://[${raw}]/`).hostname.slice(1, -1);
  if (ip === "2a06:98c0:3600::103") return null;
  const mapped = /^::ffff:([a-f0-9]+):([a-f0-9]+)$/.exec(ip);
  if (!mapped) return ip;
  const [a, b] = [Number.parseInt(mapped[1], 16), Number.parseInt(mapped[2], 16)];
  return edgeIp([a >> 8, a & 255, b >> 8, b & 255].join("."));
}

export function audienceRequestIp(
  request: Request,
  environment: Environment,
  env = process.env,
): string | null {
  const ua = request.headers.get("user-agent") ?? "";
  if (
    !ua ||
    /\b(bot|crawler|spider|slurp|curl|wget)\b|facebookexternalhit/i.test(ua) ||
    (environment === "production" && /headless/i.test(ua))
  )
    return null;
  const supplied = request.headers.get("cf-connecting-ip") ?? "";
  const ip = edgeIp(supplied);
  if (!ip || list(env.SITE_AUDIENCE_INTERNAL_IPS).some((value) => edgeIp(value) === ip))
    return null;
  return ip;
}

const encoder = new TextEncoder();
async function keyedDigest(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return Array.from(
    new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function audienceRateKey(settings: AudienceSettings, ip: string, now = Date.now()) {
  return keyedDigest(
    settings.secret,
    `audience/rate/v1\n${settings.environment}\n${settings.brand}\n${Math.floor(now / 900000)}\n${ip}`,
  );
}

const proofPattern = /^([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})\.(\d{10,13})\.([a-f0-9]{64})$/;
const receiptScope = (settings: AudienceSettings) =>
  `${settings.environment}\n${settings.brand}\n${settings.config.policyVersion}`;

export async function makeAudienceFormProof(
  settings: AudienceSettings,
  submitNonce: string,
  propertyId?: string,
  now = Date.now(),
) {
  // Domain-separated HMAC over the public form request nonce, with no contact or CRM identifier.
  const hex = await keyedDigest(
    settings.secret,
    `audience/form-id/v1\n${settings.environment}\n${settings.brand}\n${submitNonce}`,
  );
  const id = [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
  const expires = Math.floor(now / 1000) + 300;
  const sig = await keyedDigest(
    settings.secret,
    `audience/form-proof/v1\n${receiptScope(settings)}\n${id}\n${expires}\n${propertyId ?? ""}`,
  );
  return `${id}.${expires}.${sig}`;
}

export async function verifyAudienceFormProof(
  settings: AudienceSettings,
  proof: string,
  propertyId?: string,
  now = Date.now(),
): Promise<string | null> {
  const match = proofPattern.exec(proof);
  if (!match) return null;
  const [, id, expires, supplied] = match;
  const current = Math.floor(now / 1000);
  if (Number(expires) < current || Number(expires) > current + 310) return null;
  const sig = await keyedDigest(
    settings.secret,
    `audience/form-proof/v1\n${receiptScope(settings)}\n${id}\n${expires}\n${propertyId ?? ""}`,
  );
  let mismatch = 0;
  for (let i = 0; i < sig.length; i++) mismatch |= sig.charCodeAt(i) ^ supplied.charCodeAt(i);
  return mismatch === 0 ? id : null;
}
