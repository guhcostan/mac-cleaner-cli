import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CleanContext, ScanSummary } from '../types.js';
import { CATEGORIES } from '../types.js';
import { interactiveCommand } from './interactive.js';
import { liveReviewPrompt } from '../pickers/live-review.js';
import filePickerPrompt from '../pickers/file-picker.js';
import { getScanner, runAllScans } from '../scanners/index.js';
import confirm from '@inquirer/confirm';

vi.mock('../scanners/index.js', () => ({ runAllScans: vi.fn(), getScanner: vi.fn(), getAllScanners: vi.fn(() => []) }));
vi.mock('../pickers/live-review.js', () => ({ liveReviewPrompt: vi.fn() }));
vi.mock('../pickers/file-picker.js', () => ({ default: vi.fn() }));
vi.mock('@inquirer/confirm', () => ({ default: vi.fn() }));
vi.mock('../utils/index.js', async (original) => ({ ...await original<typeof import('../utils/index.js')>(), hasFullDiskAccess: async () => true, loadConfig: async () => ({ backupEnabled: false }) }));

const tty = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
const context: CleanContext = Object.freeze({ complete: true, evidence: Object.freeze({}), repoPolicy: Object.freeze({ roots: [], categories: ['rust-artifacts'] as const, excludePaths: [], daysOld: 30, configDaysOld: 30, maxDepth: 4, explicitRoots: false }) });
const items = ['selected', 'unselected'].map((name) => ({ path: `/fixture/${name}/target`, name, size: 5, isDirectory: true }));
const summary: ScanSummary = { results: [{ category: CATEGORIES['rust-artifacts'], items, totalSize: 10, context }], totalSize: 10, totalItems: 2 };
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
});
afterEach(() => {
  vi.restoreAllMocks();
  if (tty) Object.defineProperty(process.stdin, 'isTTY', tty);
  else Reflect.deleteProperty(process.stdin, 'isTTY');
});

it.each([false, true])('requires a separate final confirmation after live selection (confirm: %s)', async (approved) => {
  const clean = vi.fn(async () => ({ category: CATEGORIES['rust-artifacts'], cleanedItems: 1, freedSpace: 5, errors: [] }));
  vi.mocked(getScanner).mockReturnValue({ category: CATEGORIES['rust-artifacts'], scan: vi.fn(), clean });
  vi.mocked(liveReviewPrompt).mockResolvedValue({ summary, selected: new Map([['rust-artifacts', new Set([items[0].path])]]), cancelled: false });
  vi.mocked(confirm).mockImplementation(async () => {
    expect(clean).not.toHaveBeenCalled();
    return approved;
  });
  const result = await interactiveCommand({ live: true, noProgress: true });
  expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ default: false }));
  expect(runAllScans).not.toHaveBeenCalled();
  expect(filePickerPrompt).not.toHaveBeenCalled();
  if (approved) {
    expect(clean).toHaveBeenCalledWith([items[0]], undefined, undefined, context);
    expect(result?.totalCleanedItems).toBe(1);
  } else {
    expect(clean).not.toHaveBeenCalled();
    expect(result).toBeNull();
  }
});

it.each([false, true])('never turns empty or cancelled live review into automatic selection (cancelled: %s)', async (cancelled) => {
  vi.mocked(liveReviewPrompt).mockResolvedValue({ summary, selected: new Map(), cancelled });
  expect(await interactiveCommand({ live: true, noProgress: true })).toBeNull();
  expect(confirm).not.toHaveBeenCalled();
  expect(getScanner).not.toHaveBeenCalled();
  expect(runAllScans).not.toHaveBeenCalled();
});
