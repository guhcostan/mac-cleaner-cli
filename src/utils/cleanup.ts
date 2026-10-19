import { realpath } from 'fs/promises';
import { realpathSync } from 'fs';
import { dirname, join, resolve } from 'path';
import type { CategoryId, CleanResult, CleanSummary, PreparedCleanup, Scanner, ScanResult } from '../types.js';
import { contains } from '../repo-artifacts/eligibility.js';
import { emptyCleanResult, mergeCleanResult } from '../scanners/base-scanner.js';

/** Validate all selected filesystem rows before ancestor suppression. */
export async function cleanSelectedResults(
  selected: ScanResult[],
  scannerFor: (id: CategoryId) => Scanner,
  options: { dryRun?: boolean; backupDir?: string; onProgress?: (completed: number, result: ScanResult) => void } = {},
): Promise<CleanSummary> {
  const results = new Map<ScanResult, CleanResult>();
  const actions: { scan: ScanResult; action: PreparedCleanup; path: string }[] = [];
  const external: { scan: ScanResult; scanner: Scanner }[] = [];
  for (const scan of selected) {
    const scanner = scannerFor(scan.category.id);
    results.set(scan, emptyCleanResult(scan.category));
    if (!scan.items.length) continue;
    if (scanner.supportsBackup === false || !scanner.prepareClean) { external.push({ scan, scanner }); continue; }
    try {
      const prepared = await scanner.prepareClean(scan.items, options.backupDir, scan.context);
      for (const action of prepared) {
        // Resolve the parent only: a selected symlink is itself an item.
        const path = action.reason ? resolve(action.item.path) : join(await realpath(dirname(action.item.path)).catch(() => resolve(dirname(action.item.path))), action.item.path.split('/').pop()!);
        actions.push({ scan, action, path });
      }
    } catch (error) {
      const result = results.get(scan)!;
      result.errors.push((error instanceof Error ? error.message : String(error)));
      result.outcomes = scan.items.map((i) => ({ category: scan.category.id, path: i.path, scope: 'item', status: 'rejected', reason: (error instanceof Error ? error.message : String(error)), size: 0 }));
    }
  }
  actions.sort((a, b) => a.path.length - b.path.length || a.path.localeCompare(b.path));
  const completed: string[] = [];
  for (const { scan, action, path } of actions) {
    const result = results.get(scan)!;
    if (!action.reason && completed.some((parent) => contains(parent, path))) {
      result.outcomes!.push({ category: scan.category.id, path: action.item.path, scope: 'item', status: 'skipped', reason: 'SKIPPED_COVERED_BY_PARENT', size: 0 });
      continue;
    }
    const one = await action.execute(options.dryRun ?? false);
    mergeCleanResult(result, one);
    if (!one.errors.length && (one.cleanedItems || one.wouldCleanItems)) completed.push(path);
  }
  for (const { scan, scanner } of external) {
    try {
      const result = await scanner.clean(scan.items, options.dryRun, scanner.supportsBackup === false ? undefined : options.backupDir, scan.context);
      if (options.dryRun) {
        result.wouldCleanItems ??= result.cleanedItems;
        result.wouldFreeSpace ??= result.freedSpace;
        result.wouldBackUpSize ??= result.backedUpSize ?? 0;
        result.cleanedItems = 0; result.freedSpace = 0; result.backedUpSize = 0;
      }
      if (scanner.supportsBackup === false) result.outcomes = [{ category: scan.category.id, scope: 'action', status: result.errors.length ? 'rejected' : options.dryRun ? 'would-delete' : 'deleted', reason: result.errors.join('; ') || undefined, size: options.dryRun ? result.wouldFreeSpace ?? 0 : result.freedSpace }];
      results.set(scan, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.get(scan)!.errors.push(message);
      results.get(scan)!.outcomes = [{ category: scan.category.id, scope: 'action', status: 'rejected', reason: message, size: 0 }];
    }
  }
  selected.forEach((scan, i) => options.onProgress?.(i + 1, scan));
  const cleaned = [...results.values()];
  return { results: cleaned, backupDir: options.backupDir, totalFreedSpace: cleaned.reduce((n, r) => n + r.freedSpace, 0), totalBackedUpSize: cleaned.reduce((n, r) => n + (r.backedUpSize ?? 0), 0), totalCleanedItems: cleaned.reduce((n, r) => n + r.cleanedItems, 0), totalErrors: cleaned.reduce((n, r) => n + r.errors.length, 0), wouldFreeSpace: cleaned.reduce((n, r) => n + (r.wouldFreeSpace ?? 0), 0), wouldBackUpSize: cleaned.reduce((n, r) => n + (r.wouldBackUpSize ?? 0), 0), wouldCleanItems: cleaned.reduce((n, r) => n + (r.wouldCleanItems ?? 0), 0) };
}

/** Keep scan rows independent; count their filesystem path union once. */
export function scanTotals(results: ScanResult[]): { totalSize: number; totalItems: number } {
  const parents = new Map<string, string>();
  const canonical = (path: string) => {
    const parent = dirname(resolve(path));
    if (!parents.has(parent)) {
      try { parents.set(parent, realpathSync(parent)); } catch { parents.set(parent, parent); }
    }
    return join(parents.get(parent)!, path.split('/').pop()!);
  };
  const files = results.filter((r) => !['docker', 'homebrew'].includes(r.category.id)).flatMap((r) => r.items).map((item) => ({ ...item, path: canonical(item.path) })).sort((a, b) => a.path.length - b.path.length);
  const paths: string[] = [];
  let totalSize = 0;
  let totalItems = 0;
  for (const item of files) if (!paths.some((p) => contains(p, item.path))) { paths.push(item.path); totalSize += item.size; totalItems++; }
  for (const result of results.filter((r) => ['docker', 'homebrew'].includes(r.category.id))) { totalSize += result.totalSize; totalItems += result.items.length; }
  return { totalSize, totalItems };
}
