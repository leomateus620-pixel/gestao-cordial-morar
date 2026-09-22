import type { RemotePage, RemoteRecord } from "./read-parsers";

export type FullListResult = {
  /** Só é confiável quando TODAS as páginas foram lidas sem falha. */
  reliable: boolean;
  reason: "ok" | "paginacao_incompleta" | "falha_consulta";
  items: RemoteRecord[];
  pagesRead: number;
  totalPages: number | null;
};

const MAX_LIST_PAGES = 200;

/** Lê todas as páginas usando `fetchPage`; falha em qualquer página = não confiável. */
export async function fetchAllPropertyPagesWith(
  fetchPage: (page: number) => Promise<RemotePage>,
  perPage: number,
): Promise<FullListResult> {
  const items: RemoteRecord[] = [];
  let page = 1;
  let totalPages: number | null = null;
  while (page <= MAX_LIST_PAGES) {
    let result: RemotePage;
    try {
      result = await fetchPage(page);
    } catch {
      return { reliable: false, reason: "falha_consulta", items, pagesRead: page - 1, totalPages };
    }
    items.push(...result.items);
    totalPages = result.totalPages ?? totalPages;
    const last = totalPages !== null ? page >= totalPages : result.items.length < perPage;
    if (last) return { reliable: true, reason: "ok", items, pagesRead: page, totalPages };
    page += 1;
  }
  return { reliable: false, reason: "paginacao_incompleta", items, pagesRead: page - 1, totalPages };
}
