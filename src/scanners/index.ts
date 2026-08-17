import type { Scanner, CategoryId, ScanResult, ScannerOptions, ScanSummary } from '../types.js';
import { mapPool } from '../utils/index.js';
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
  const results = await mapPool(tasks, concurrency, async (task, index) => {
    try {
      return await task.fn();
    } catch (error) {
      // Log error but don't fail entire batch
      const taskLabel = task.label ? ` (${task.label})` : ` ${index}`;
      console.error(`Scanner task${taskLabel} failed:`, error);
      return undefined;
    }
  });

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

  if (parallel) {
    const tasks = scanners.map((scanner) => ({
      label: scanner.category.id,
      fn: async () => {
        const result = await scanner.scan(options);
        completed++;
        options?.onProgress?.(completed, total, scanner, result);
        onProgress?.(scanner, result);
        return result;
      },
    }));

    results = await runWithConcurrency(tasks, concurrency);
  } else {
    results = [];

    for (const scanner of scanners) {
      const result = await scanner.scan(options);
      results.push(result);
      completed++;
      options?.onProgress?.(completed, total, scanner, result);
      onProgress?.(scanner, result);
    }
  }

  const totalSize = results.reduce((sum, r) => sum + r.totalSize, 0);
  const totalItems = results.reduce((sum, r) => sum + r.items.length, 0);

  return { results, totalSize, totalItems };
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
