/**
 * Runs `fn` over `items` with at most `concurrency` operations in flight,
 * preserving input order in the returned results.
 */
export async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];

  const results = new Array<R>(items.length);
  const limit = Math.max(1, Math.min(concurrency, items.length));
  let next = 0;

  const workers = Array.from({ length: limit }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
}
