import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { autoCleanCommand } from './autoclean.js';
import * as scanners from '../scanners/index.js';
import type { Category } from '../types.js';

vi.mock('../scanners/index.js', () => ({
  runAllScans: vi.fn(),
  getScanner: vi.fn(),
  getAllScanners: vi.fn(() => []),
}));

const devCacheCategory: Category = {
  id: 'dev-cache',
  name: 'Development Cache',
  group: 'Development',
  description: 'npm, yarn, pip, Xcode DerivedData, CocoaPods cache',
  safetyLevel: 'moderate',
};

const systemCacheCategory: Category = {
  id: 'system-cache',
  name: 'User Cache Files',
  group: 'System Junk',
  description: 'Application caches',
  safetyLevel: 'moderate',
};

const tempFilesCategory: Category = {
  id: 'temp-files',
  name: 'Temporary Files',
  group: 'System Junk',
  description: 'Temporary files',
  safetyLevel: 'safe',
};

const browserCacheCategory: Category = {
  id: 'browser-cache',
  name: 'Browser Cache',
  group: 'Browsers',
  description: 'Browser caches',
  safetyLevel: 'safe',
};

const homebrewCategory: Category = {
  id: 'homebrew',
  name: 'Homebrew Cache',
  group: 'Development',
  description: 'Homebrew cache',
  safetyLevel: 'safe',
};

const downloadsCategory: Category = {
  id: 'downloads',
  name: 'Old Downloads',
  group: 'Storage',
  description: 'Downloads',
  safetyLevel: 'risky',
};

