import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { scanCommand, listCategories } from './scan.js';
import * as scanners from '../scanners/index.js';

vi.mock('../scanners/index.js', () => ({
  runAllScans: vi.fn(),
  runScans: vi.fn(),
  getAllScanners: vi.fn(() => [{ category: { id: 'trash', name: 'Trash' } }]),
  getScanner: vi.fn(),
}));

describe('scan command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('scanCommand', () => {
    it('should run all scans by default', async () => {
      vi.mocked(scanners.runAllScans).mockResolvedValue({
        results: [
          {
            category: {
              id: 'trash',
              name: 'Trash',
              group: 'Storage',
              description: 'Trash',
              safetyLevel: 'safe',
            },
            items: [{ path: '/test', size: 1000, name: 'test', isDirectory: false }],
            totalSize: 1000,
          },
        ],
        totalSize: 1000,
        totalItems: 1,
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const result = await scanCommand({});

      expect(scanners.runAllScans).toHaveBeenCalled();
      expect(result.totalSize).toBe(1000);

      consoleSpy.mockRestore();
    });

    it('should run specific category scan', async () => {
      vi.mocked(scanners.runScans).mockResolvedValue({
        results: [
          {
            category: {
              id: 'trash',
              name: 'Trash',
              group: 'Storage',
              description: 'Trash',
              safetyLevel: 'safe',
            },
            items: [],
            totalSize: 0,
          },
        ],
        totalSize: 0,
        totalItems: 0,
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await scanCommand({ category: 'trash' });

      expect(scanners.runScans).toHaveBeenCalledWith(['trash'], expect.any(Object));

      consoleSpy.mockRestore();
    });

    it('should output valid JSON with --json', async () => {
      vi.mocked(scanners.runAllScans).mockResolvedValue({
        results: [
          {
            category: {
              id: 'trash',
              name: 'Trash',
              group: 'Storage',
              description: 'Trash',
              safetyLevel: 'safe',
            },
            items: [{ path: '/test', size: 1000, name: 'test', isDirectory: false }],
            totalSize: 1000,
          },
          {
            category: {
              id: 'homebrew',
              name: 'Homebrew Cache',
              group: 'Development',
              description: 'Homebrew',
              safetyLevel: 'safe',
            },
            items: [],
            totalSize: 0,
          },
        ],
        totalSize: 1000,
        totalItems: 1,
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await scanCommand({ json: true });

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const parsed = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(parsed.totalSize).toBe(1000);
      expect(parsed.totalItems).toBe(1);
      // Empty categories are omitted; item paths only appear with --verbose
      expect(parsed.categories).toHaveLength(1);
      expect(parsed.categories[0]).toMatchObject({
        id: 'trash',
        safetyLevel: 'safe',
        totalSize: 1000,
        itemCount: 1,
      });
      expect(parsed.categories[0].items).toBeUndefined();

      consoleSpy.mockRestore();
    });

    it('should include item paths in JSON with --verbose', async () => {
      vi.mocked(scanners.runAllScans).mockResolvedValue({
        results: [
          {
            category: {
              id: 'trash',
              name: 'Trash',
              group: 'Storage',
              description: 'Trash',
              safetyLevel: 'safe',
            },
            items: [{ path: '/test', size: 1000, name: 'test', isDirectory: false }],
            totalSize: 1000,
          },
        ],
        totalSize: 1000,
        totalItems: 1,
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await scanCommand({ json: true, verbose: true });

      const parsed = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(parsed.categories[0].items).toEqual([{ path: '/test', size: 1000 }]);

      consoleSpy.mockRestore();
    });
  });

  describe('listCategories', () => {
    it('should list all categories', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      listCategories();

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls.flat().join('\n');
      expect(output).toContain('Available Categories');

      consoleSpy.mockRestore();
    });
  });
});

