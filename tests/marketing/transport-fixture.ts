/* eslint-disable @typescript-eslint/no-explicit-any -- Isolated UI transport fixtures accept server-function envelopes. */
import type { MarketingCampaign } from "../../src/types/marketing";
const secretariat = () => new URLSearchParams(location.search).get("role") === "secretaria";
export const fixtureCampaigns: MarketingCampaign[] = [
  "Captação de imóveis · Cordial",
  "Apartamentos no centro · Morar",
  "Pesquisa Google · Cordial",
].map((name, index) => ({
  id: `10000000-0000-4000-8000-00000000000${index + 1}`,
  name,
  channel: index === 2 ? "Google" : "Facebook",
  objective: "Leads qualificados",
  status: index === 1 ? "Pausada" : "Ativa",
  startDate: "2026-10-01",
  endDate: "2026-10-31",
  investment: secretariat() ? null : 600 + index * 200,
  leads: 12 + index * 3,
  clicks: 180,
  accesses: 65,
  views: 12000,
  impressions: 12000,
  conversionRate: 18,
  costPerLead: secretariat() ? null : 50,
  bestLocation: "—",
  responsiblePerson: "",
  notes: "Dados sintéticos para validar o layout.",
  diagnosis: "",
  dailyMetrics: Array.from({ length: 26 }, (_, d) => ({
    date: `2026-10-${String(d + 1).padStart(2, "0")}`,
    leads: d % 3 === 0 ? 2 : 0,
    clicks: 6 + (d % 4),
    accesses: 2,
    views: 450,
    impressions: 450,
    reach: 300,
    frequency: 1.5,
    ...(secretariat() ? {} : { spend: 20 + d }),
  })),
  locationBreakdown: [],
  createdAt: "2026-10-01T12:00:00Z",
  updatedAt: "2026-10-26T11:00:00Z",
  imobiliaria: index === 1 ? "morar" : "cordial",
  platform: index === 2 ? "google" : "meta",
  externalCampaignId: String(90001 + index),
  externalAccountId: "123456789",
  connectionId: "30000000-0000-4000-8000-000000000001",
  currency: "BRL",
  accountTimezone: "America/Sao_Paulo",
  financialVisible: !secretariat(),
  lastSyncedAt: "2026-10-26T11:00:00Z",
  syncStatus: index === 1 ? "error" : "synced",
  syncError: index === 1 ? "Permissão de leitura pendente." : null,
}));
export async function listCampaigns({ data }: any = {}) {
  const rows = fixtureCampaigns.filter(
    (c) => !data?.imobiliaria || data.imobiliaria === "todas" || c.imobiliaria === data.imobiliaria,
  );
  return { campaigns: rows, total: rows.length, page: 0, pageSize: 25 };
}
export async function listAdConnections() {
  const partial = new URLSearchParams(location.search).get("state") === "partial";
  return ["meta", "google"].map((platform) =>
    platform === "meta" && partial
      ? {
          id: "30000000-0000-4000-8000-000000000001",
          imobiliaria: "cordial",
          platform,
          configured: true,
          status: "connected",
          accountLabel: "Conta sintética Cordial",
          accountId: "123456789",
          pageId: "987654321",
          appId: "123123123",
          credentialMode: "system_user",
          expiresAt: null,
          lastError: null,
          capabilities: {
            credential_present: true,
            token_valid: true,
            ads_readable: true,
            page_readable: true,
            leads_readable: false,
            app_webhook_configured: false,
            page_subscribed: false,
            expires_at: null,
            scopes: ["ads_read"],
            checked_at: "2026-10-26T12:00:00Z",
            last_successful_sync: null,
            errors: [{ capability: "leads", code: "no_permission" }],
          },
        }
      : {
          platform,
          configured: false,
          status: "not_configured",
          accountLabel: null,
          expiresAt: null,
          lastError: null,
        },
  );
}
export async function importCampaignFromLink() {
  return {
    ok: false,
    code: "not_configured",
    message: "Prévia sintética: credenciais não configuradas.",
  };
}
export async function syncCampaign() {
  return {
    ok: true,
    campaignId: fixtureCampaigns[0].id,
    name: "Campanha de demonstração",
    days: 0,
    queued: true,
  };
}
export async function startAdOAuth() {
  return { ok: false, code: "not_configured", message: "Prévia sintética sem OAuth." };
}
export async function createCampaign({ data }: any) {
  return { ...fixtureCampaigns[0], id: crypto.randomUUID(), ...data };
}
export async function updateCampaign({ data }: any) {
  return { ...fixtureCampaigns[0], ...data?.input };
}
export async function deleteCampaign() {
  return true;
}
export async function upsertDailyMetric() {
  return true;
}
export async function listCampaignPage({ data }: any = {}) {
  if (new URLSearchParams(location.search).get("state") === "error")
    throw new Error("Falha sintética de transporte.");
  const selected =
    new URLSearchParams(location.search).get("state") === "empty"
      ? []
      : fixtureCampaigns.filter(
          (c) =>
            (!data?.imobiliaria || c.imobiliaria === data.imobiliaria) &&
            (!data?.search || c.name.toLowerCase().includes(data.search.toLowerCase())) &&
            (!data?.platform || c.platform === data.platform) &&
            (!data?.status || c.status === data.status) &&
            (!data?.accountId || c.externalAccountId === data.accountId),
        );
  const total = (since: string, until: string) => {
    const days = selected.flatMap((c) =>
      c.dailyMetrics.filter((d) => d.date >= since && d.date <= until),
    );
    return {
      spend: secretariat() ? null : days.reduce((v, d) => v + (d.spend ?? 0), 0),
      leads: days.reduce((v, d) => v + d.leads, 0),
      clicks: days.reduce((v, d) => v + d.clicks, 0),
      impressions: days.reduce((v, d) => v + (d.impressions ?? 0), 0),
      active_campaigns: selected.filter((c) => c.status === "Ativa").length,
      currencies: ["BRL"],
      has_data: days.length > 0,
    };
  };
  return {
    items: selected,
    total: selected.length,
    financialVisible: !secretariat(),
    page: 1,
    pageSize: 25,
    summary: {
      current: total(data?.currentSince ?? "2026-10-01", data?.until ?? "2026-10-26"),
      previous: total(data?.since ?? "2026-09-01", data?.previousUntil ?? "2026-09-26"),
    },
  };
}
export async function listAdSyncJobs() {
  return [];
}
export async function listMetaAccounts() {
  return [];
}
export async function listMetaCampaigns() {
  return [];
}
export const importDiscoveredMetaCampaign = importCampaignFromLink;
export async function configureMetaSystemConnection() {
  throw new Error("Prévia sintética sem configuração real.");
}
export async function diagnoseMetaConnection() {
  return {
    credential_present: false,
    token_valid: null,
    ads_readable: null,
    page_readable: null,
    leads_readable: null,
    app_webhook_configured: null,
    page_subscribed: null,
    expires_at: null,
    scopes: [],
    checked_at: "2026-10-26T12:00:00Z",
    last_successful_sync: null,
    errors: [],
  };
}
const fixtureLeads = [
  {
    id: "40000000-0000-4000-8000-000000000001",
    status: "unassigned",
    imobiliaria: "cordial",
    full_name: "Contato de demonstração",
    phone: "+55 00 00000-0000",
    email: null,
    campaign_id: fixtureCampaigns[0].id,
    external_campaign_id: "90001",
    form_id: "50001",
    received_at: "2026-10-26T11:30:00Z",
    broker_id: null,
    attendance_id: "60000000-0000-4000-8000-000000000001",
    last_error: null,
  },
  {
    id: "40000000-0000-4000-8000-000000000002",
    status: "review",
    imobiliaria: "morar",
    full_name: null,
    phone: null,
    email: null,
    campaign_id: null,
    external_campaign_id: null,
    form_id: "50002",
    received_at: "2026-10-26T11:31:00Z",
    broker_id: null,
    attendance_id: null,
    last_error: "incomplete_fields_or_mapping",
  },
];
export async function listMetaLeads({ data }: any = {}) {
  const items = fixtureLeads.filter(
    (c) =>
      (!data?.status || c.status === data.status) &&
      (!data?.imobiliaria || c.imobiliaria === data.imobiliaria),
  );
  return { items, total: items.length };
}
export async function retryMetaLead() {
  return { ok: true };
}
export async function assignMetaLead({ data }: any) {
  const lead = fixtureLeads.find((c) => c.id === data.id);
  if (lead) {
    lead.status = "imported";
    lead.broker_id = data.brokerId;
  }
  return { ok: true };
}
export async function resolveMetaLead() {
  return { ok: true };
}
export async function saveMetaLeadFormMapping() {
  return { ok: true };
}
export async function listMetaLeadFormMappings() {
  return [];
}

export async function listAttendanceBrokers() {
  return [
    {
      id: "70000000-0000-4000-8000-000000000001",
      nome: "Corretor de demonstração",
      imobiliaria: "cordial",
      brand: "cordial",
      agencies: ["cordial"],
    },
  ];
}

export async function listImoveis() {
  return { items: [], data: [], total: 0 };
}

export async function listMetaLeadForms() {
  return [{ id: "50001", name: "Formulário sintético", status: "ACTIVE" }];
}
export async function getMetaLeadDetail() {
  return {
    field_data: [{ name: "interest", values: ["Resposta sintética preservada"] }],
    leadgen_id: "80001",
  };
}
