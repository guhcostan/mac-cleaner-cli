import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { BrowserCacheScanner } from './browser-cache.js';
import * as paths from '../utils/paths.js';

describe('BrowserCacheScanner', () => {
  let testDir: string;
  let scanner: BrowserCacheScanner;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'clean-my-mac-browser-test-'));
    scanner = new BrowserCacheScanner();
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('should have correct category', () => {
    expect(scanner.category.id).toBe('browser-cache');
    expect(scanner.category.name).toBe('Browser Cache');
    expect(scanner.category.group).toBe('Browsers');
    expect(scanner.category.safetyLevel).toBe('safe');
  });

  it('should scan browser cache directories', async () => {
    const chromeCache = join(testDir, 'Chrome');
    const safariCache = join(testDir, 'Safari');
    
    await mkdir(chromeCache, { recursive: true });
    await mkdir(safariCache, { recursive: true });
    await writeFile(join(chromeCache, 'cache1'), 'chrome cache data');
    await writeFile(join(safariCache, 'cache1'), 'safari cache data');

    vi.spyOn(paths, 'PATHS', 'get').mockReturnValue({
      ...paths.PATHS,
      chromeCache: chromeCache,
      safariCache: safariCache,
      firefoxProfiles: join(testDir, 'nonexistent'),
      arcCache: join(testDir, 'nonexistent'),
    });

    const result = await scanner.scan();

    expect(result.category.id).toBe('browser-cache');
    expect(result.items.length).toBe(2);
  });

  it('should handle missing browser caches', async () => {
    vi.spyOn(paths, 'PATHS', 'get').mockReturnValue({
      ...paths.PATHS,
      chromeCache: join(testDir, 'nonexistent1'),
      safariCache: join(testDir, 'nonexistent2'),
      firefoxProfiles: join(testDir, 'nonexistent3'),
      arcCache: join(testDir, 'nonexistent4'),
    });

    const result = await scanner.scan();

    expect(result.items).toHaveLength(0);
    expect(result.totalSize).toBe(0);
  });

  it('should include browser name in item name', async () => {
    const chromeCache = join(testDir, 'Chrome');
    await mkdir(chromeCache, { recursive: true });
    await writeFile(join(chromeCache, 'data'), 'cache');

    vi.spyOn(paths, 'PATHS', 'get').mockReturnValue({
      ...paths.PATHS,
      chromeCache: chromeCache,
      safariCache: join(testDir, 'nonexistent'),
      firefoxProfiles: join(testDir, 'nonexistent'),
      arcCache: join(testDir, 'nonexistent'),
    });

    const result = await scanner.scan();

    expect(result.items[0].name).toContain('Chrome');
  });
});

