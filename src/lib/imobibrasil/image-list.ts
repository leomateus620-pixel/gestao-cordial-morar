import type { RemotePage, RemoteRecord } from "./read-parsers";

/** Leitura completa com cursor validado. A confirmação de uma galeria vazia
 * exige resposta reconhecida, não erro convertido em array vazio. */
export async function fetchAllImagePagesWith(
  fetchPage: (page: number) => Promise<RemotePage>,
): Promise<RemoteRecord[]> {
  const images: RemoteRecord[] = [];
  const fingerprints = new Set<string>();
  for (let page = 1; page <= 20; page += 1) {
    const result = await fetchPage(page);
    if (result.recognized === false || result.page !== page) {
      throw new Error("Página de imagens sem formato/cursor reconhecível; galeria inconclusiva.");
    }
    if (result.items.length) {
      const fingerprint = JSON.stringify(result.items.map((item) => item["codigoImagem"] ?? item["id"] ?? item["url"]));
      // A API ignora page/per_page e repete a lista inteira: página 2 idêntica
      // à 1 (sem total declarado) prova que a 1 já era completa.
      if (page === 2 && !result.totalPagesKnown && fingerprints.size === 1 &&
          fingerprints.has(fingerprint) && images.length === result.items.length) {
        return images;
      }
      if (fingerprints.has(fingerprint)) {
        throw new Error("Paginação de imagens repetiu uma página; galeria inconclusiva.");
      }
      fingerprints.add(fingerprint);
    }
    images.push(...result.items);
    if (result.totalPagesKnown && page >= result.totalPages) return images;
    // A API pode limitar per_page abaixo do pedido sem avisar. Sem total
    // declarado, apenas uma página vazia reconhecida prova o fim.
    if (!result.totalPagesKnown && result.items.length === 0) return images;
  }
  throw new Error("Lista de imagens excedeu o limite de páginas; galeria inconclusiva.");
}
