import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanCommand } from './clean.js';
import * as scanners from '../scanners/index.js';
import type { Category } from '../types.js';

vi.mock('../scanners/index.js', () => ({
  runAllScans: vi.fn(),
  getScanner: vi.fn(),
}));

vi.mock('@inquirer/prompts', () => ({
  confirm: vi.fn(),
  checkbox: vi.fn(),
}));

const trashCategory: Category = {
  id: 'trash',
  name: 'Trash',
  group: 'Storage',
  description: 'Trash',
  safetyLevel: 'safe',
};

const downloadsCategory: Category = {
  id: 'downloads',
  name: 'Old Downloads',
  group: 'Storage',
  description: 'Downloads',
  safetyLevel: 'risky',
  safetyNote: 'May contain important files',
};

describe('clean command', () => {
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

    const result = await cleanCommand({});

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

    const result = await cleanCommand({ all: true, yes: true });

    expect(result).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Skipping risky'));

    consoleSpy.mockRestore();
  });

  it('should perform dry run', async () => {
    const mockScanner = {
      category: trashCategory,
      scan: vi.fn(),
      clean: vi.fn().mockResolvedValue({
        category: trashCategory,
        cleanedItems: 1,
        freedSpace: 1000,
        errors: [],
      }),
    };

    vi.mocked(scanners.runAllScans).mockResolvedValue({
      results: [
        {
          category: trashCategory,
          items: [{ path: '/test', size: 1000, name: 'test', isDirectory: false }],
          totalSize: 1000,
        },
      ],
      totalSize: 1000,
      totalItems: 1,
    });

    vi.mocked(scanners.getScanner).mockReturnValue(mockScanner as unknown as ReturnType<typeof scanners.getScanner>);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await cleanCommand({ all: true, yes: true, dryRun: true });

    expect(result).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('DRY RUN'));

    consoleSpy.mockRestore();
  });

  it('should clean safe categories with --all --yes', async () => {
    const mockScanner = {
      category: trashCategory,
      scan: vi.fn(),
      clean: vi.fn().mockResolvedValue({
        category: trashCategory,
        cleanedItems: 1,
        freedSpace: 1000,
        errors: [],
      }),
    };

    vi.mocked(scanners.runAllScans).mockResolvedValue({
      results: [
        {
          category: trashCategory,
          items: [{ path: '/test', size: 1000, name: 'test', isDirectory: false }],
          totalSize: 1000,
        },
      ],
      totalSize: 1000,
      totalItems: 1,
    });

    vi.mocked(scanners.getScanner).mockReturnValue(mockScanner as unknown as ReturnType<typeof scanners.getScanner>);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await cleanCommand({ all: true, yes: true });

    expect(result).not.toBeNull();
    expect(result?.totalFreedSpace).toBe(1000);
    expect(mockScanner.clean).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});
