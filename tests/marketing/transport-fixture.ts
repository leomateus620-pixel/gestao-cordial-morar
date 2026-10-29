/* eslint-disable @typescript-eslint/no-explicit-any -- Isolated UI transport fixtures accept server-function envelopes. */
import type { MarketingCampaign } from "../../src/types/marketing";
const secretariat = () =>
  ["secretaria", "bianca", "meta_reviewer"].includes(
    new URLSearchParams(location.search).get("role") ?? "",
  );
const previewParams = new URLSearchParams(location.search);
const baseCampaignNames = [
  "Captação de imóveis · Cordial",
  "Apartamentos no centro · Morar",
  "Pesquisa Google · Cordial",
];
const requestedCampaignCount = Number(previewParams.get("campaignCount"));
const campaignCount =
  Number.isInteger(requestedCampaignCount) && requestedCampaignCount > 0
    ? Math.min(requestedCampaignCount, 150)
    : baseCampaignNames.length;
export const fixtureCampaigns: MarketingCampaign[] = Array.from(
  { length: campaignCount },
  (_, index) => ({
    id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    name: `${baseCampaignNames[index % 3]}${index >= 3 ? ` · Teste ${index + 1}` : ""}${previewParams.get("longNames") === "1" ? " · [TESTE SINTÉTICO] Campanha de imóveis residenciais com nome completo preservado para testar leitura e navegação em dispositivos menores" : ""}`,
    channel: index % 3 === 2 ? "Google" : "Facebook",
    objective: "Leads qualificados",
    status: index % 3 === 1 ? "Pausada" : "Ativa",
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
    dailyMetrics: [...(previewParams.get("comparison") === "1" ? ["2026-09"] : []), "2026-10"]
      .flatMap((month) =>
        Array.from({ length: 26 }, (_, d) => ({
          date: `${month}-${String(d + 1).padStart(2, "0")}`,
          leads: d % 3 === 0 ? (month === "2026-09" ? 1 : 2) : 0,
          clicks: 6 + (d % 4),
          accesses: 2,
          views: 450,
          impressions: 450,
          reach: 300,
          frequency: 1.5,
          ...(secretariat() ? {} : { spend: (month === "2026-09" ? 16 : 20) + d }),
        })),
      )
      .filter(
        (metric) =>
          previewParams.get("state") !== "incomplete" ||
          !["2026-10-10", "2026-10-11", "2026-10-12"].includes(metric.date),
      ),
    locationBreakdown: [],
    createdAt: "2026-10-01T12:00:00Z",
    updatedAt: "2026-10-26T11:00:00Z",
    imobiliaria: index % 3 === 1 ? "morar" : "cordial",
    platform: index % 3 === 2 ? "google" : "meta",
    externalCampaignId: String(90001 + index),
    externalAccountId: index % 3 === 2 ? "1234567890" : "123456789",
    connectionId: "30000000-0000-4000-8000-000000000001",
    currency: "BRL",
    accountTimezone: "America/Sao_Paulo",
    financialVisible: !secretariat(),
    lastSyncedAt: "2026-10-26T11:00:00Z",
    syncStatus:
      previewParams.get("state") === "pending" ? "queued" : index % 3 === 1 ? "error" : "synced",
    syncError:
      index % 3 === 1 && previewParams.get("state") !== "pending"
        ? "Permissão de leitura pendente."
        : null,
  }),
);
/** Synthetic-only data for the isolated Google UI preview. */
export async function getGoogleMarketingOverview({ data }: any) {
  const scenario = new URLSearchParams(location.search).get("googleScenario");
  if (["trend", "empty", "loading", "complete", "gaps"].includes(scenario ?? "")) {
    // These optional scenarios are isolated preview evidence, never provider observations.
    if (scenario === "loading") return new Promise<never>(() => {});
    const financial = !secretariat();
    const none = {
      cost: null,
      clicks: null,
      impressions: null,
      conversions: null,
      ctr: null,
      cpc: null,
      costPerConversion: null,
    };
    const decimal = (amount: bigint, digits: number) => {
      const base = 10n ** BigInt(digits);
      return `${amount / base}.${String(amount % base).padStart(digits, "0")}`;
    };
    const ratio = (numerator: bigint, denominator: bigint, scale = 1n) =>
      denominator === 0n
        ? null
        : decimal((numerator * scale * 1_000_000n + denominator / 2n) / denominator, 6);
    const totals = (
      rows: Array<{ micros: bigint; clicks: bigint; impressions: bigint; quarters: bigint }>,
    ) => {
      if (!rows.length) return { ...none };
      const sum = rows.reduce(
        (value, row) => ({
          micros: value.micros + row.micros,
          clicks: value.clicks + row.clicks,
          impressions: value.impressions + row.impressions,
          quarters: value.quarters + row.quarters,
        }),
        { micros: 0n, clicks: 0n, impressions: 0n, quarters: 0n },
      );
      return {
        cost: financial ? decimal(sum.micros, 6) : null,
        clicks: String(sum.clicks),
        impressions: String(sum.impressions),
        conversions: decimal(sum.quarters * 25n, 2),
        ctr: ratio(sum.clicks, sum.impressions, 100n),
        cpc: financial ? ratio(sum.micros, sum.clicks * 1_000_000n) : null,
        costPerConversion: financial ? ratio(sum.micros * 4n, sum.quarters * 1_000_000n) : null,
      };
    };
    const clickValues = [32, 41, 48, 49, 91, 70, 101, 66, 83, 56, 30, 52, 61, 57, 0];
    const campaignRows = [
      { name: "Pesquisa · Imóveis em Santa Rosa", status: "Ativa", channel: "Pesquisa" },
      { name: "Performance Max · Novos imóveis", status: "Ativa", channel: "Performance Max" },
      { name: "Remarketing · Apartamentos", status: "Pausada", channel: null },
    ].map((campaign, index) => {
      const observations = Array.from({ length: 31 }, (_, day) => {
        const date = `2026-10-${String(day + 1).padStart(2, "0")}`;
        const clicks =
          BigInt(day >= 14 ? clickValues[(day - 14) % clickValues.length] : 24 + ((day * 7) % 43)) *
          BigInt(index === 1 ? 2 : 1);
        return {
          date,
          micros: clicks * BigInt(index === 1 ? 176_431 : 263_157) + 123_456n,
          clicks,
          impressions: clicks * BigInt(13 + index * 2) + 117n,
          quarters: BigInt((day + index) % 5 === 0 ? 5 + index : 0),
        };
      }).filter(
        (row, day) =>
          scenario !== "empty" &&
          (scenario === "complete" || (index !== 2 && day >= 14 && day <= 28)) &&
          (scenario !== "gaps" || ![18, 19, 24].includes(day)) &&
          row.date >= data.since &&
          row.date <= data.until,
      );
      return {
        ...campaign,
        id: `10000000-0000-4000-8000-${String(index + 3).padStart(12, "0")}`,
        name: `${campaign.name} · EXEMPLO SINTÉTICO${previewParams.get("longNames") === "1" ? " · Campanha residencial com nome completo preservado para testar leitura, detalhamento e navegação em dispositivos menores" : ""}`,
        nativeStatus: null,
        channelType: campaign.channel,
        channelSubtype: null,
        accountId: "1234567890",
        accountName: "Conta sintética",
        dataInicio: "2026-10-01",
        dataFim: "2037-12-30",
        agency: "cordial",
        currency: "BRL",
        timezone: "America/Sao_Paulo",
        lastCollectedAt: observations.length ? "2026-10-29T03:17:49Z" : null,
        coverage: observations.length
          ? scenario === "complete"
            ? "complete"
            : "partial"
          : "unavailable",
        metrics: totals(observations),
        dailySeries: observations.length
          ? observations.map((row) => ({ date: row.date, metrics: totals([row]) }))
          : null,
        observations,
      };
    });
    const selected = campaignRows.filter(
      (campaign) =>
        (!data.agency || data.agency === campaign.agency) &&
        (!data.accountId || data.accountId === campaign.accountId) &&
        (!data.search || campaign.name.toLowerCase().includes(String(data.search).toLowerCase())) &&
        (!data.status || data.status === campaign.status),
    );
    const observations = selected.flatMap((campaign) => campaign.observations);
    const dates = [...new Set(observations.map((row) => row.date))].sort();
    const sortMetric: Record<string, keyof typeof none> = {
      cost_desc: "cost",
      impressions_desc: "impressions",
      clicks_desc: "clicks",
      conversions_desc: "conversions",
      ctr_desc: "ctr",
      cpc_desc: "cpc",
      cost_per_conversion_desc: "costPerConversion",
    };
    const compareMetric = (left: string | null, right: string | null) => {
      if (left === null) return right === null ? 0 : 1;
      if (right === null) return -1;
      const parts = [left, right].map((value) => {
        const [whole, fraction = ""] = value.split(".");
        return BigInt(whole + fraction.padEnd(6, "0"));
      });
      return parts[0] > parts[1] ? -1 : parts[0] < parts[1] ? 1 : 0;
    };
    const sorted = [...selected].sort((left, right) => {
      const metric = sortMetric[data.sort];
      const order = metric
        ? compareMetric(left.metrics[metric], right.metrics[metric])
        : data.sort === "name_desc"
          ? right.name.localeCompare(left.name, "pt-BR")
          : data.sort === "status_asc"
            ? left.status.localeCompare(right.status, "pt-BR")
            : data.sort === "updated_desc"
              ? 0
              : left.name.localeCompare(right.name, "pt-BR");
      return order || left.id.localeCompare(right.id);
    });
    const page = data.page ?? 1;
    const pageSize = data.pageSize ?? 25;
    const observed = observations.length > 0;
    return {
      scope: {
        agency: data.agency ?? null,
        accountId: data.accountId ?? null,
        since: data.since,
        until: data.until,
      },
      coverage: observed ? (scenario === "complete" ? "complete" : "partial") : "unavailable",
      accounts:
        data.agency === "morar"
          ? []
          : [{ id: "1234567890", name: "Conta sintética", agency: "cordial" }],
      accountName: selected.length ? "Conta sintética" : null,
      currency: selected.length ? "BRL" : null,
      timezone: selected.length ? "America/Sao_Paulo" : null,
      lastCollectedAt: observed ? "2026-10-29T03:17:49Z" : null,
      summary: totals(observations),
      series: observed
        ? dates.map((date) => ({
            date,
            metrics: totals(observations.filter((row) => row.date === date)),
          }))
        : null,
      total: selected.length,
      page,
      pageSize,
      sort: data.sort ?? "name_asc",
      items: sorted
        .slice((page - 1) * pageSize, page * pageSize)
        .map(({ observations: _rows, channel: _channel, ...campaign }) => campaign),
    };
  }
  const show =
    (!data.agency || data.agency === "cordial") &&
    (!data.accountId || data.accountId === "1234567890") &&
    (!data.search || "pesquisa google".includes(String(data.search).toLowerCase())) &&
    (!data.status || data.status === "Ativa");
  const financial = !secretariat();
  const metric = {
    cost: financial ? "120.456789" : null,
    clicks: "32",
    impressions: "800",
    conversions: "2.75",
    ctr: "4",
    cpc: financial ? "3.76427465625" : null,
    costPerConversion: financial ? "43.802468" : null,
  };
  const none = {
    cost: null,
    clicks: null,
    impressions: null,
    conversions: null,
    ctr: null,
    cpc: null,
    costPerConversion: null,
  };
  const observed = show && data.since <= "2026-10-15" && data.until >= "2026-10-15";
  return {
    scope: {
      agency: data.agency ?? null,
      accountId: data.accountId ?? null,
      since: data.since,
      until: data.until,
    },
    coverage: observed ? "partial" : "unavailable",
    accounts:
      data.agency === "morar"
        ? []
        : [{ id: "1234567890", name: "Conta sintética", agency: "cordial" }],
    accountName: data.accountId && show ? "Conta sintética" : null,
    currency: show ? "BRL" : null,
    timezone: show ? "America/Sao_Paulo" : null,
    lastCollectedAt: observed ? "2026-10-26T12:00:00Z" : null,
    summary: observed ? metric : none,
    series: observed ? [{ date: "2026-10-15", metrics: metric }] : null,
    total: show ? 1 : 0,
    page: data.page,
    pageSize: data.pageSize,
    sort: data.sort,
    items: show
      ? [
          {
            id: "10000000-0000-4000-8000-000000000003",
            name: "Pesquisa Google · EXEMPLO SINTÉTICO",
            status: "Ativa",
            nativeStatus: null,
            channelType: null,
            channelSubtype: null,
            accountId: "1234567890",
            accountName: "Conta sintética",
            dataInicio: "2026-10-01",
            dataFim: "2037-12-30",
            agency: "cordial",
            currency: "BRL",
            timezone: "America/Sao_Paulo",
            lastCollectedAt: observed ? "2026-10-26T12:00:00Z" : null,
            coverage: observed ? "partial" : "unavailable",
            metrics: observed ? metric : none,
            dailySeries: observed ? [{ date: "2026-10-15", metrics: metric }] : null,
          },
        ]
      : [],
  };
}
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
    items: selected.slice(
      ((data?.page ?? 1) - 1) * (data?.pageSize ?? 25),
      (data?.page ?? 1) * (data?.pageSize ?? 25),
    ),
    total: selected.length,
    financialVisible: !secretariat(),
    page: data?.page ?? 1,
    pageSize: data?.pageSize ?? 25,
    summary: {
      current: total(data?.currentSince ?? "2026-10-01", data?.until ?? "2026-10-26"),
      previous: total(data?.since ?? "2026-09-01", data?.previousUntil ?? "2026-09-26"),
    },
  };
}
export async function listAdSyncJobs() {
  return previewParams.get("state") === "pending"
    ? [
        {
          id: "synthetic-sync-job",
          campaign_id: fixtureCampaigns[0]?.id,
          status: "queued",
          created_at: "2026-10-28T14:00:00Z",
        },
      ]
    : [];
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
  const params = new URLSearchParams(location.search);
  if (params.get("leadState") === "error") throw new Error("Falha sintética ao carregar contatos.");
  const selected =
    params.get("leadState") === "empty"
      ? []
      : fixtureLeads.filter(
          (c) =>
            (!data?.status || c.status === data.status) &&
            (!data?.imobiliaria || c.imobiliaria === data.imobiliaria) &&
            (!data?.campaignId || c.campaign_id === data.campaignId) &&
            (!data?.formId || c.form_id === data.formId) &&
            (!data?.brokerId || c.broker_id === data.brokerId) &&
            (!data?.search ||
              [c.full_name, c.phone, c.email]
                .filter(Boolean)
                .join(" ")
                .toLowerCase()
                .includes(data.search.toLowerCase())) &&
            (!data?.since || c.received_at.slice(0, 10) >= data.since) &&
            (!data?.until || c.received_at.slice(0, 10) <= data.until),
        );
  const size = data?.pageSize ?? 20;
  const offset = ((data?.page ?? 1) - 1) * size;
  return { items: selected.slice(offset, offset + size), total: selected.length };
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
