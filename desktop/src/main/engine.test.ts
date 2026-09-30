import { describe, expect, it } from 'vitest';
import { CATEGORIES } from '../../../src/types.js';
import { cleanScanResults, filterItemsForAutoClean, scanCategories, toScanPreview } from './engine.js';
import { fakeScanner, item } from './test-helpers.js';

const now = new Date('2026-09-30T12:00:00Z');
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600 * 1000);

describe('filterItemsForAutoClean', () => {
  it('keeps recently modified temp files', () => {
    const result = {
      category: CATEGORIES['temp-files'],
      items: [item('old', 1, hoursAgo(48)), item('fresh', 1, hoursAgo(1)), item('unknown', 1)],
      totalSize: 3,
    };
    const kept = filterItemsForAutoClean(result, { now, tempFilesMinAgeHours: 24 });
    expect(kept.map((i) => i.name)).toEqual(['old']);
  });

  it('does not filter other categories or when the age limit is 0', () => {
    const cache = { category: CATEGORIES['browser-cache'], items: [item('a', 1, hoursAgo(0))], totalSize: 1 };
    expect(filterItemsForAutoClean(cache, { now, tempFilesMinAgeHours: 24 })).toHaveLength(1);

    const temp = { category: CATEGORIES['temp-files'], items: [item('a', 1, hoursAgo(0))], totalSize: 1 };
    expect(filterItemsForAutoClean(temp, { now, tempFilesMinAgeHours: 0 })).toHaveLength(1);
  });
});

describe('scanCategories', () => {
  it('scans only registered categories and reports progress', async () => {
    const registry = { trash: fakeScanner('trash', [item('a', 10)]) };
    const events: number[] = [];
    const results = await scanCategories(registry, ['trash', 'docker'], (e) => events.push(e.completed));
    expect(results).toHaveLength(1);
    expect(results[0].totalSize).toBe(10);
    expect(events).toEqual([0, 1]);
  });

  it('turns a scanner crash into an error result', async () => {
    const registry = { trash: fakeScanner('trash', [], { failScan: true }) };
    const [result] = await scanCategories(registry, ['trash']);
    expect(result.error).toBe('boom');
    expect(result.items).toEqual([]);
  });
});

describe('cleanScanResults', () => {
  it('cleans each category and totals the result', async () => {
    const trash = fakeScanner('trash', [item('a', 10), item('b', 5)]);
    const logs = fakeScanner('system-logs', [item('c', 100)]);
    const registry = { trash, 'system-logs': logs };
    const results = await scanCategories(registry, ['trash', 'system-logs']);

    const record = await cleanScanResults(registry, 'deep', results, { now: () => now });

    expect(record.mode).toBe('deep');
    expect(record.freedSpace).toBe(115);
    expect(record.cleanedItems).toBe(3);
    expect(record.categories.map((c) => c.id)).toEqual(['system-logs', 'trash']);
    expect(trash.clean).toHaveBeenCalledWith(results[0].items, false);
  });

  it('applies the item filter and skips categories left empty', async () => {
    const trash = fakeScanner('trash', [item('a', 10)]);
    const registry = { trash };
    const results = await scanCategories(registry, ['trash']);

    const record = await cleanScanResults(registry, 'auto', results, { itemFilter: () => [] });

    expect(trash.clean).not.toHaveBeenCalled();
    expect(record.freedSpace).toBe(0);
    expect(record.categories).toEqual([]);
  });

  it('records clean failures without aborting the run', async () => {
    const trash = fakeScanner('trash', [item('a', 10)]);
    trash.clean.mockRejectedValueOnce(new Error('EPERM'));
    const logs = fakeScanner('system-logs', [item('b', 20)]);
    const registry = { trash, 'system-logs': logs };
    const results = await scanCategories(registry, ['trash', 'system-logs']);

    const record = await cleanScanResults(registry, 'quick', results);

    expect(record.freedSpace).toBe(20);
    expect(record.categories.find((c) => c.id === 'trash')?.errors).toEqual(['EPERM']);
  });
});

describe('toScanPreview', () => {
  it('sorts categories by size and keeps the largest items', () => {
    const results = [
      { category: CATEGORIES['trash'], items: [item('a', 1), item('b', 3), item('c', 2)], totalSize: 6 },
      { category: CATEGORIES['downloads'], items: [item('d', 50)], totalSize: 50 },
    ];
    const preview = toScanPreview(results, now, 2);
    expect(preview.totalSize).toBe(56);
    expect(preview.categories.map((c) => c.id)).toEqual(['downloads', 'trash']);
    expect(preview.categories[1].topItems.map((i) => i.name)).toEqual(['b', 'c']);
    expect(preview.categories[0].safetyLevel).toBe('risky');
  });
});
