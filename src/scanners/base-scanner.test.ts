import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { BaseScanner } from './base-scanner.js';
import type { Category, ScanResult, ScannerOptions, CleanableItem } from '../types.js';

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
    testDir = await mkdtemp(join(tmpdir(), 'clean-my-mac-scanner-test-'));
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
  });
});

