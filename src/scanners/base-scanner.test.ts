import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir, homedir } from 'os';
import { BaseScanner } from './base-scanner.js';
import { CATEGORIES } from '../types.js';
import type { Category, ScanResult, ScannerOptions, CleanableItem } from '../types.js';
import { ensureBackupDir } from '../utils/backup.js';

class TestScanner extends BaseScanner {
  category: Category = {
    id: 'system-cache',
    name: 'Test Category',
    group: 'System Junk',
    description: 'Test description',
    safetyLevel: 'safe',
  };

  testItems: CleanableItem[] = [];

  async scan(_options?: ScannerOptions): Promise<ScanResult> {
    return this.createResult(this.testItems);
  }
}

describe('BaseScanner', () => {
  let testDir: string;
  let scanner: TestScanner;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'mac-cleaner-scanner-test-'));
    scanner = new TestScanner();
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('createResult', () => {
    it('should create result with correct structure', async () => {
      scanner.testItems = [
        { path: '/test/path', size: 100, name: 'test', isDirectory: false },
      ];

      const result = await scanner.scan();

      expect(result).toHaveProperty('category');
      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('totalSize');
    });

    it('should calculate total size correctly', async () => {
      scanner.testItems = [
        { path: '/test/path1', size: 100, name: 'test1', isDirectory: false },
        { path: '/test/path2', size: 200, name: 'test2', isDirectory: false },
        { path: '/test/path3', size: 300, name: 'test3', isDirectory: false },
      ];

      const result = await scanner.scan();

      expect(result.totalSize).toBe(600);
    });

    it('should handle empty items', async () => {
      scanner.testItems = [];

      const result = await scanner.scan();

      expect(result.items).toHaveLength(0);
      expect(result.totalSize).toBe(0);
    });
  });

  describe('clean', () => {
    it('should clean items and return result', async () => {
      const filePath = join(testDir, 'test.txt');
      await writeFile(filePath, 'content');

      const items: CleanableItem[] = [
        { path: filePath, size: 7, name: 'test.txt', isDirectory: false },
      ];

      const result = await scanner.clean(items);

      expect(result.category).toBe(scanner.category);
      expect(result.cleanedItems).toBe(1);
      expect(result.freedSpace).toBe(7);
    });

    it('should handle dry run', async () => {
      const filePath = join(testDir, 'test.txt');
      await writeFile(filePath, 'content');

      const items: CleanableItem[] = [
        { path: filePath, size: 7, name: 'test.txt', isDirectory: false },
      ];

      const result = await scanner.clean(items, true);

      expect(result.cleanedItems).toBe(1);
      expect(result.freedSpace).toBe(7);
    });

    it('should summarize failures by error code', async () => {
      const filePath = join(testDir, 'test.txt');
      await writeFile(filePath, 'content');

      const items: CleanableItem[] = [
        { path: filePath, size: 7, name: 'test.txt', isDirectory: false },
        { path: join(testDir, 'missing-1'), size: 0, name: 'missing-1', isDirectory: false },
        { path: join(testDir, 'missing-2'), size: 0, name: 'missing-2', isDirectory: false },
      ];

      const result = await scanner.clean(items);

      expect(result.cleanedItems).toBe(1);
      expect(result.errors).toEqual(['Failed to remove 2 items (2 ENOENT)']);
    });
  });
});


describe('BaseScanner backup routing', () => {
  class FakeScanner extends BaseScanner {
    category = CATEGORIES['trash'];
    async scan() {
      return this.createResult([]);
    }
  }

  let sourceDir: string;

  beforeEach(async () => {
    sourceDir = join(homedir(), '.mac-cleaner-cli-test-scanner');
    await mkdir(sourceDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(sourceDir, { recursive: true, force: true });
  });

  it('deletes when no backupDir is given', async () => {
    const file = join(sourceDir, 'delete-me.txt');
    await writeFile(file, 'x');

    const scanner = new FakeScanner();
    const result = await scanner.clean(
      [{ path: file, size: 1, name: 'delete-me.txt', isDirectory: false }]
    );

    expect(existsSync(file)).toBe(false);
    expect(result.freedSpace).toBe(1);
    expect(result.backedUpSize).toBeUndefined();
  });

  it('moves to backup and reports ZERO freed space when backupDir is given', async () => {
    const file = join(sourceDir, 'keep-me.txt');
    await writeFile(file, 'x');

    const backupDir = await ensureBackupDir();
    const scanner = new FakeScanner();
    const result = await scanner.clean(
      [{ path: file, size: 1, name: 'keep-me.txt', isDirectory: false }],
      false,
      backupDir
    );

    // The point of this test: moving does NOT free space. Reporting freedSpace
    // here would trade the old facade for a new untruth.
    expect(result.freedSpace).toBe(0);
    expect(result.backedUpSize).toBe(1);
    expect(result.backupDir).toBe(backupDir);
    expect(existsSync(file)).toBe(false);

    await rm(backupDir, { recursive: true, force: true });
  });

  it('reports an error and keeps the file when the backup fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const outsideDir = await mkdtemp(join(tmpdir(), 'scanner-outside-home-'));
    const outside = join(outsideDir, 'scanner-outside-home.txt');
    await writeFile(outside, 'x');

    const backupDir = await ensureBackupDir();
    const scanner = new FakeScanner();
    const result = await scanner.clean(
      [{ path: outside, size: 1, name: 'scanner-outside-home.txt', isDirectory: false }],
      false,
      backupDir
    );

    expect(result.cleanedItems).toBe(0);
    expect(result.errors[0]).toContain('nothing was deleted');
    expect(existsSync(outside)).toBe(true);

    await rm(outsideDir, { recursive: true, force: true });
    await rm(backupDir, { recursive: true, force: true });
    consoleSpy.mockRestore();
  });
});
