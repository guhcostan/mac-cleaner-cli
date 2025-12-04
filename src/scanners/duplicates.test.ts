import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { DuplicatesScanner } from './duplicates.js';
import * as fsUtils from '../utils/fs.js';

vi.mock('../utils/fs.js', () => ({
  exists: vi.fn(),
  getFileHash: vi.fn(),
  removeItems: vi.fn().mockResolvedValue({ deleted: 0, freedSpace: 0, errors: [] }),
}));

vi.mock('../utils/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/index.js')>();
  return {
    ...actual,
    exists: vi.fn(() => false),
    getFileHash: vi.fn(() => 'abc123'),
  };
});

describe('DuplicatesScanner', () => {
  const scanner = new DuplicatesScanner();
  const testDir = join(tmpdir(), 'clean-my-mac-duplicates-test');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(testDir, { recursive: true, force: true });
  });

  it('should have correct category', () => {
    expect(scanner.category.id).toBe('duplicates');
    expect(scanner.category.name).toBe('Duplicate Files');
    expect(scanner.category.group).toBe('Storage');
    expect(scanner.category.safetyLevel).toBe('risky');
  });

  it('should return empty results when no search paths exist', async () => {
    vi.mocked(fsUtils.exists).mockResolvedValue(false);

    const result = await scanner.scan();

    expect(result.items).toHaveLength(0);
    expect(result.totalSize).toBe(0);
  });

  it('should have clean method', async () => {
    const result = await scanner.clean([]);
    expect(result.category.id).toBe('duplicates');
  });

  it('should scan existing directories', async () => {
    vi.mocked(fsUtils.exists).mockResolvedValue(true);

    await scanner.scan();

    expect(fsUtils.exists).toHaveBeenCalled();
  });

  it('should clean items successfully', async () => {
    const items = [
      { path: '/test/file1.txt', size: 1000, name: 'file1.txt', isDirectory: false },
    ];

    const result = await scanner.clean(items);

    expect(result.category.id).toBe('duplicates');
    expect(fsUtils.removeItems).toHaveBeenCalledWith(items, false);
  });

  it('should support dry run mode', async () => {
    const items = [
      { path: '/test/file1.txt', size: 1000, name: 'file1.txt', isDirectory: false },
    ];

    await scanner.clean(items, true);

    expect(fsUtils.removeItems).toHaveBeenCalledWith(items, true);
  });

  it('should use minSize option when scanning', async () => {
    vi.mocked(fsUtils.exists).mockResolvedValue(true);

    const result = await scanner.scan({ minSize: 5000000 });

    expect(result).toBeDefined();
  });
});
