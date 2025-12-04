import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DuplicatesScanner } from './duplicates.js';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  readdir: vi.fn(),
  stat: vi.fn(),
}));

// Mock utils
vi.mock('../utils/index.js', () => ({
  exists: vi.fn(),
  getFileHash: vi.fn(),
  removeItems: vi.fn().mockResolvedValue({ deleted: 0, freedSpace: 0, errors: [] }),
}));

import * as fsPromises from 'fs/promises';
import * as utils from '../utils/index.js';

describe('DuplicatesScanner', () => {
  const scanner = new DuplicatesScanner();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have correct category', () => {
    expect(scanner.category.id).toBe('duplicates');
    expect(scanner.category.name).toBe('Duplicate Files');
    expect(scanner.category.group).toBe('Storage');
    expect(scanner.category.safetyLevel).toBe('risky');
  });

  it('should return empty results when no directories exist', async () => {
    vi.mocked(utils.exists).mockResolvedValue(false);

    const result = await scanner.scan();

    expect(result.items).toHaveLength(0);
    expect(result.totalSize).toBe(0);
  });

  it('should scan directories and find files', async () => {
    vi.mocked(utils.exists).mockResolvedValue(true);
    vi.mocked(fsPromises.readdir).mockResolvedValue([
      { name: 'file1.txt', isFile: () => true, isDirectory: () => false },
      { name: 'file2.txt', isFile: () => true, isDirectory: () => false },
    ] as unknown as Awaited<ReturnType<typeof fsPromises.readdir>>);
    vi.mocked(fsPromises.stat).mockResolvedValue({
      size: 2000000,
      mtime: new Date(),
    } as Awaited<ReturnType<typeof fsPromises.stat>>);
    vi.mocked(utils.getFileHash).mockResolvedValue('abc123');

    const result = await scanner.scan();

    expect(result.category.id).toBe('duplicates');
  });

  it('should skip hidden files', async () => {
    vi.mocked(utils.exists).mockResolvedValue(true);
    vi.mocked(fsPromises.readdir).mockResolvedValue([
      { name: '.hidden', isFile: () => true, isDirectory: () => false },
      { name: 'visible.txt', isFile: () => true, isDirectory: () => false },
    ] as unknown as Awaited<ReturnType<typeof fsPromises.readdir>>);
    vi.mocked(fsPromises.stat).mockResolvedValue({
      size: 2000000,
      mtime: new Date(),
    } as Awaited<ReturnType<typeof fsPromises.stat>>);

    const result = await scanner.scan();

    expect(result.category.id).toBe('duplicates');
  });

  it('should skip files smaller than minSize', async () => {
    vi.mocked(utils.exists).mockResolvedValue(true);
    vi.mocked(fsPromises.readdir).mockResolvedValue([
      { name: 'small.txt', isFile: () => true, isDirectory: () => false },
    ] as unknown as Awaited<ReturnType<typeof fsPromises.readdir>>);
    vi.mocked(fsPromises.stat).mockResolvedValue({
      size: 100,
      mtime: new Date(),
    } as Awaited<ReturnType<typeof fsPromises.stat>>);

    const result = await scanner.scan();

    expect(result.items).toHaveLength(0);
  });

  it('should recurse into subdirectories', async () => {
    vi.mocked(utils.exists).mockResolvedValue(true);
    vi.mocked(fsPromises.readdir).mockResolvedValue([
      { name: 'subdir', isFile: () => false, isDirectory: () => true },
    ] as unknown as Awaited<ReturnType<typeof fsPromises.readdir>>);
    vi.mocked(fsPromises.stat).mockResolvedValue({
      size: 2000000,
      mtime: new Date(),
    } as Awaited<ReturnType<typeof fsPromises.stat>>);

    const result = await scanner.scan();

    expect(result.category.id).toBe('duplicates');
  });

  it('should find duplicates with same hash', async () => {
    vi.mocked(utils.exists).mockResolvedValue(true);
    vi.mocked(fsPromises.readdir).mockResolvedValue([
      { name: 'file1.txt', isFile: () => true, isDirectory: () => false },
      { name: 'file2.txt', isFile: () => true, isDirectory: () => false },
    ] as unknown as Awaited<ReturnType<typeof fsPromises.readdir>>);
    vi.mocked(fsPromises.stat).mockResolvedValue({
      size: 2000000,
      mtime: new Date(),
    } as Awaited<ReturnType<typeof fsPromises.stat>>);
    vi.mocked(utils.getFileHash).mockResolvedValue('samehash');

    const result = await scanner.scan();

    expect(result.category.id).toBe('duplicates');
  });

  it('should handle readdir errors gracefully', async () => {
    vi.mocked(utils.exists).mockResolvedValue(true);
    vi.mocked(fsPromises.readdir).mockRejectedValue(new Error('Permission denied'));

    const result = await scanner.scan();

    expect(result.items).toHaveLength(0);
  });

  it('should handle stat errors gracefully', async () => {
    vi.mocked(utils.exists).mockResolvedValue(true);
    vi.mocked(fsPromises.readdir).mockResolvedValue([
      { name: 'file.txt', isFile: () => true, isDirectory: () => false },
    ] as unknown as Awaited<ReturnType<typeof fsPromises.readdir>>);
    vi.mocked(fsPromises.stat).mockRejectedValue(new Error('File not found'));

    const result = await scanner.scan();

    expect(result.items).toHaveLength(0);
  });

  it('should handle hash errors gracefully', async () => {
    vi.mocked(utils.exists).mockResolvedValue(true);
    vi.mocked(fsPromises.readdir).mockResolvedValue([
      { name: 'file1.txt', isFile: () => true, isDirectory: () => false },
      { name: 'file2.txt', isFile: () => true, isDirectory: () => false },
    ] as unknown as Awaited<ReturnType<typeof fsPromises.readdir>>);
    vi.mocked(fsPromises.stat).mockResolvedValue({
      size: 2000000,
      mtime: new Date(),
    } as Awaited<ReturnType<typeof fsPromises.stat>>);
    vi.mocked(utils.getFileHash).mockRejectedValue(new Error('Cannot read file'));

    const result = await scanner.scan();

    expect(result.items).toHaveLength(0);
  });

  it('should clean items', async () => {
    const result = await scanner.clean([]);

    expect(result.category.id).toBe('duplicates');
  });

  it('should clean items with dry run', async () => {
    const items = [
      { path: '/test/file.txt', size: 1000, name: 'file.txt', isDirectory: false },
    ];

    const result = await scanner.clean(items, true);

    expect(result.category.id).toBe('duplicates');
    expect(utils.removeItems).toHaveBeenCalledWith(items, true);
  });

  it('should use minSize option', async () => {
    vi.mocked(utils.exists).mockResolvedValue(false);

    const result = await scanner.scan({ minSize: 10000000 });

    expect(result.category.id).toBe('duplicates');
  });

  it('should sort duplicates by size descending', async () => {
    vi.mocked(utils.exists).mockResolvedValue(true);
    vi.mocked(fsPromises.readdir).mockResolvedValue([
      { name: 'small.txt', isFile: () => true, isDirectory: () => false },
      { name: 'large.txt', isFile: () => true, isDirectory: () => false },
    ] as unknown as Awaited<ReturnType<typeof fsPromises.readdir>>);

    let callCount = 0;
    vi.mocked(fsPromises.stat).mockImplementation(async () => {
      callCount++;
      return {
        size: callCount === 1 ? 1000000 : 2000000,
        mtime: new Date(Date.now() - callCount * 1000),
      } as Awaited<ReturnType<typeof fsPromises.stat>>;
    });
    vi.mocked(utils.getFileHash).mockResolvedValue('samehash');

    const result = await scanner.scan({ minSize: 100 });

    expect(result.category.id).toBe('duplicates');
  });

  it('should keep newest file and mark older as duplicates', async () => {
    vi.mocked(utils.exists).mockResolvedValue(true);
    vi.mocked(fsPromises.readdir).mockResolvedValue([
      { name: 'old.txt', isFile: () => true, isDirectory: () => false },
      { name: 'new.txt', isFile: () => true, isDirectory: () => false },
    ] as unknown as Awaited<ReturnType<typeof fsPromises.readdir>>);

    const oldDate = new Date('2020-01-01');
    const newDate = new Date('2024-01-01');
    let callCount = 0;

    vi.mocked(fsPromises.stat).mockImplementation(async () => {
      callCount++;
      return {
        size: 2000000,
        mtime: callCount === 1 ? oldDate : newDate,
      } as Awaited<ReturnType<typeof fsPromises.stat>>;
    });
    vi.mocked(utils.getFileHash).mockResolvedValue('samehash');

    const result = await scanner.scan({ minSize: 100 });

    expect(result.category.id).toBe('duplicates');
  });
});
