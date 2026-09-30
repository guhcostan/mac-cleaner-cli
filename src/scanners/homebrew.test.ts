import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, access as realAccess } from 'fs/promises';
import { join } from 'path';
import { tmpdir, homedir } from 'os';
import { HomebrewScanner } from './homebrew.js';

interface FakeProcess {
  stdout?: string;
  stderr?: string;
  code?: number;
  error?: Error;
}

const spawnCalls: Array<{ command: string; args: string[] }> = [];
let respond: (command: string, args: string[]) => FakeProcess;

vi.mock('child_process', () => ({
  spawn: (command: string, args: string[]) => {
    spawnCalls.push({ command, args });
    const result = respond(command, args);

    return {
      stdout: {
        on: (event: string, callback: (data: Buffer) => void) => {
          if (event === 'data' && result.stdout) {
            setTimeout(() => callback(Buffer.from(result.stdout as string)), 0);
          }
        },
      },
      stderr: {
        on: (event: string, callback: (data: Buffer) => void) => {
          if (event === 'data' && result.stderr) {
            setTimeout(() => callback(Buffer.from(result.stderr as string)), 0);
          }
        },
      },
      on: (event: string, callback: (arg?: number | Error) => void) => {
        if (event === 'error' && result.error) {
          setTimeout(() => callback(result.error), 0);
        }
        if (event === 'close' && !result.error) {
          setTimeout(() => callback(result.code ?? 0), 0);
        }
      },
    };
  },
}));

// `access` controls brew binary detection, `stat` avoids touching the real cache path
vi.mock('fs/promises', async () => {
  const actual = await vi.importActual<typeof import('fs/promises')>('fs/promises');
  return {
    ...actual,
    access: vi.fn().mockRejectedValue(new Error('Not found')),
    stat: vi.fn().mockResolvedValue({ mtime: new Date('2024-01-15T00:00:00Z') }),
  };
});

vi.mock('../utils/index.js', async () => {
  const actual = await vi.importActual<typeof import('../utils/index.js')>('../utils/index.js');
  return {
    ...actual,
    exists: vi.fn().mockResolvedValue(true),
    getSize: vi.fn().mockResolvedValue(2048),
  };
});

const { access } = await import('fs/promises');
const { exists, getSize } = await import('../utils/index.js');

const BREW_BIN = '/opt/homebrew/bin/brew';
const BREW_CACHE = join(homedir(), 'Library', 'Caches', 'Homebrew');

function brewInstalled(): void {
  vi.mocked(access).mockImplementation(async (path) => {
    if (path === BREW_BIN) return undefined;
    throw new Error('Not found');
  });
}

