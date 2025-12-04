import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { DuplicatesScanner } from './duplicates.js';

describe('DuplicatesScanner', () => {
  const scanner = new DuplicatesScanner();
  const testDir = join(tmpdir(), 'clean-my-mac-duplicates-test');

  beforeEach(async () => {
    vi.clearAllMocks();
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(testDir, { recursive: true, force: true });
  });

  it('should have correct category', () => {
    expect(scanner.category.id).toBe('duplicates');
    expect(scanner.category.name).toBe('Duplicate Files');
    expect(scanner.category.group).toBe('Storage');
    expect(scanner.category.safetyLevel).toBe('risky');
  });

  it('should scan and return results', async () => {
    const result = await scanner.scan();

    expect(result.category.id).toBe('duplicates');
    expect(Array.isArray(result.items)).toBe(true);
    expect(typeof result.totalSize).toBe('number');
  });

  it('should clean items', async () => {
    const result = await scanner.clean([]);

    expect(result.category.id).toBe('duplicates');
    expect(result.cleanedItems).toBe(0);
    expect(result.freedSpace).toBe(0);
  });

  it('should clean items with dry run', async () => {
    const items = [
      { path: '/test/file.txt', size: 1000, name: 'file.txt', isDirectory: false },
    ];

    const result = await scanner.clean(items, true);

    expect(result.category.id).toBe('duplicates');
  });

  it('should use minSize option', async () => {
    const result = await scanner.scan({ minSize: 10000000 });

    expect(result.category.id).toBe('duplicates');
  });

  it('should handle verbose option', async () => {
    const result = await scanner.scan({ verbose: true });

    expect(result.category.id).toBe('duplicates');
  });

  it('should handle empty directories', async () => {
    const result = await scanner.scan();

    expect(result.items).toBeDefined();
    expect(result.totalSize).toBeGreaterThanOrEqual(0);
  });

  it('should sort items by size descending', async () => {
    const result = await scanner.scan();

    if (result.items.length > 1) {
      for (let i = 0; i < result.items.length - 1; i++) {
        expect(result.items[i].size).toBeGreaterThanOrEqual(result.items[i + 1].size);
      }
    }
  });

  it('should create valid cleanable items', async () => {
    const result = await scanner.scan();

    for (const item of result.items) {
      expect(item.path).toBeDefined();
      expect(typeof item.size).toBe('number');
      expect(item.name).toBeDefined();
      expect(item.isDirectory).toBe(false);
    }
  });
});
