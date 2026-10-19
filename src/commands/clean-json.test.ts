import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanCommand } from './clean.js';
import { CATEGORIES, type CleanResult, type ScanSummary } from '../types.js';
import * as scanners from '../scanners/index.js';
import * as config from '../utils/config.js';
vi.mock('../scanners/index.js', () => ({ runAllScans: vi.fn(), runScans: vi.fn(), getScanner: vi.fn(), getAllScanners: vi.fn(() => []) }));
vi.mock('../utils/config.js', () => ({ loadConfig: vi.fn(async () => ({ backupEnabled: false })) }));
const log = vi.spyOn(console, 'log').mockImplementation(() => {});
beforeEach(() => { vi.clearAllMocks(); process.exitCode = undefined; });
afterEach(() => { process.exitCode = undefined; });
const item = { path: '/fixture/item', name: 'item', size: 10, isDirectory: true };
function setup(extra: Partial<ScanSummary['results'][0]> = {}) {
  const scan = { category: CATEGORIES['rust-artifacts'], items: [item], totalSize: 10, ...extra };
  vi.mocked(scanners.runAllScans).mockResolvedValue({ results: [scan], totalSize: scan.totalSize, totalItems: scan.items.length });
  vi.mocked(scanners.getScanner).mockReturnValue({ category: scan.category, scan: vi.fn(), clean: vi.fn(async (_items, dry): Promise<CleanResult> => ({ category: scan.category, cleanedItems: dry ? 0 : 1, freedSpace: dry ? 0 : 10, wouldCleanItems: dry ? 1 : 0, wouldFreeSpace: dry ? 10 : 0, outcomes: [{ category: scan.category.id, path: item.path, scope: 'item', status: dry ? 'would-delete' : 'deleted', size: 10 }], errors: [] })) });
}
function output() { expect(log).toHaveBeenCalledTimes(1); return JSON.parse(log.mock.calls[0][0]); }
it('requires deterministic selection and actual confirmation without prompting', async () => {
  await cleanCommand({ json: true });
  expect(output().errors[0].error).toContain('JSON_SELECTION_REQUIRED');
  expect(process.exitCode).toBe(1); log.mockClear();
  await cleanCommand({ json: true, all: true });
  expect(output().errors[0].error).toContain('JSON_CONFIRMATION_REQUIRED');
  expect(scanners.runAllScans).not.toHaveBeenCalled();
});
it('emits truthful planned counters and per-item outcomes in one document', async () => {
  setup(); await cleanCommand({ json: true, all: true, dryRun: true });
  expect(output()).toMatchObject({ version: 1, dryRun: true, totalCleanedItems: 0, totalFreedSpace: 0, wouldCleanItems: 1, wouldFreeSpace: 10, results: [{ outcomes: [{ path: item.path, status: 'would-delete' }] }] });
});
it('reports empty scan errors and config failures as nonzero JSON', async () => {
  setup({ items: [], totalSize: 0, error: 'scan failed' });
  await cleanCommand({ json: true, all: true, dryRun: true });
  expect(output().errors).toEqual([{ category: 'rust-artifacts', error: 'scan failed' }]);
  expect(process.exitCode).toBe(1); log.mockClear();
  vi.mocked(config.loadConfig).mockResolvedValueOnce({ repoPolicyError: 'INVALID_EXCLUSIONS' });
  setup({ items: [], totalSize: 0 });
  await cleanCommand({ json: true, all: true, dryRun: true });
  expect(output().errors[0].error).toBe('INVALID_EXCLUSIONS');
});
it('reports empty success and risky skips without donations or prompts', async () => {
  setup({ items: [], totalSize: 0 }); await cleanCommand({ json: true, all: true, yes: true });
  expect(output().totalErrors).toBe(0); log.mockClear();
  setup({ category: CATEGORIES['node-build-artifacts'] }); await cleanCommand({ json: true, all: true, yes: true });
  expect(output().skippedCategories).toEqual([{ category: 'node-build-artifacts', reason: 'RISK_NOT_ENABLED' }]);
});
it('represents external tools at action scope without invented paths', async () => {
  setup({ category: CATEGORIES.docker });
  vi.mocked(scanners.getScanner).mockReturnValue({ category: CATEGORIES.docker, supportsBackup: false, scan: vi.fn(), clean: vi.fn(async () => ({ category: CATEGORIES.docker, cleanedItems: 1, freedSpace: 5, errors: ['one action failed'] })) });
  await cleanCommand({ json: true, all: true, yes: true });
  const result = output();
  expect(result.results[0].outcomes).toEqual([{ category: 'docker', scope: 'action', status: 'rejected', reason: 'one action failed', size: 5 }]);
  expect(result.totalFreedSpace).toBe(5);
  expect(process.exitCode).toBe(1);
});
