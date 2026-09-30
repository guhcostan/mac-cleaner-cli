import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanCommand } from './clean.js';
import * as scanners from '../scanners/index.js';
import * as inquirerConfirm from '@inquirer/confirm';
import * as inquirerCheckbox from '@inquirer/checkbox';
import type { Category } from '../types.js';

vi.mock('../scanners/index.js', () => ({
  runAllScans: vi.fn(),
  runScans: vi.fn(),
  getScanner: vi.fn(),
  getAllScanners: vi.fn(() => []),
}));

vi.mock('@inquirer/confirm', () => ({
  default: vi.fn(),
}));

vi.mock('@inquirer/checkbox', () => ({
  default: vi.fn(),
}));

// loadConfig is mocked so tests never read the developer's real ~/.maccleanerrc
// (and never hit its module-level cache). Default: backups off, which is the
// shipped default.
vi.mock('../utils/config.js', async () => {
  const actual = await vi.importActual<typeof import('../utils/config.js')>('../utils/config.js');
  return { ...actual, loadConfig: vi.fn(async () => ({ backupEnabled: false })) };
});

vi.mock('child_process', () => ({
  exec: vi.fn(),
  spawn: vi.fn(() => ({
    unref: vi.fn(),
  })),
}));

const inquirerPrompts = {
  confirm: inquirerConfirm.default,
  checkbox: inquirerCheckbox.default,
};

const config = await import('../utils/config.js');

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

const riskyNoNoteCategory: Category = {
  id: 'ios-backups',
  name: 'iOS Backups',
  group: 'Storage',
  description: 'iOS device backups',
  safetyLevel: 'risky',
};

