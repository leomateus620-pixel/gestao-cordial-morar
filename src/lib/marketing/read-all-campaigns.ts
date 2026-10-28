import type { CampaignPage, MarketingQuery } from "./marketing.functions";

/** Return a complete, sanitized list or fail; never expose a partially loaded report. */
export async function readAllCampaigns(
  readPage: (query: MarketingQuery) => Promise<CampaignPage>,
  filters: MarketingQuery,
): Promise<CampaignPage> {
  const first = await readPage({ ...filters, page: 1, pageSize: 100 });
  const items = [...first.items];
  const ids = new Set(items.map((item) => item.id));
  const incomplete = () => new Error("Não foi possível carregar todas as campanhas. Atualize o relatório.");
  if (ids.size !== items.length || items.length > first.total) throw incomplete();
  let page = 1;
  while (items.length < first.total) {
    const next = await readPage({ ...filters, page: ++page, pageSize: 100 });
    if (
      next.total !== first.total ||
      next.financialVisible !== first.financialVisible ||
      next.items.length === 0
    ) throw incomplete();
    for (const item of next.items) {
      if (ids.has(item.id)) throw incomplete();
      ids.add(item.id);
      items.push(item);
    }
    if (items.length > first.total) throw incomplete();
  }
  return { ...first, items };
}