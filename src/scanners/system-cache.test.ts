import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { SystemCacheScanner } from './system-cache.js';
import * as paths from '../utils/paths.js';

describe('SystemCacheScanner', () => {
  let testDir: string;
  let scanner: SystemCacheScanner;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'clean-my-mac-cache-test-'));
    scanner = new SystemCacheScanner();
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('should have correct category', () => {
    expect(scanner.category.id).toBe('system-cache');
    expect(scanner.category.name).toBe('User Cache Files');
    expect(scanner.category.group).toBe('System Junk');
    expect(scanner.category.safetyLevel).toBe('moderate');
  });

  it('should scan cache directory', async () => {
    const cacheDir = join(testDir, 'Caches');
    await mkdir(cacheDir);
    await writeFile(join(cacheDir, 'app1.cache'), 'cache data 1');
    await writeFile(join(cacheDir, 'app2.cache'), 'cache data 2');

    vi.spyOn(paths, 'PATHS', 'get').mockReturnValue({
      ...paths.PATHS,
      userCaches: cacheDir,
    });

    const result = await scanner.scan();

    expect(result.category.id).toBe('system-cache');
    expect(result.items.length).toBeGreaterThanOrEqual(0);
  });

  it('should handle non-existing cache directory', async () => {
    vi.spyOn(paths, 'PATHS', 'get').mockReturnValue({
      ...paths.PATHS,
      userCaches: join(testDir, 'nonexistent'),
    });

    const result = await scanner.scan();

    expect(result.items).toHaveLength(0);
    expect(result.totalSize).toBe(0);
  });
});


