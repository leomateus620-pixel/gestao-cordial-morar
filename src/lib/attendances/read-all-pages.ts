type PageResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
  count: number | null;
};

/**
 * The API may cap a requested range below pageSize. Advance by the actual rows,
 * and use the RLS-scoped exact count rather than treating a short page as EOF.
 * Never publish a partial list as complete if a concurrent insert/delete shifts pages.
 */
export async function readAllAttendancePages<T extends { id: string }>(
  readPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = 250,
): Promise<T[]> {
  const result: T[] = [];
  const ids = new Set<string>();
  let expectedCount: number | undefined;
  do {
    const page = await readPage(result.length, result.length + pageSize - 1);
    if (page.error) throw new Error(page.error.message);
    if (page.count === null || !Number.isSafeInteger(page.count) || page.count < 0) {
      throw new Error("Não foi possível confirmar a quantidade de registros. Tente novamente.");
    }
    if (expectedCount !== undefined && page.count !== expectedCount) {
      throw new Error(
        "A lista foi alterada durante a leitura. Atualize para carregar todos os registros.",
      );
    }
    expectedCount = page.count;
    const rows = page.data ?? [];
    if (rows.length === 0 && result.length < expectedCount) {
      throw new Error("A leitura dos registros ficou incompleta. Tente novamente.");
    }
    for (const row of rows) {
      if (ids.has(row.id)) {
        throw new Error(
          "A lista foi alterada durante a leitura. Atualize para carregar todos os registros.",
        );
      }
      ids.add(row.id);
      result.push(row);
    }
    if (result.length > expectedCount) {
      throw new Error("A quantidade de registros mudou durante a leitura. Tente novamente.");
    }
  } while (result.length < expectedCount);
  return result;
}
