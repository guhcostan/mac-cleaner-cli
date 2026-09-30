import type { Scanner, CategoryId, ScanResult, ScannerOptions, ScanSummary } from '../types.js';
import { debugError, formatError } from '../utils/errors.js';
import { SystemCacheScanner } from './system-cache.js';
import { SystemLogsScanner } from './system-logs.js';
import { TempFilesScanner } from './temp-files.js';
import { TrashScanner } from './trash.js';
import { DownloadsScanner } from './downloads.js';
import { BrowserCacheScanner } from './browser-cache.js';
import { DevCacheScanner } from './dev-cache.js';
import { HomebrewScanner } from './homebrew.js';
import { DockerScanner } from './docker.js';
import { IosBackupsScanner } from './ios-backups.js';
import { MailAttachmentsScanner } from './mail-attachments.js';
import { LanguageFilesScanner } from './language-files.js';
import { LargeFilesScanner } from './large-files.js';
import { NodeModulesScanner } from './node-modules.js';
import { GitWorktreesScanner } from './git-worktrees.js';
import { DuplicatesScanner } from './duplicates.js';
import { LaunchAgentsScanner } from './launch-agents.js';

export const ALL_SCANNERS: Record<CategoryId, Scanner> = {
  'system-cache': new SystemCacheScanner(),
  'system-logs': new SystemLogsScanner(),
  'temp-files': new TempFilesScanner(),
  'trash': new TrashScanner(),
  'downloads': new DownloadsScanner(),
  'browser-cache': new BrowserCacheScanner(),
  'dev-cache': new DevCacheScanner(),
  'homebrew': new HomebrewScanner(),
  'docker': new DockerScanner(),
  'ios-backups': new IosBackupsScanner(),
  'mail-attachments': new MailAttachmentsScanner(),
  'language-files': new LanguageFilesScanner(),
  'large-files': new LargeFilesScanner(),
  'node-modules': new NodeModulesScanner(),
  'git-worktrees': new GitWorktreesScanner(),
  'duplicates': new DuplicatesScanner(),
  'launch-agents': new LaunchAgentsScanner(),
};

export function getScanner(categoryId: CategoryId): Scanner {
  const scanner = ALL_SCANNERS[categoryId];
  if (!scanner) {
    throw new Error(`Unknown scanner category: ${categoryId}`);
  }
  return scanner;
}

export function getAllScanners(): Scanner[] {
  return Object.values(ALL_SCANNERS);
}

export interface ParallelScanOptions extends ScannerOptions {
  parallel?: boolean;
  concurrency?: number;
  onProgress?: (completed: number, total: number, scanner: Scanner, result: ScanResult) => void;
}

async function runWithConcurrency<T>(
  tasks: Array<{ fn: () => Promise<T>; label?: string }>,
  concurrency: number
): Promise<T[]> {
  const results: (T | undefined)[] = new Array(tasks.length);
  const executing: Set<Promise<void>> = new Set();
  const limit = Math.max(1, Math.min(concurrency, tasks.length || 1));

  for (let i = 0; i < tasks.length; i++) {
    const index = i;
    const task = tasks[index];
    const p: Promise<void> = task.fn()
      .then((result) => {
        results[index] = result;
      })
      .catch((error) => {
        // Individual tasks already convert failures into error results; reaching
        // here means the wrapper itself failed, so keep the batch alive and
        // record it for debugging instead of corrupting the progress output
        const taskLabel = task.label ?? String(index);
        debugError(`scanner task ${taskLabel}`, error);
        results[index] = undefined;
      })
      .finally(() => {
        executing.delete(p);
      });
    executing.add(p);

    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }

  await Promise.allSettled(executing);
  return results.filter((r): r is T => r !== undefined);
}

export async function runAllScans(
  options?: ParallelScanOptions,
  onProgress?: (scanner: Scanner, result: ScanResult) => void
): Promise<ScanSummary> {
  return runScans(getAllScanners().map((s) => s.category.id), options, onProgress);
}

export async function runScans(
  categoryIds: CategoryId[],
  options?: ParallelScanOptions,
  onProgress?: (scanner: Scanner, result: ScanResult) => void
): Promise<ScanSummary> {
  const scanners = categoryIds.map((id) => getScanner(id));
  const parallel = options?.parallel ?? true;
  const concurrency = options?.concurrency ?? 4;

  let completed = 0;
  const total = scanners.length;
  let results: ScanResult[];

  const runScanner = async (scanner: Scanner): Promise<ScanResult> => {
    const result = await safeScan(scanner, options);
    completed++;
    options?.onProgress?.(completed, total, scanner, result);
    onProgress?.(scanner, result);
    return result;
  };

  if (parallel) {
    const tasks = scanners.map((scanner) => ({
      label: scanner.category.id,
      fn: () => runScanner(scanner),
    }));

    results = await runWithConcurrency(tasks, concurrency);
  } else {
    results = [];

    for (const scanner of scanners) {
      results.push(await runScanner(scanner));
    }
  }

  const totalSize = results.reduce((sum, r) => sum + r.totalSize, 0);
  const totalItems = results.reduce((sum, r) => sum + r.items.length, 0);

  return { results, totalSize, totalItems };
}

/**
 * Runs a scanner, converting a thrown error into a result carrying the failure
 * so it is reported to the user instead of the category vanishing from output.
 */
async function safeScan(scanner: Scanner, options?: ScannerOptions): Promise<ScanResult> {
  try {
    return await scanner.scan(options);
  } catch (error) {
    debugError(`scanner ${scanner.category.id}`, error);
    return {
      category: scanner.category,
      items: [],
      totalSize: 0,
      error: `Scan failed: ${formatError(error)}`,
    };
  }
}

export {
  SystemCacheScanner,
  SystemLogsScanner,
  TempFilesScanner,
  TrashScanner,
  DownloadsScanner,
  BrowserCacheScanner,
  DevCacheScanner,
  HomebrewScanner,
  DockerScanner,
  IosBackupsScanner,
  MailAttachmentsScanner,
  LanguageFilesScanner,
  LargeFilesScanner,
  NodeModulesScanner,
  GitWorktreesScanner,
  DuplicatesScanner,
  LaunchAgentsScanner,
};
