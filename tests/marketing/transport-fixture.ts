/* eslint-disable @typescript-eslint/no-explicit-any -- Isolated UI transport fixtures accept server-function envelopes. */
import type { MarketingCampaign } from "../../src/types/marketing";
const secretariat = () =>
  ["secretaria", "bianca", "meta_reviewer"].includes(
    new URLSearchParams(location.search).get("role") ?? "",
  );
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
    is_synthetic: true,
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
    is_synthetic: true,
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
export async function getMetaLeadDetail({ data }: any) {
  const row = fixtureLeads.find((lead) => lead.id === data.id);
  return {
    ...row,
    is_synthetic: true,
    meta_created_at: "2026-10-26T11:29:00Z",
    completed_at: row?.status === "imported" ? "2026-10-26T11:32:00Z" : null,
    history: [
      {
        id: "synthetic-event-1",
        status: row?.status,
        previous_status: "queued",
        occurred_at: row?.received_at,
      },
    ],
    field_data: [{ name: "interest", values: ["Resposta sintética preservada"] }],
    leadgen_id: "80001",
  };
}

// These handlers exist only in the isolated, visibly labelled synthetic harness.
const draftFixtures: any[] = [];
export async function listMetaAdDrafts({ data }: any = {}) {
  return draftFixtures.filter(
    (draft) => !data?.imobiliaria || draft.imobiliaria === data.imobiliaria,
  );
}
export async function saveMetaAdDraft({ data }: any) {
  const old = draftFixtures.find((draft) => draft.id === data.id);
  const saved = {
    ...old,
    ...data,
    id: old?.id ?? crypto.randomUUID(),
    connection_id: data.connectionId,
    account_id: "123456789",
    page_id: "987654321",
    revision: (old?.revision ?? 0) + 1,
    status: "rascunho",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    payload: { ...data.payload, pageId: "987654321" },
  };
  if (old) draftFixtures.splice(draftFixtures.indexOf(old), 1, saved);
  else draftFixtures.push(saved);
  return saved;
}
export async function getMetaAdDraft({ data }: any) {
  return { ...draftFixtures.find((draft) => draft.id === data.id), commands: [], hierarchy: [] };
}
export async function submitMetaAdDraft() {
  throw new Error("Prévia sintética: nenhum comando real autorizado.");
}
export async function reconcileMetaAdCommand() {
  return { ok: true };
}
export async function refreshMetaAdDraft() {
  return { ok: true };
}
export async function changeMetaAdDelivery() {
  throw new Error("Prévia sintética sem entrega real.");
}
export async function changeMetaAdBudget() {
  throw new Error("Prévia sintética sem orçamento real.");
}
export async function uploadMetaAdImage() {
  throw new Error("Prévia sintética sem upload externo.");
}
export async function listMetaAdCreationAssets() {
  return {
    accountId: "123456789",
    accountName: "Conta sintética Cordial",
    currency: "BRL",
    timezone: "America/Sao_Paulo",
    page: { id: "987654321", name: "Página sintética Cordial" },
    images: [{ hash: "syntheticimage001", name: "Imagem de teste identificada", url: "" }],
    forms: [{ id: "50001", name: "Formulário sintético" }],
    writing: { state: "unverified", checkedAt: null, evidence: "Nenhuma escrita real executada" },
  };
}
export async function previewMarketingReport({ data }: any) {
  return {
    version: 1,
    scope: data,
    capturedAt: new Date().toISOString(),
    financialVisible: !secretariat(),
    total: 2,
    rows: [],
    kpis: { hasData: true, leads: 36 },
    funnel: { submissions: 2, attendances: 1, linkedSubmissions: 1 },
    coverage: { data: 2, empty: 0, pending: 0, partial: 0, error: 0 },
    timezones: ["America/Sao_Paulo"],
  };
}
const reportFixtures: any[] = [];
export async function generateMarketingReport({ data }: any) {
  const report = {
    id: crypto.randomUUID(),
    kind: data.type,
    status:
      new URLSearchParams(location.search).get("reportState") === "queued" ? "queued" : "ready",
    scope: data,
    created_at: new Date().toISOString(),
  };
  reportFixtures.unshift(report);
  return { id: report.id, status: report.status };
}
export async function listMarketingReports() {
  return reportFixtures;
}
export async function downloadMarketingReport() {
  throw new Error("Prévia sintética sem arquivo privado real.");
}
export async function getMetaLeadHealth() {
  return {
    mappedForms: 1,
    submissions: 2,
    lastEvent: "2026-10-28T13:00:00Z",
    queued: 0,
    needsReview: 1,
    lastAttendance: "2026-10-28T13:01:00Z",
    endToEnd: "unverified",
    recoveryWindow: "Dados sintéticos; nenhuma prova externa.",
  };
}
export async function recoverMetaFormLeads() {
  return { id: crypto.randomUUID(), status: "queued", processed: 0, hasMore: true };
}
export const META_LEADGEN_CALLBACK = "https://cordialgestao.com/api/public/meta/leadgen";
export async function getMetaWebhookStatus() {
  return {
    callbackUrl: META_LEADGEN_CALLBACK,
    backend: { ready: false, missing: [] },
    verification: null,
    appSubscribed: null,
    pageSubscribed: null,
    workerActive: null,
    lastProcessedAt: null,
    recoverableFailures: 0,
    queued: 0,
    checkedAt: new Date().toISOString(),
  };
}
export async function listMetaLeadRecoveries() {
  return [];
}
export async function listMetaEntityInsights() {
  return {
    job: null,
    snapshotJobId: null,
    snapshotAt: null,
    apiVersion: "v26.0",
    attributionRequested: null,
    rows: [],
    total: 0,
    financialVisible: !secretariat(),
    currency: "BRL",
    timezone: "America/Sao_Paulo",
  };
}
export async function enqueueMetaEntityInsights() {
  return { id: crypto.randomUUID() };
}
export async function cancelMetaEntityInsights() {
  return { ok: true, externalReportDeleted: false };
}
export async function resumeMetaAdCommand() {
  throw new Error("Prévia sintética sem retomada externa.");
}
export async function generateMetaEntityReport() {
  return { id: crypto.randomUUID(), status: "ready" };
}

export async function getMarketingActionPermissions() {
  const role = new URLSearchParams(location.search).get("role");
  const operations = [
    "create_draft",
    "read_ad_budget",
    "send_paused",
    "change_budget",
    "set_delivery",
  ];
  const admin = !["secretaria", "bianca", "meta_reviewer"].includes(role ?? "");
  const permissions = Object.fromEntries([
    ["read_metrics", true],
    ["manage_connection", admin],
    ["manage_manual", role !== "meta_reviewer"],
    ["financial_report", admin],
    ...operations.map((action) => [action, admin || role === "bianca"]),
  ]);
  return { cordial: { ...permissions }, morar: { ...permissions } };
}
