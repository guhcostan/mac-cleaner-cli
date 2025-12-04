import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { HomebrewScanner } from './homebrew.js';
import * as childProcess from 'child_process';

vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

vi.mock('util', () => ({
  promisify: vi.fn((fn) => fn),
}));

describe('HomebrewScanner', () => {
  let scanner: HomebrewScanner;
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'clean-my-mac-brew-test-'));
    scanner = new HomebrewScanner();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('should have correct category', () => {
    expect(scanner.category.id).toBe('homebrew');
    expect(scanner.category.name).toBe('Homebrew Cache');
    expect(scanner.category.group).toBe('Development');
    expect(scanner.category.safetyLevel).toBe('safe');
  });

  it('should handle homebrew not installed', async () => {
    vi.mocked(childProcess.exec).mockImplementation((_cmd, callback) => {
      (callback as (err: Error | null, stdout: string, stderr: string) => void)(new Error('brew not found'), '', '');
      return {} as ReturnType<typeof childProcess.exec>;
    });

    const result = await scanner.scan();

    expect(result.items).toHaveLength(0);
  });

  it('should scan homebrew cache when exists', async () => {
    const cacheDir = join(testDir, 'homebrew-cache');
    await mkdir(cacheDir);
    await writeFile(join(cacheDir, 'package.tar.gz'), 'cache data');

    vi.mocked(childProcess.exec).mockImplementation((cmd, callback) => {
      if (typeof cmd === 'string' && cmd.includes('--cache')) {
        (callback as (err: Error | null, result: { stdout: string; stderr: string }) => void)(null, { stdout: cacheDir + '\n', stderr: '' });
      }
      return {} as ReturnType<typeof childProcess.exec>;
    });

    const result = await scanner.scan();

    expect(result.items.length).toBeGreaterThanOrEqual(1);
  });

  it('should clean using brew cleanup with dry run', async () => {
    const items = [
      { path: '/usr/local/Homebrew/cache', size: 1000, name: 'Homebrew Cache', isDirectory: true },
    ];

    const result = await scanner.clean(items, true);

    expect(result.category.id).toBe('homebrew');
    expect(result.cleanedItems).toBe(1);
    expect(result.freedSpace).toBe(1000);
  });

  it('should clean using brew cleanup successfully', async () => {
    vi.mocked(childProcess.exec).mockImplementation((_cmd, callback) => {
      (callback as (err: Error | null, result: { stdout: string; stderr: string }) => void)(null, { stdout: '', stderr: '' });
      return {} as ReturnType<typeof childProcess.exec>;
    });

    const items = [
      { path: '/usr/local/Homebrew/cache', size: 1000, name: 'Homebrew Cache', isDirectory: true },
    ];

    const result = await scanner.clean(items, false);

    expect(result.cleanedItems).toBe(1);
    expect(result.freedSpace).toBe(1000);
    expect(result.errors).toHaveLength(0);
  });

  it('should handle brew cleanup failure', async () => {
    vi.mocked(childProcess.exec).mockImplementation((_cmd, callback) => {
      (callback as (err: Error | null, result: { stdout: string; stderr: string }) => void)(new Error('cleanup failed'), { stdout: '', stderr: '' });
      return {} as ReturnType<typeof childProcess.exec>;
    });

    const items = [
      { path: '/usr/local/Homebrew/cache', size: 1000, name: 'Homebrew Cache', isDirectory: true },
    ];

    const result = await scanner.clean(items, false);

    expect(result.cleanedItems).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