describe('HomebrewScanner', () => {
  let scanner: HomebrewScanner;

  beforeEach(() => {
    scanner = new HomebrewScanner();
    spawnCalls.length = 0;
    respond = () => ({ stdout: `${BREW_CACHE}\n` });
    vi.mocked(access).mockRejectedValue(new Error('Not found'));
    vi.mocked(exists).mockResolvedValue(true);
    vi.mocked(getSize).mockResolvedValue(2048);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have correct category', () => {
    expect(scanner.category.id).toBe('homebrew');
    expect(scanner.category.name).toBe('Homebrew Cache');
    expect(scanner.category.group).toBe('Development');
    // NOT 'safe': `brew cleanup --prune=all` removes old formula versions, not
    // just the download cache.
    expect(scanner.category.safetyLevel).toBe('moderate');
    expect(scanner.category.safetyNote).toBeDefined();
  });

  describe('scan', () => {
    it('should return no items when the brew binary is not found', async () => {
      const result = await scanner.scan();

      expect(result.category.id).toBe('homebrew');
      expect(result.items).toHaveLength(0);
      expect(spawnCalls).toHaveLength(0);
    });

    it('should report the brew download cache when brew is installed', async () => {
      brewInstalled();

      const result = await scanner.scan();

      expect(spawnCalls).toEqual([{ command: BREW_BIN, args: ['--cache'] }]);
      expect(result.totalSize).toBe(2048);
      expect(result.items).toEqual([
        {
          path: BREW_CACHE,
          size: 2048,
          name: 'Homebrew Download Cache',
          isDirectory: true,
          modifiedAt: new Date('2024-01-15T00:00:00Z'),
        },
      ]);
    });

    it('should reject a cache path outside the expected locations', async () => {
      brewInstalled();
      respond = () => ({ stdout: '/etc\n' });
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      const result = await scanner.scan();

      expect(result.items).toHaveLength(0);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Unexpected Homebrew cache location'));
    });

    it('should skip a cache directory that does not exist', async () => {
      brewInstalled();
      vi.mocked(exists).mockResolvedValue(false);

      const result = await scanner.scan();

      expect(result.items).toHaveLength(0);
    });

    it('should skip an empty cache directory', async () => {
      brewInstalled();
      vi.mocked(getSize).mockResolvedValue(0);

      const result = await scanner.scan();

      expect(result.items).toHaveLength(0);
    });

    it('should return no items when brew --cache fails', async () => {
      brewInstalled();
      respond = () => ({ code: 1, stderr: 'brew is broken' });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(0);
    });
  });

  describe('clean', () => {
    const cacheItem = {
      path: BREW_CACHE,
      size: 1000,
      name: 'Homebrew Download Cache',
      isDirectory: true,
    };

    it('should not touch anything during a dry run', async () => {
      const result = await scanner.clean([cacheItem], true);

      expect(result.cleanedItems).toBe(1);
      expect(result.freedSpace).toBe(1000);
      expect(result.errors).toHaveLength(0);
      expect(spawnCalls).toHaveLength(0);
    });

    it('should run brew cleanup when the cache root is selected', async () => {
      brewInstalled();

      const result = await scanner.clean([cacheItem], false);

      expect(spawnCalls.map((call) => call.args)).toEqual([['--cache'], ['cleanup', '--prune=all']]);
      expect(result.cleanedItems).toBe(1);
      expect(result.freedSpace).toBe(1000);
      expect(result.errors).toHaveLength(0);
    });

    it('should report an error when brew cleanup fails', async () => {
      brewInstalled();
      respond = (_command, args) => {
        if (args.includes('cleanup')) return { code: 1, stderr: 'cleanup exploded' };
        return { stdout: `${BREW_CACHE}\n` };
      };

      const result = await scanner.clean([cacheItem], false);

      expect(result.cleanedItems).toBe(0);
      expect(result.freedSpace).toBe(0);
      expect(result.errors[0]).toContain('Homebrew cleanup failed: cleanup exploded');
    });

    it('should delete files directly when only cache entries are selected', async () => {
      brewInstalled();
      const testDir = await mkdtemp(join(tmpdir(), 'mac-cleaner-brew-test-'));
      const filePath = join(testDir, 'cached.tar.gz');
      await writeFile(filePath, 'x'.repeat(10));

      try {
        const result = await scanner.clean(
          [{ path: filePath, size: 10, name: 'cached.tar.gz', isDirectory: false }],
          false
        );

        expect(result.cleanedItems).toBe(1);
        expect(result.freedSpace).toBe(10);
        expect(spawnCalls.map((call) => call.args)).toEqual([['--cache']]);
        await expect(realAccess(filePath)).rejects.toThrow();
      } finally {
        await rm(testDir, { recursive: true, force: true });
      }
    });

    it('should fall back to direct deletion when brew is not installed', async () => {
      const result = await scanner.clean(
        [{ path: join(tmpdir(), 'mac-cleaner-missing-brew-cache'), size: 10, name: 'missing', isDirectory: false }],
        false
      );

      expect(spawnCalls).toHaveLength(0);
      expect(result.cleanedItems).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
