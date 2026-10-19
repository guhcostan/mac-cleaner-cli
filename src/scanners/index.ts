import { randomUUID } from 'crypto';
import type { Scanner, CategoryId, ScanResult, ScannerOptions, ScanSummary } from '../types.js';
import { loadConfig } from '../utils/config.js';
import { scanTotals } from '../utils/cleanup.js';
import { isRepoCategory } from '../repo-artifacts/rules.js';
import { scanRepoArtifacts, emitEvent } from '../repo-artifacts/walker.js';
import { BaseScanner } from './base-scanner.js';
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
import { GoArtifactsScanner } from './go-artifacts.js';
import { RustArtifactsScanner } from './rust-artifacts.js';
import { NodeBuildArtifactsScanner } from './node-build-artifacts.js';
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
  'rust-artifacts': new RustArtifactsScanner(),
  'go-artifacts': new GoArtifactsScanner(),
  'node-build-artifacts': new NodeBuildArtifactsScanner(),
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
  const config = await loadConfig();
  const includeGo = [...(config.includeEcosystems ?? []), ...(options?.includeEcosystems ?? [])].includes('go');
  const ids = config.defaultCategories ?? getAllScanners().map((s) => s.category.id).filter((id) => String(id) !== 'go-artifacts' || includeGo);
  return runScans(ids, options, onProgress);
}

export async function runScans(
  categoryIds: CategoryId[],
  options?: ParallelScanOptions,
  onProgress?: (scanner: Scanner, result: ScanResult) => void,
  registry: Partial<Record<CategoryId, Scanner>> = ALL_SCANNERS,
): Promise<ScanSummary> {
  const runId = options?.runId ?? randomUUID();
  let candidateCount = 0;
  let warningCount = 0;
  const request: ParallelScanOptions = { ...options, runId, onEvent: (event) => {
    if (event.type === 'candidate') candidateCount++;
    if (event.type === 'warning') warningCount++;
    emitEvent(options ?? {}, event);
  } };
  emitEvent(request, { type: 'start', runId, categories: categoryIds });
  let ended = false;
  try {
    const config = await loadConfig();
    const scanners = [...new Set(categoryIds)].map((id) => {
      const scanner = registry[id];
      if (!scanner) throw new Error(`Unknown scanner category: ${id}`);
      return scanner;
    });
    const parallel = options?.parallel ?? config.parallelScans ?? true;
    const concurrency = options?.concurrency ?? config.concurrency ?? 4;
    let completed = 0;
    const report = (scanner: Scanner, result: ScanResult) => {
      options?.onProgress?.(++completed, scanners.length, scanner, result);
      emitEvent(request, { type: 'progress', runId, category: scanner.category.id, completed });
      onProgress?.(scanner, result);
      return result;
    };
    const enabled = scanners.filter((s) => !config.excludeCategories?.includes(s.category.id));
    const repo = enabled.filter((s) => isRepoCategory(s.category.id) && s instanceof BaseScanner);
    const tasks = enabled.filter((s) => !repo.includes(s)).map((scanner) => ({ label: scanner.category.id, fn: async () => {
      const result = options?.signal?.aborted ? { category: scanner.category, items: [], totalSize: 0, error: 'CANCELLED' } : await safeScan(scanner, request);
      for (const item of result.items) emitEvent(request, { type: 'candidate', runId, category: scanner.category.id, item });
      if (result.error) emitEvent(request, { type: 'warning', runId, category: scanner.category.id, reason: result.error });
      return [report(scanner, result)];
    } }));
    if (repo.length) tasks.push({ label: 'repositories' as CategoryId, fn: async () => {
      const results = await scanRepoArtifacts(repo.map((s) => s.category), request, undefined, false);
      return results.map((r) => report(registry[r.category.id]!, r));
    } });
    const skipped = scanners.filter((s) => !enabled.includes(s)).map((s) => report(s, { category: s.category, items: [], totalSize: 0, skipped: 'CATEGORY_EXCLUDED' }));
    const batches = parallel ? await runWithConcurrency(tasks, concurrency) : [];
    if (!parallel) for (const task of tasks) batches.push(await task.fn());
    const results = [...batches.flat(), ...skipped].sort((a, b) => categoryIds.indexOf(a.category.id) - categoryIds.indexOf(b.category.id));
    const cancelled = options?.signal?.aborted ?? false;
    if (cancelled) for (const result of results) { result.items = []; result.totalSize = 0; result.error = 'CANCELLED'; if (result.context) result.context = Object.freeze({ ...result.context, complete: false, evidence: Object.freeze({}) }); }
    ended = true;
    emitEvent(request, { type: 'done', runId, cancelled, candidates: cancelled ? 0 : candidateCount, warnings: warningCount });
    return { results, ...scanTotals(results), ...(cancelled && { cancelled }) };
  } finally {
    if (!ended) emitEvent(request, { type: 'done', runId, cancelled: !!options?.signal?.aborted, candidates: 0, warnings: warningCount });
  }
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
  RustArtifactsScanner,
  GoArtifactsScanner,
  NodeBuildArtifactsScanner,
  GitWorktreesScanner,
  DuplicatesScanner,
  LaunchAgentsScanner,
};