const largeFilesCategory: Category = {
  id: 'large-files',
  name: 'Large Files',
  group: 'Large Files',
  description: 'Large files',
  safetyLevel: 'risky',
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

  it('should skip risky categories without safety note', async () => {
    vi.mocked(scanners.runAllScans).mockResolvedValue({
      results: [
        {
          category: riskyNoNoteCategory,
          items: [{ path: '/test', size: 1000, name: 'backup', isDirectory: true }],
          totalSize: 1000,
        },
      ],
      totalSize: 1000,
      totalItems: 1,
    });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await cleanCommand({ all: true, yes: true });

    expect(result).toBeNull();

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

  it('should clean only the specified categories without interactive selection', async () => {
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

    vi.mocked(scanners.runScans).mockResolvedValue({
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

    const result = await cleanCommand({ categories: ['trash'], yes: true });

    expect(scanners.runScans).toHaveBeenCalledWith(['trash'], expect.anything());
    expect(scanners.runAllScans).not.toHaveBeenCalled();
    expect(inquirerPrompts.checkbox).not.toHaveBeenCalled();
    expect(result?.totalFreedSpace).toBe(1000);
    expect(mockScanner.clean).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('should still skip risky categories with --categories unless --unsafe', async () => {
    vi.mocked(scanners.runScans).mockResolvedValue({
      results: [
        {
          category: downloadsCategory,
          items: [{ path: '/test', size: 1000, name: 'test', isDirectory: false }],
          totalSize: 1000,
        },
      ],
      totalSize: 1000,
      totalItems: 1,
    });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await cleanCommand({ categories: ['downloads'], yes: true });

    expect(result).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('risky'));

    consoleSpy.mockRestore();
  });

  it('should cancel when user declines confirmation', async () => {
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

    vi.mocked(inquirerPrompts.confirm).mockResolvedValue(false);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await cleanCommand({ all: true });

    expect(result).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('cancelled'));

    consoleSpy.mockRestore();
  });

  it('should return null when no items selected interactively', async () => {
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

    vi.mocked(inquirerPrompts.checkbox).mockResolvedValue([]);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await cleanCommand({});

    expect(result).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No items selected'));

    consoleSpy.mockRestore();
  });

  it('should handle cleaning with errors', async () => {
    const mockScanner = {
      category: trashCategory,
      scan: vi.fn(),
      clean: vi.fn().mockResolvedValue({
        category: trashCategory,
        cleanedItems: 0,
        freedSpace: 0,
        errors: ['Permission denied'],
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
    expect(result?.totalErrors).toBe(1);

    consoleSpy.mockRestore();
  });

  it('should handle interactive selection for large-files category', async () => {
    const mockScanner = {
      category: largeFilesCategory,
      scan: vi.fn(),
      clean: vi.fn().mockResolvedValue({
        category: largeFilesCategory,
        cleanedItems: 1,
        freedSpace: 1000,
        errors: [],
      }),
    };

    vi.mocked(scanners.runAllScans).mockResolvedValue({
      results: [
        {
          category: largeFilesCategory,
          items: [{ path: '/test/large.bin', size: 1000, name: 'large.bin', isDirectory: false }],
          totalSize: 1000,
        },
      ],
      totalSize: 1000,
      totalItems: 1,
    });

    vi.mocked(scanners.getScanner).mockReturnValue(mockScanner as unknown as ReturnType<typeof scanners.getScanner>);
    vi.mocked(inquirerPrompts.checkbox)
      .mockResolvedValueOnce(['large-files'])
      .mockResolvedValueOnce(['/test/large.bin']);
    vi.mocked(inquirerPrompts.confirm).mockResolvedValue(true);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await cleanCommand({ unsafe: true });

    expect(result).not.toBeNull();
    expect(result?.totalFreedSpace).toBe(1000);

    consoleSpy.mockRestore();
  });

  it('should handle interactive selection for risky category with safetyNote', async () => {
    const mockScanner = {
      category: downloadsCategory,
      scan: vi.fn(),
      clean: vi.fn().mockResolvedValue({
        category: downloadsCategory,
        cleanedItems: 1,
        freedSpace: 1000,
        errors: [],
      }),
    };

    vi.mocked(scanners.runAllScans).mockResolvedValue({
      results: [
        {
          category: downloadsCategory,
          items: [{ path: '/test/file.zip', size: 1000, name: 'file.zip', isDirectory: false }],
          totalSize: 1000,
        },
      ],
      totalSize: 1000,
      totalItems: 1,
    });

    vi.mocked(scanners.getScanner).mockReturnValue(mockScanner as unknown as ReturnType<typeof scanners.getScanner>);
    vi.mocked(inquirerPrompts.checkbox)
      .mockResolvedValueOnce(['downloads'])
      .mockResolvedValueOnce(['/test/file.zip']);
    vi.mocked(inquirerPrompts.confirm).mockResolvedValue(true);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await cleanCommand({ unsafe: true });

    expect(result).not.toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('WARNING'));

    consoleSpy.mockRestore();
  });

  it('should skip items when none selected from risky category', async () => {
    vi.mocked(scanners.runAllScans).mockResolvedValue({
      results: [
        {
          category: largeFilesCategory,
          items: [{ path: '/test/large.bin', size: 1000, name: 'large.bin', isDirectory: false }],
          totalSize: 1000,
        },
      ],
      totalSize: 1000,
      totalItems: 1,
    });

    vi.mocked(inquirerPrompts.checkbox)
      .mockResolvedValueOnce(['large-files'])
      .mockResolvedValueOnce([]);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await cleanCommand({ unsafe: true });

    expect(result).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No items selected'));

    consoleSpy.mockRestore();
  });

  it('should select safe categories by default in interactive mode', async () => {
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
    vi.mocked(inquirerPrompts.checkbox).mockResolvedValue(['trash']);
    vi.mocked(inquirerPrompts.confirm).mockResolvedValue(true);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await cleanCommand({});

    expect(result).not.toBeNull();

    consoleSpy.mockRestore();
  });

  it('should handle ios-backups category with item selection', async () => {
    const iosCategory: Category = {
      id: 'ios-backups',
      name: 'iOS Backups',
      group: 'Storage',
      description: 'iOS device backups',
      safetyLevel: 'moderate',
    };

    const mockScanner = {
      category: iosCategory,
      scan: vi.fn(),
      clean: vi.fn().mockResolvedValue({
        category: iosCategory,
        cleanedItems: 1,
        freedSpace: 5000,
        errors: [],
      }),
    };

    vi.mocked(scanners.runAllScans).mockResolvedValue({
      results: [
        {
          category: iosCategory,
          items: [{ path: '/test/backup', size: 5000, name: 'iPhone Backup', isDirectory: true }],
          totalSize: 5000,
        },
      ],
      totalSize: 5000,
      totalItems: 1,
    });

    vi.mocked(scanners.getScanner).mockReturnValue(mockScanner as unknown as ReturnType<typeof scanners.getScanner>);
    vi.mocked(inquirerPrompts.checkbox)
      .mockResolvedValueOnce(['ios-backups'])
      .mockResolvedValueOnce(['/test/backup']);
    vi.mocked(inquirerPrompts.confirm).mockResolvedValue(true);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await cleanCommand({});

    expect(result).not.toBeNull();
    expect(result?.totalFreedSpace).toBe(5000);

    consoleSpy.mockRestore();
  });
});

describe('clean command backup handling', () => {
  // The `clean` subcommand must honour `backupEnabled` exactly like the
  // interactive flow. Backing up in one entry point and deleting permanently in
  // the other is worse than not backing up at all: what happens to the user's
  // files would depend on which command they happened to type.
  const trashScanner = () => ({
    category: trashCategory,
    supportsBackup: true,
    scan: vi.fn(),
    clean: vi.fn().mockResolvedValue({
      category: trashCategory,
      cleanedItems: 1,
      freedSpace: 0,
      backedUpSize: 1000,
      errors: [],
    }),
  });

  const setup = (scanner: unknown) => {
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
    vi.mocked(scanners.getScanner).mockReturnValue(
      scanner as ReturnType<typeof scanners.getScanner>
    );
    vi.mocked(inquirerPrompts.confirm).mockResolvedValue(true);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(config.loadConfig).mockResolvedValue({ backupEnabled: false });
  });

  it('deletes permanently when backupEnabled is off', async () => {
    const scanner = trashScanner();
    setup(scanner);
    vi.mocked(config.loadConfig).mockResolvedValue({ backupEnabled: false });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await cleanCommand({ all: true, yes: true });

    expect(scanner.clean).toHaveBeenCalledWith(expect.anything(), undefined, undefined);

    consoleSpy.mockRestore();
  });

  it('passes a backup directory to the scanner when backupEnabled is on', async () => {
    const scanner = trashScanner();
    setup(scanner);
    vi.mocked(config.loadConfig).mockResolvedValue({ backupEnabled: true });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await cleanCommand({ all: true, yes: true });

    const backupDirArg = scanner.clean.mock.calls[0][2];
    expect(backupDirArg).toEqual(expect.stringContaining('.mac-cleaner-cli'));

    consoleSpy.mockRestore();
  });

  it('warns that moving does not free disk space', async () => {
    const scanner = trashScanner();
    setup(scanner);
    vi.mocked(config.loadConfig).mockResolvedValue({ backupEnabled: true });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await cleanCommand({ all: true, yes: true });

    const output = consoleSpy.mock.calls.flat().join('\n');
    expect(output).toContain('does NOT free disk space');

    consoleSpy.mockRestore();
  });

  it('warns which categories cannot be backed up and will be deleted', async () => {
    const scanner = { ...trashScanner(), supportsBackup: false };
    setup(scanner);
    vi.mocked(config.loadConfig).mockResolvedValue({ backupEnabled: true });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await cleanCommand({ all: true, yes: true });

    const output = consoleSpy.mock.calls.flat().join('\n');
    expect(output).toContain('No backup possible');
    // An external-tool scanner must never receive a backup directory.
    expect(scanner.clean).toHaveBeenCalledWith(expect.anything(), undefined, undefined);

    consoleSpy.mockRestore();
  });
});
