import { runScans } from '../../../src/scanners/index.js';
import { cleanSelectedResults, scanTotals } from '../../../src/utils/cleanup.js';
import { randomUUID } from 'crypto';
import { CATEGORIES, type CategoryId, type CleanableItem, type ScanResult, type Scanner } from '../../../src/types.js';
import type {
  CategoryRunResult,
  CategoryScanPreview,
  DeepScanPreview,
  RunMode,
  RunRecord,
} from '../shared/types.js';

export type ScannerRegistry = Partial<Record<CategoryId, Scanner>>;

export interface ProgressEvent {
  phase: 'scanning' | 'cleaning';
  completed: number;
  total: number;
  current: string;
}

export interface AutoFilterOptions {
  now: Date;
  tempFilesMinAgeHours: number;
}

/**
 * Narrows down what an unattended run is allowed to delete.
 * Temp files that were touched recently may still be in use by running
 * apps, so automatic runs only take the ones that have gone stale.
 */
export function filterItemsForAutoClean(result: ScanResult, options: AutoFilterOptions): CleanableItem[] {
  if (result.category.id !== 'temp-files' || options.tempFilesMinAgeHours <= 0) {
    return result.items;
  }
  const cutoff = options.now.getTime() - options.tempFilesMinAgeHours * 60 * 60 * 1000;
  return result.items.filter((item) => item.modifiedAt !== undefined && item.modifiedAt.getTime() < cutoff);
}

export async function scanCategories(
  registry: ScannerRegistry,
  categoryIds: CategoryId[],
  onProgress?: (event: ProgressEvent) => void
): Promise<ScanResult[]> {
  const ids = categoryIds.filter((id) => registry[id]);
  onProgress?.({ phase: 'scanning', completed: 0, total: ids.length, current: '' });
  const summary = await runScans(ids, { onProgress: (completed, total, scanner) => onProgress?.({ phase: 'scanning', completed, total, current: scanner.category.name }) }, undefined, registry);
  return summary.results;
}

export async function cleanScanResults(
  registry: ScannerRegistry,
  mode: RunMode,
  results: ScanResult[],
  options: {
    now?: () => Date;
    itemFilter?: (result: ScanResult) => CleanableItem[];
    onProgress?: (event: ProgressEvent) => void;
  } = {}
): Promise<RunRecord> {
  const now = options.now ?? (() => new Date());
  const startedAt = now();
  const categories: CategoryRunResult[] = [];
  const errors: string[] = [];

  for (const result of results) if (result.error) errors.push(`${result.category.name}: ${result.error}`);
  const selected = results.filter((r) => registry[r.category.id]).map((r) => ({ ...r, items: options.itemFilter ? options.itemFilter(r) : r.items }));
  const cleaned = await cleanSelectedResults(selected, (id) => registry[id]!, {
    dryRun: false,
    onProgress: (completed, result) => options.onProgress?.({ phase: 'cleaning', completed, total: results.length, current: result.category.name }),
  });
  for (const result of cleaned.results) {
    if (!selected.find((r) => r.category.id === result.category.id)?.items.length) continue;
    categories.push({ id: result.category.id, name: result.category.name, freedSpace: result.freedSpace, cleanedItems: result.cleanedItems, errors: result.errors });
  }

  options.onProgress?.({ phase: 'cleaning', completed: results.length, total: results.length, current: '' });

  return {
    id: randomUUID(),
    mode,
    startedAt: startedAt.toISOString(),
    finishedAt: now().toISOString(),
    freedSpace: categories.reduce((sum, c) => sum + c.freedSpace, 0),
    cleanedItems: categories.reduce((sum, c) => sum + c.cleanedItems, 0),
    categories: categories.sort((a, b) => b.freedSpace - a.freedSpace),
    errors,
  };
}

export function toScanPreview(results: ScanResult[], scannedAt: Date, topN = 5): DeepScanPreview {
  const categories: CategoryScanPreview[] = results
    .map((result) => {
      const info = CATEGORIES[result.category.id] ?? result.category;
      return {
        id: result.category.id,
        name: info.name,
        safetyLevel: info.safetyLevel,
        safetyNote: info.safetyNote,
        totalSize: result.totalSize,
        itemCount: result.items.length,
        topItems: [...result.items]
          .sort((a, b) => b.size - a.size)
          .slice(0, topN)
          .map((item) => ({ name: item.name, path: item.path, size: item.size, id: item.id, fileCount: item.fileCount, newestEntryModifiedAt: item.newestEntryModifiedAt?.toISOString() })),
        error: result.error,
      };
    })
    .sort((a, b) => b.totalSize - a.totalSize);

  return {
    scannedAt: scannedAt.toISOString(),
    totalSize: scanTotals(results).totalSize,
    categories,
  };
}
