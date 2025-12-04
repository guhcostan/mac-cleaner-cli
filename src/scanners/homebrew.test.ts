import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { HomebrewScanner } from './homebrew.js';

const { mockExecAsync } = vi.hoisted(() => {
  return { mockExecAsync: vi.fn() };
});

vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

vi.mock('util', () => ({
  promisify: vi.fn(() => mockExecAsync),
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
    mockExecAsync.mockRejectedValue(new Error('brew not found'));

    const result = await scanner.scan();

    expect(result.items).toHaveLength(0);
  });

  it('should scan homebrew cache when exists', async () => {
    const cacheDir = join(testDir, 'homebrew-cache');
    await mkdir(cacheDir);
    await writeFile(join(cacheDir, 'package.tar.gz'), 'cache data');

    mockExecAsync.mockResolvedValue({ stdout: cacheDir + '\n', stderr: '' });

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
    mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' });

    const items = [
      { path: '/usr/local/Homebrew/cache', size: 1000, name: 'Homebrew Cache', isDirectory: true },
    ];

    const result = await scanner.clean(items, false);

    expect(result.cleanedItems).toBe(1);
    expect(result.freedSpace).toBe(1000);
    expect(result.errors).toHaveLength(0);
  });

  it('should handle brew cleanup failure', async () => {
    mockExecAsync.mockRejectedValue(new Error('cleanup failed'));

    const items = [
      { path: '/usr/local/Homebrew/cache', size: 1000, name: 'Homebrew Cache', isDirectory: true },
    ];

    const result = await scanner.clean(items, false);

    expect(result.cleanedItems).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

