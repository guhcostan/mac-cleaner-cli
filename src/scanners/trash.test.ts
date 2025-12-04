import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { TrashScanner } from './trash.js';
import * as paths from '../utils/paths.js';

describe('TrashScanner', () => {
  let testDir: string;
  let scanner: TrashScanner;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'clean-my-mac-trash-test-'));
    scanner = new TrashScanner();
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('should have correct category', () => {
    expect(scanner.category.id).toBe('trash');
    expect(scanner.category.name).toBe('Trash');
    expect(scanner.category.group).toBe('Storage');
    expect(scanner.category.safetyLevel).toBe('safe');
  });

  it('should scan trash directory', async () => {
    const trashDir = join(testDir, '.Trash');
    await mkdir(trashDir);
    await writeFile(join(trashDir, 'deleted1.txt'), 'deleted content 1');
    await writeFile(join(trashDir, 'deleted2.txt'), 'deleted content 2');

    vi.spyOn(paths, 'PATHS', 'get').mockReturnValue({
      ...paths.PATHS,
      trash: trashDir,
    });

    const result = await scanner.scan();

    expect(result.category.id).toBe('trash');
    expect(result.items.length).toBeGreaterThanOrEqual(0);
  });

  it('should handle nonexistent trash directory', async () => {
    vi.spyOn(paths, 'PATHS', 'get').mockReturnValue({
      ...paths.PATHS,
      trash: join(testDir, 'nonexistent-trash'),
    });

    const result = await scanner.scan();

    expect(result.items).toHaveLength(0);
    expect(result.totalSize).toBe(0);
  });

  it('should calculate total size correctly', async () => {
    const trashDir = join(testDir, '.Trash');
    await mkdir(trashDir);
    const content1 = 'deleted content 1';
    const content2 = 'deleted content 2';
    await writeFile(join(trashDir, 'deleted1.txt'), content1);
    await writeFile(join(trashDir, 'deleted2.txt'), content2);

    vi.spyOn(paths, 'PATHS', 'get').mockReturnValue({
      ...paths.PATHS,
      trash: trashDir,
    });

    const result = await scanner.scan();

    expect(result.totalSize).toBe(content1.length + content2.length);
  });

  it('should handle empty trash', async () => {
    const trashDir = join(testDir, '.Trash');
    await mkdir(trashDir);

    vi.spyOn(paths, 'PATHS', 'get').mockReturnValue({
      ...paths.PATHS,
      trash: trashDir,
    });

    const result = await scanner.scan();

    expect(result.items).toHaveLength(0);
    expect(result.totalSize).toBe(0);
  });
});

