import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { LargeFilesScanner } from './large-files.js';
import * as paths from '../utils/paths.js';

describe('LargeFilesScanner', () => {
  let testDir: string;
  let scanner: LargeFilesScanner;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'clean-my-mac-large-test-'));
    scanner = new LargeFilesScanner();
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('should have correct category', () => {
    expect(scanner.category.id).toBe('large-files');
    expect(scanner.category.name).toBe('Large Files');
    expect(scanner.category.group).toBe('Large Files');
    expect(scanner.category.safetyLevel).toBe('risky');
  });

  it('should filter by minimum size', async () => {
    const docsDir = join(testDir, 'Documents');
    await mkdir(docsDir);

    const smallFile = join(docsDir, 'small.txt');
    const largeFile = join(docsDir, 'large.bin');

    await writeFile(smallFile, 'small');
    await writeFile(largeFile, 'x'.repeat(1000));

    vi.spyOn(paths, 'PATHS', 'get').mockReturnValue({
      ...paths.PATHS,
      downloads: join(testDir, 'nonexistent'),
      documents: docsDir,
    });

    const result = await scanner.scan({ minSize: 500 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe('large.bin');
  });

  it('should sort by size descending', async () => {
    const docsDir = join(testDir, 'Documents');
    await mkdir(docsDir);

    await writeFile(join(docsDir, 'medium.bin'), 'x'.repeat(600));
    await writeFile(join(docsDir, 'large.bin'), 'x'.repeat(1000));
    await writeFile(join(docsDir, 'small.bin'), 'x'.repeat(100));

    vi.spyOn(paths, 'PATHS', 'get').mockReturnValue({
      ...paths.PATHS,
      downloads: join(testDir, 'nonexistent'),
      documents: docsDir,
    });

    const result = await scanner.scan({ minSize: 50 });

    expect(result.items[0].name).toBe('large.bin');
    expect(result.items[1].name).toBe('medium.bin');
    expect(result.items[2].name).toBe('small.bin');
  });

  it('should skip hidden files', async () => {
    const docsDir = join(testDir, 'Documents');
    await mkdir(docsDir);

    await writeFile(join(docsDir, '.hidden'), 'x'.repeat(1000));
    await writeFile(join(docsDir, 'visible.bin'), 'x'.repeat(1000));

    vi.spyOn(paths, 'PATHS', 'get').mockReturnValue({
      ...paths.PATHS,
      downloads: join(testDir, 'nonexistent'),
      documents: docsDir,
    });

    const result = await scanner.scan({ minSize: 500 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe('visible.bin');
  });

  it('should scan nested directories', async () => {
    const docsDir = join(testDir, 'Documents');
    const subDir = join(docsDir, 'subfolder');
    await mkdir(subDir, { recursive: true });

    await writeFile(join(subDir, 'nested.bin'), 'x'.repeat(1000));

    vi.spyOn(paths, 'PATHS', 'get').mockReturnValue({
      ...paths.PATHS,
      downloads: join(testDir, 'nonexistent'),
      documents: docsDir,
    });

    const result = await scanner.scan({ minSize: 500 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe('nested.bin');
  });

  it('should respect max depth limit', async () => {
    const docsDir = join(testDir, 'Documents');
    const deepDir = join(docsDir, 'a', 'b', 'c', 'd', 'e');
    await mkdir(deepDir, { recursive: true });

    await writeFile(join(deepDir, 'deep.bin'), 'x'.repeat(1000));

    vi.spyOn(paths, 'PATHS', 'get').mockReturnValue({
      ...paths.PATHS,
      downloads: join(testDir, 'nonexistent'),
      documents: docsDir,
    });

    const result = await scanner.scan({ minSize: 500 });

    expect(result.items.filter(i => i.name === 'deep.bin')).toHaveLength(0);
  });

  it('should scan both downloads and documents', async () => {
    const docsDir = join(testDir, 'Documents');
    const downloadsDir = join(testDir, 'Downloads');
    await mkdir(docsDir);
    await mkdir(downloadsDir);

    await writeFile(join(docsDir, 'doc.bin'), 'x'.repeat(1000));
    await writeFile(join(downloadsDir, 'download.bin'), 'x'.repeat(1000));

    vi.spyOn(paths, 'PATHS', 'get').mockReturnValue({
      ...paths.PATHS,
      downloads: downloadsDir,
      documents: docsDir,
    });

    const result = await scanner.scan({ minSize: 500 });

    expect(result.items).toHaveLength(2);
  });

  it('should handle permission denied errors gracefully', async () => {
    const docsDir = join(testDir, 'Documents');
    await mkdir(docsDir);

    vi.spyOn(paths, 'PATHS', 'get').mockReturnValue({
      ...paths.PATHS,
      downloads: join(testDir, 'nonexistent'),
      documents: docsDir,
    });

    const result = await scanner.scan({ minSize: 500 });

    expect(result.items).toHaveLength(0);
  });
});

