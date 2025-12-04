import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { DevCacheScanner } from './dev-cache.js';
import * as paths from '../utils/paths.js';

describe('DevCacheScanner', () => {
  let testDir: string;
  let scanner: DevCacheScanner;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'clean-my-mac-dev-test-'));
    scanner = new DevCacheScanner();
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('should have correct category', () => {
    expect(scanner.category.id).toBe('dev-cache');
    expect(scanner.category.name).toBe('Development Cache');
    expect(scanner.category.group).toBe('Development');
    expect(scanner.category.safetyLevel).toBe('moderate');
  });

  it('should scan npm cache directory', async () => {
    const npmCache = join(testDir, 'npm');
    await mkdir(npmCache, { recursive: true });
    await writeFile(join(npmCache, 'package1'), 'npm cache data');

    vi.spyOn(paths, 'PATHS', 'get').mockReturnValue({
      ...paths.PATHS,
      npmCache: npmCache,
      yarnCache: join(testDir, 'nonexistent'),
      pnpmCache: join(testDir, 'nonexistent'),
      pipCache: join(testDir, 'nonexistent'),
      cocoapodsCache: join(testDir, 'nonexistent'),
      gradleCache: join(testDir, 'nonexistent'),
      cargoCache: join(testDir, 'nonexistent'),
      xcodeDerivedData: join(testDir, 'nonexistent'),
      xcodeArchives: join(testDir, 'nonexistent'),
    });

    const result = await scanner.scan();

    expect(result.items.length).toBeGreaterThanOrEqual(1);
    expect(result.items.some(i => i.name.includes('npm'))).toBe(true);
  });

  it('should scan Xcode DerivedData directory', async () => {
    const derivedData = join(testDir, 'DerivedData');
    const project1 = join(derivedData, 'MyProject-abc123');
    
    await mkdir(project1, { recursive: true });
    await writeFile(join(project1, 'build.log'), 'build log');

    vi.spyOn(paths, 'PATHS', 'get').mockReturnValue({
      ...paths.PATHS,
      npmCache: join(testDir, 'nonexistent'),
      yarnCache: join(testDir, 'nonexistent'),
      pnpmCache: join(testDir, 'nonexistent'),
      pipCache: join(testDir, 'nonexistent'),
      cocoapodsCache: join(testDir, 'nonexistent'),
      gradleCache: join(testDir, 'nonexistent'),
      cargoCache: join(testDir, 'nonexistent'),
      xcodeDerivedData: derivedData,
      xcodeArchives: join(testDir, 'nonexistent'),
    });

    const result = await scanner.scan();

    expect(result.items.some(i => i.name.includes('Xcode'))).toBe(true);
  });

  it('should handle empty dev caches', async () => {
    vi.spyOn(paths, 'PATHS', 'get').mockReturnValue({
      ...paths.PATHS,
      npmCache: join(testDir, 'nonexistent'),
      yarnCache: join(testDir, 'nonexistent'),
      pnpmCache: join(testDir, 'nonexistent'),
      pipCache: join(testDir, 'nonexistent'),
      cocoapodsCache: join(testDir, 'nonexistent'),
      gradleCache: join(testDir, 'nonexistent'),
      cargoCache: join(testDir, 'nonexistent'),
      xcodeDerivedData: join(testDir, 'nonexistent'),
      xcodeArchives: join(testDir, 'nonexistent'),
    });

    const result = await scanner.scan();

    expect(result.items).toHaveLength(0);
  });

  it('should skip empty cache directories', async () => {
    const npmCache = join(testDir, 'npm');
    await mkdir(npmCache, { recursive: true });

    vi.spyOn(paths, 'PATHS', 'get').mockReturnValue({
      ...paths.PATHS,
      npmCache: npmCache,
      yarnCache: join(testDir, 'nonexistent'),
      pnpmCache: join(testDir, 'nonexistent'),
      pipCache: join(testDir, 'nonexistent'),
      cocoapodsCache: join(testDir, 'nonexistent'),
      gradleCache: join(testDir, 'nonexistent'),
      cargoCache: join(testDir, 'nonexistent'),
      xcodeDerivedData: join(testDir, 'nonexistent'),
      xcodeArchives: join(testDir, 'nonexistent'),
    });

    const result = await scanner.scan();

    expect(result.items.filter(i => i.name.includes('npm'))).toHaveLength(0);
  });
});

