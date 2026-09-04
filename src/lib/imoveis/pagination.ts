/**
 * Páginas visíveis (0-based) para uma paginação compacta.
 * Sempre inclui a primeira, a última e a vizinhança da página atual;
 * saltos são representados por `null` (reticências).
 */
export function paginationWindow(
  page: number,
  totalPages: number,
  radius = 1,
): Array<number | null> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i);
  const pages = new Set<number>([0, totalPages - 1]);
  for (let i = page - radius; i <= page + radius; i++) {
    if (i >= 0 && i < totalPages) pages.add(i);
  }
  if (page <= 2) [1, 2, 3].forEach((p) => pages.add(p));
  if (page >= totalPages - 3)
    [totalPages - 4, totalPages - 3, totalPages - 2].forEach((p) => pages.add(p));
  const sorted = Array.from(pages).sort((a, b) => a - b);
  const out: Array<number | null> = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - (sorted[i - 1] as number) > 1) out.push(null);
    out.push(p);
  });
  return out;
}
