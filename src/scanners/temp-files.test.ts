import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { TempFilesScanner } from './temp-files.js';
import * as paths from '../utils/paths.js';

describe('TempFilesScanner', () => {
  let testDir: string;
  let scanner: TempFilesScanner;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'clean-my-mac-temp-test-'));
    scanner = new TempFilesScanner();
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('should have correct category', () => {
    expect(scanner.category.id).toBe('temp-files');
    expect(scanner.category.name).toBe('Temporary Files');
    expect(scanner.category.group).toBe('System Junk');
    expect(scanner.category.safetyLevel).toBe('safe');
  });

  it('should scan tmp directory', async () => {
    const tmpDir = join(testDir, 'tmp');
    await mkdir(tmpDir);
    await writeFile(join(tmpDir, 'temp1.tmp'), 'temp content 1');
    await writeFile(join(tmpDir, 'temp2.tmp'), 'temp content 2');

    vi.spyOn(paths, 'PATHS', 'get').mockReturnValue({
      ...paths.PATHS,
      tmp: tmpDir,
      varFolders: join(testDir, 'nonexistent'),
    });

    const result = await scanner.scan();

    expect(result.category.id).toBe('temp-files');
    expect(result.items.length).toBe(2);
  });

  it('should scan var/folders directory', async () => {
    const varFolders = join(testDir, 'var_folders');
    const tempPath = join(varFolders, 'ab', 'cd', 'T');
    await mkdir(tempPath, { recursive: true });
    await writeFile(join(tempPath, 'temp.tmp'), 'temp content');

    vi.spyOn(paths, 'PATHS', 'get').mockReturnValue({
      ...paths.PATHS,
      tmp: join(testDir, 'nonexistent'),
      varFolders: varFolders,
    });

    const result = await scanner.scan();

    expect(result.items.length).toBeGreaterThanOrEqual(1);
  });

  it('should handle missing directories', async () => {
    vi.spyOn(paths, 'PATHS', 'get').mockReturnValue({
      ...paths.PATHS,
      tmp: join(testDir, 'nonexistent1'),
      varFolders: join(testDir, 'nonexistent2'),
    });

    const result = await scanner.scan();

    expect(result.items).toHaveLength(0);
    expect(result.totalSize).toBe(0);
  });

  it('should calculate total size correctly', async () => {
    const tmpDir = join(testDir, 'tmp');
    await mkdir(tmpDir);
    const content1 = 'temp content 1';
    const content2 = 'temp content 2';
    await writeFile(join(tmpDir, 'temp1.tmp'), content1);
    await writeFile(join(tmpDir, 'temp2.tmp'), content2);

    vi.spyOn(paths, 'PATHS', 'get').mockReturnValue({
      ...paths.PATHS,
      tmp: tmpDir,
      varFolders: join(testDir, 'nonexistent'),
    });

    const result = await scanner.scan();

    expect(result.totalSize).toBe(content1.length + content2.length);
  });
});