describe('autoclean command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return null when nothing to clean', async () => {
    vi.mocked(scanners.runAllScans).mockResolvedValue({
      results: [],
      totalSize: 0,
      totalItems: 0,
    });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await autoCleanCommand({});

    expect(result).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('already clean'));

    consoleSpy.mockRestore();
  });

  it('should skip risky categories without --unsafe', async () => {
    vi.mocked(scanners.runAllScans).mockResolvedValue({
      results: [
        {
          category: downloadsCategory,
          items: [{ path: '/test', size: 1000, name: 'test.zip', isDirectory: false }],
          totalSize: 1000,
        },
      ],
      totalSize: 1000,
      totalItems: 1,
    });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await autoCleanCommand({ all: true, yes: true });

    expect(result).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No cleanable items'));

    consoleSpy.mockRestore();
  });

  it('should include risky categories with --unsafe when in target list', async () => {
    const riskyInTargetCategory: Category = {
      id: 'dev-cache',
      name: 'Development Cache',
      group: 'Development',
      description: 'Dev cache',
      safetyLevel: 'risky',
    };

    const mockScanner = {
      category: riskyInTargetCategory,
      scan: vi.fn(),
      clean: vi.fn().mockResolvedValue({
        category: riskyInTargetCategory,
        cleanedItems: 1,
        freedSpace: 1000,
        errors: [],
      }),
    };

    vi.mocked(scanners.runAllScans).mockResolvedValue({
      results: [
        {
          category: riskyInTargetCategory,
          items: [{ path: '/test', size: 1000, name: 'test.zip', isDirectory: false }],
          totalSize: 1000,
        },
      ],
      totalSize: 1000,
      totalItems: 1,
    });

    vi.mocked(scanners.getScanner).mockReturnValue(mockScanner as unknown as ReturnType<typeof scanners.getScanner>);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await autoCleanCommand({ dev: true, yes: true, unsafe: true });

    expect(result).not.toBeNull();
    expect(result?.totalFreedSpace).toBe(1000);

    consoleSpy.mockRestore();
  });

  it('should perform dry run', async () => {
    vi.mocked(scanners.runAllScans).mockResolvedValue({
      results: [
        {
          category: tempFilesCategory,
          items: [{ path: '/test', size: 1000, name: 'test', isDirectory: false }],
          totalSize: 1000,
        },
      ],
      totalSize: 1000,
      totalItems: 1,
    });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await autoCleanCommand({ all: true, dryRun: true });

    expect(result).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('DRY RUN'));

    consoleSpy.mockRestore();
  });

  it('should clean safe categories with --yes', async () => {
    const mockScanner = {
      category: tempFilesCategory,
      scan: vi.fn(),
      clean: vi.fn().mockResolvedValue({
        category: tempFilesCategory,
        cleanedItems: 1,
        freedSpace: 1000,
        errors: [],
      }),
    };

    vi.mocked(scanners.runAllScans).mockResolvedValue({
      results: [
        {
          category: tempFilesCategory,
          items: [{ path: '/test', size: 1000, name: 'test', isDirectory: false }],
          totalSize: 1000,
        },
      ],
      totalSize: 1000,
      totalItems: 1,
    });

    vi.mocked(scanners.getScanner).mockReturnValue(mockScanner as unknown as ReturnType<typeof scanners.getScanner>);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await autoCleanCommand({ all: true, yes: true });

    expect(result).not.toBeNull();
    expect(result?.totalFreedSpace).toBe(1000);
    expect(mockScanner.clean).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('should cancel when user declines without --yes', async () => {
    vi.mocked(scanners.runAllScans).mockResolvedValue({
      results: [
        {
          category: tempFilesCategory,
          items: [{ path: '/test', size: 1000, name: 'test', isDirectory: false }],
          totalSize: 1000,
        },
      ],
      totalSize: 1000,
      totalItems: 1,
    });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await autoCleanCommand({ all: true });

    expect(result).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('cancelled'));

    consoleSpy.mockRestore();
  });

  it('should handle cleaning with errors', async () => {
    const mockScanner = {
      category: tempFilesCategory,
      scan: vi.fn(),
      clean: vi.fn().mockResolvedValue({
        category: tempFilesCategory,
        cleanedItems: 0,
        freedSpace: 0,
        errors: ['Permission denied'],
      }),
    };

    vi.mocked(scanners.runAllScans).mockResolvedValue({
      results: [
        {
          category: tempFilesCategory,
          items: [{ path: '/test', size: 1000, name: 'test', isDirectory: false }],
          totalSize: 1000,
        },
      ],
      totalSize: 1000,
      totalItems: 1,
    });

    vi.mocked(scanners.getScanner).mockReturnValue(mockScanner as unknown as ReturnType<typeof scanners.getScanner>);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await autoCleanCommand({ all: true, yes: true });

    expect(result).not.toBeNull();
    expect(result?.totalErrors).toBe(1);

    consoleSpy.mockRestore();
  });

  it('should include dev-cache with --dev flag', async () => {
    const mockScanner = {
      category: devCacheCategory,
      scan: vi.fn(),
      clean: vi.fn().mockResolvedValue({
        category: devCacheCategory,
        cleanedItems: 1,
        freedSpace: 2000,
        errors: [],
      }),
    };

    vi.mocked(scanners.runAllScans).mockResolvedValue({
      results: [
        {
          category: devCacheCategory,
          items: [{ path: '/test', size: 2000, name: 'npm cache', isDirectory: true }],
          totalSize: 2000,
        },
      ],
      totalSize: 2000,
      totalItems: 1,
    });

    vi.mocked(scanners.getScanner).mockReturnValue(mockScanner as unknown as ReturnType<typeof scanners.getScanner>);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await autoCleanCommand({ dev: true, yes: true });

    expect(result).not.toBeNull();
    expect(result?.totalFreedSpace).toBe(2000);

    consoleSpy.mockRestore();
  });

  it('should include system-cache and temp-files with --system flag', async () => {
    const mockScanner = {
      category: systemCacheCategory,
      scan: vi.fn(),
      clean: vi.fn().mockResolvedValue({
        category: systemCacheCategory,
        cleanedItems: 1,
        freedSpace: 3000,
        errors: [],
      }),
    };

    vi.mocked(scanners.runAllScans).mockResolvedValue({
      results: [
        {
          category: systemCacheCategory,
          items: [{ path: '/test', size: 3000, name: 'cache', isDirectory: true }],
          totalSize: 3000,
        },
      ],
      totalSize: 3000,
      totalItems: 1,
    });

    vi.mocked(scanners.getScanner).mockReturnValue(mockScanner as unknown as ReturnType<typeof scanners.getScanner>);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await autoCleanCommand({ system: true, yes: true });

    expect(result).not.toBeNull();
    expect(result?.totalFreedSpace).toBe(3000);

    consoleSpy.mockRestore();
  });

  it('should include browser-cache with --browsers flag', async () => {
    const mockScanner = {
      category: browserCacheCategory,
      scan: vi.fn(),
      clean: vi.fn().mockResolvedValue({
        category: browserCacheCategory,
        cleanedItems: 1,
        freedSpace: 4000,
        errors: [],
      }),
    };

    vi.mocked(scanners.runAllScans).mockResolvedValue({
      results: [
        {
          category: browserCacheCategory,
          items: [{ path: '/test', size: 4000, name: 'Chrome Cache', isDirectory: true }],
          totalSize: 4000,
        },
      ],
      totalSize: 4000,
      totalItems: 1,
    });

    vi.mocked(scanners.getScanner).mockReturnValue(mockScanner as unknown as ReturnType<typeof scanners.getScanner>);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await autoCleanCommand({ browsers: true, yes: true });

    expect(result).not.toBeNull();
    expect(result?.totalFreedSpace).toBe(4000);

    consoleSpy.mockRestore();
  });

  it('should include homebrew with --homebrew flag', async () => {
    const mockScanner = {
      category: homebrewCategory,
      scan: vi.fn(),
      clean: vi.fn().mockResolvedValue({
        category: homebrewCategory,
        cleanedItems: 1,
        freedSpace: 5000,
        errors: [],
      }),
    };

    vi.mocked(scanners.runAllScans).mockResolvedValue({
      results: [
        {
          category: homebrewCategory,
          items: [{ path: '/test', size: 5000, name: 'Homebrew Cache', isDirectory: true }],
          totalSize: 5000,
        },
      ],
      totalSize: 5000,
      totalItems: 1,
    });

    vi.mocked(scanners.getScanner).mockReturnValue(mockScanner as unknown as ReturnType<typeof scanners.getScanner>);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await autoCleanCommand({ homebrew: true, yes: true });

    expect(result).not.toBeNull();
    expect(result?.totalFreedSpace).toBe(5000);

    consoleSpy.mockRestore();
  });

  it('should use all safe categories by default when no flags provided', async () => {
    const mockScanner = {
      category: tempFilesCategory,
      scan: vi.fn(),
      clean: vi.fn().mockResolvedValue({
        category: tempFilesCategory,
        cleanedItems: 1,
        freedSpace: 1000,
        errors: [],
      }),
    };

    vi.mocked(scanners.runAllScans).mockResolvedValue({
      results: [
        {
          category: tempFilesCategory,
          items: [{ path: '/test', size: 1000, name: 'test', isDirectory: false }],
          totalSize: 1000,
        },
      ],
      totalSize: 1000,
      totalItems: 1,
    });

    vi.mocked(scanners.getScanner).mockReturnValue(mockScanner as unknown as ReturnType<typeof scanners.getScanner>);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await autoCleanCommand({ yes: true });

    expect(result).not.toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Target categories: dev-cache, system-cache, temp-files, browser-cache, homebrew')
    );

    consoleSpy.mockRestore();
  });

  it('should filter results by target categories', async () => {
    vi.mocked(scanners.runAllScans).mockResolvedValue({
      results: [
        {
          category: tempFilesCategory,
          items: [{ path: '/test', size: 1000, name: 'test', isDirectory: false }],
          totalSize: 1000,
        },
        {
          category: devCacheCategory,
          items: [{ path: '/test2', size: 2000, name: 'npm', isDirectory: true }],
          totalSize: 2000,
        },
      ],
      totalSize: 3000,
      totalItems: 2,
    });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await autoCleanCommand({ system: true, dryRun: true });

    expect(result).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Target categories: system-cache, temp-files')
    );

    consoleSpy.mockRestore();
  });

  it('should return null when no items in target categories', async () => {
    vi.mocked(scanners.runAllScans).mockResolvedValue({
      results: [
        {
          category: downloadsCategory,
          items: [{ path: '/test', size: 1000, name: 'test.zip', isDirectory: false }],
          totalSize: 1000,
        },
      ],
      totalSize: 1000,
      totalItems: 1,
    });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await autoCleanCommand({ dev: true });

    expect(result).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No cleanable items'));

    consoleSpy.mockRestore();
  });
});
