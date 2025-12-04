import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm, utimes } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { DownloadsScanner } from './downloads.js';
import * as paths from '../utils/paths.js';

describe('DownloadsScanner', () => {
  let testDir: string;
  let scanner: DownloadsScanner;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'clean-my-mac-downloads-test-'));
    scanner = new DownloadsScanner();
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('should have correct category', () => {
    expect(scanner.category.id).toBe('downloads');
    expect(scanner.category.name).toBe('Old Downloads');
    expect(scanner.category.group).toBe('Storage');
    expect(scanner.category.safetyLevel).toBe('risky');
  });

  it('should filter by age', async () => {
    const downloadsDir = join(testDir, 'Downloads');
    await mkdir(downloadsDir);

    const oldFile = join(downloadsDir, 'old.zip');
    const newFile = join(downloadsDir, 'new.zip');

    await writeFile(oldFile, 'old content');
    await writeFile(newFile, 'new content');

    const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    await utimes(oldFile, oldDate, oldDate);

    vi.spyOn(paths, 'PATHS', 'get').mockReturnValue({
      ...paths.PATHS,
      downloads: downloadsDir,
    });

    const result = await scanner.scan({ daysOld: 30 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe('old.zip');
  });

  it('should handle empty downloads', async () => {
    const downloadsDir = join(testDir, 'Downloads');
    await mkdir(downloadsDir);

    vi.spyOn(paths, 'PATHS', 'get').mockReturnValue({
      ...paths.PATHS,
      downloads: downloadsDir,
    });

    const result = await scanner.scan();

    expect(result.items).toHaveLength(0);
  });

  it('should use custom days old option', async () => {
    const downloadsDir = join(testDir, 'Downloads');
    await mkdir(downloadsDir);

    const file = join(downloadsDir, 'file.zip');
    await writeFile(file, 'content');

    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    await utimes(file, tenDaysAgo, tenDaysAgo);

    vi.spyOn(paths, 'PATHS', 'get').mockReturnValue({
      ...paths.PATHS,
      downloads: downloadsDir,
    });

    const result7Days = await scanner.scan({ daysOld: 7 });
    expect(result7Days.items).toHaveLength(1);

    const result30Days = await scanner.scan({ daysOld: 30 });
    expect(result30Days.items).toHaveLength(0);
  });

  it('should handle nonexistent downloads directory', async () => {
    vi.spyOn(paths, 'PATHS', 'get').mockReturnValue({
      ...paths.PATHS,
      downloads: join(testDir, 'nonexistent'),
    });

    const result = await scanner.scan();

    expect(result.items).toHaveLength(0);
    expect(result.totalSize).toBe(0);
  });
});

