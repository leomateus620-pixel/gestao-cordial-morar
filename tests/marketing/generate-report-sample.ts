/** Reproducible synthetic PDF evidence. Does not connect to a database or Meta. */
import { mkdir, writeFile } from "node:fs/promises";
import { buildMarketingReport } from "../../src/lib/marketing/report-model";
import { renderMarketingReport } from "../../src/lib/marketing/report-pdf.server";
import type { CampaignRow } from "../../src/lib/marketing/marketing.dto";
const items: CampaignRow[] = Array.from({ length: 32 }, (_, i) => ({
  id: `synthetic-${i}`,
  user_id: "synthetic",
  imobiliaria: "cordial",
  nome: `[SINTÉTICO] ${["Apartamentos no Centro", "Casas com jardim", "Lançamentos em destaque", "Imóveis para locação"][i % 4]} - ${String(i + 1).padStart(2, "0")}`,
  canal: "Facebook",
  objetivo: "Leads qualificados",
  status: i % 3 ? "Pausada" : "Ativa",
  data_inicio: "2026-10-01",
  data_fim: "2026-10-28",
  investimento: 100,
  responsavel: null,
  observacoes: null,
  diagnostico: null,
  referencia_url: null,
  leads_esperados: null,
  created_at: "2026-10-01",
  updated_at: "2026-10-28",
  platform: "meta",
  currency: "BRL",
  timezone: "America/Sao_Paulo",
  last_synced_at: "2026-10-28T15:00:00Z",
  sync_status: i === 31 ? "partial" : "synced",
  daily_metrics: Array.from({ length: 10 }, (_, d) => ({
    data: `2026-10-${String(d + 1).padStart(2, "0")}`,
    leads: d % 3,
    clicks: 10 + d,
    impressions: 1000,
    spend: 20 + d,
  })),
}));
const model = buildMarketingReport(
  {
    imobiliaria: "cordial",
    type: "detailed",
    filters: { since: "2026-10-01", until: "2026-10-28", platform: "meta" },
  },
  {
    items,
    total: items.length,
    financial_visible: true,
    captured_at: "2026-10-28T15:00:00Z",
    funnel: { submissions: 0, attendances: 0, linkedSubmissions: 0 },
  },
);
await mkdir("output/pdf", { recursive: true });
await writeFile(
  "output/pdf/marketing-synthetic-sample.pdf",
  await renderMarketingReport(model, { synthetic: true }),
);
console.log("Synthetic report: 32 campaigns; no real customer data or external calls.");
