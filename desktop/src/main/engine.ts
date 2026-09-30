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
  const results: ScanResult[] = [];

  for (let i = 0; i < ids.length; i++) {
    const scanner = registry[ids[i]]!;
    onProgress?.({ phase: 'scanning', completed: i, total: ids.length, current: scanner.category.name });
    try {
      results.push(await scanner.scan());
    } catch (error) {
      results.push({
        category: scanner.category,
        items: [],
        totalSize: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  onProgress?.({ phase: 'scanning', completed: ids.length, total: ids.length, current: '' });
  return results;
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

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const scanner = registry[result.category.id];
    options.onProgress?.({ phase: 'cleaning', completed: i, total: results.length, current: result.category.name });

    if (result.error) {
      errors.push(`${result.category.name}: ${result.error}`);
    }

    const items = options.itemFilter ? options.itemFilter(result) : result.items;
    if (!scanner || items.length === 0) continue;

    try {
      const cleaned = await scanner.clean(items, false);
      categories.push({
        id: result.category.id,
        name: result.category.name,
        freedSpace: cleaned.freedSpace,
        cleanedItems: cleaned.cleanedItems,
        errors: cleaned.errors,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      categories.push({
        id: result.category.id,
        name: result.category.name,
        freedSpace: 0,
        cleanedItems: 0,
        errors: [message],
      });
    }
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
          .map((item) => ({ name: item.name, path: item.path, size: item.size })),
        error: result.error,
      };
    })
    .sort((a, b) => b.totalSize - a.totalSize);

  return {
    scannedAt: scannedAt.toISOString(),
    totalSize: categories.reduce((sum, c) => sum + c.totalSize, 0),
    categories,
  };
}
