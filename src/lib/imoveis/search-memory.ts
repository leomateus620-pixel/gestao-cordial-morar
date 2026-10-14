/**
 * Memória da busca do catálogo na aba atual. A URL continua sendo a fonte de
 * verdade dos filtros; aqui guardamos só a última pesquisa (para o "voltar" da
 * ficha quando não há histórico) e o imóvel visitado (âncora de rolagem).
 */
const SEARCH_KEY = "cordial:catalogo:busca";
const ANCHOR_KEY = "cordial:catalogo:ancora";

export function rememberCatalogSearch(search: Record<string, unknown>) {
  try {
    window.sessionStorage.setItem(SEARCH_KEY, JSON.stringify(search));
  } catch {
    // ignore
  }
}

export function readCatalogSearch(): Record<string, unknown> | null {
  try {
    const raw = window.sessionStorage.getItem(SEARCH_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function rememberCatalogAnchor(id: string) {
  try {
    window.sessionStorage.setItem(ANCHOR_KEY, id);
  } catch {
    // ignore
  }
}

export function takeCatalogAnchor(): string | null {
  try {
    const id = window.sessionStorage.getItem(ANCHOR_KEY);
    window.sessionStorage.removeItem(ANCHOR_KEY);
    return id;
  } catch {
    return null;
  }
}

export function peekCatalogAnchor(): string | null {
  try {
    return window.sessionStorage.getItem(ANCHOR_KEY);
  } catch {
    return null;
  }
}
