import { vi } from 'vitest';
import { CATEGORIES, type CategoryId, type CleanableItem, type Scanner } from '../../../src/types.js';

export function item(name: string, size: number, modifiedAt?: Date): CleanableItem {
  return { path: `/tmp/fake/${name}`, name, size, isDirectory: false, modifiedAt };
}

/** A scanner that returns fixed items and "deletes" them without touching the disk. */
export function fakeScanner(id: CategoryId, items: CleanableItem[], opts: { failScan?: boolean } = {}) {
  const category = CATEGORIES[id];
  const scanner = {
    category,
    scan: vi.fn(async () => {
      if (opts.failScan) throw new Error('boom');
      return { category, items, totalSize: items.reduce((s, i) => s + i.size, 0) };
    }),
    clean: vi.fn(async (toClean: CleanableItem[]) => ({
      category,
      cleanedItems: toClean.length,
      freedSpace: toClean.reduce((s, i) => s + i.size, 0),
      errors: [],
    })),
  } satisfies Scanner;
  return scanner;
}
