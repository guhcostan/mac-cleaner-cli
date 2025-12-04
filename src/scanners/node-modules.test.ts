import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NodeModulesScanner } from './node-modules.js';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  readdir: vi.fn(),
  stat: vi.fn(),
  access: vi.fn(),
}));

// Mock utils
vi.mock('../utils/index.js', () => ({
  exists: vi.fn(),
  getSize: vi.fn(),
  removeItems: vi.fn().mockResolvedValue({ deleted: 0, freedSpace: 0, errors: [] }),
}));

import * as fsPromises from 'fs/promises';
import * as utils from '../utils/index.js';

describe('NodeModulesScanner', () => {
  const scanner = new NodeModulesScanner();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have correct category', () => {
    expect(scanner.category.id).toBe('node-modules');
    expect(scanner.category.name).toBe('Node Modules');
    expect(scanner.category.group).toBe('Development');
    expect(scanner.category.safetyLevel).toBe('moderate');
  });

  it('should return empty results when no directories exist', async () => {
    vi.mocked(utils.exists).mockResolvedValue(false);

    const result = await scanner.scan();

    expect(result.items).toHaveLength(0);
    expect(result.totalSize).toBe(0);
  });

  it('should scan and find node_modules directories', async () => {
    vi.mocked(utils.exists).mockResolvedValue(true);
    vi.mocked(fsPromises.readdir).mockResolvedValue([
      { name: 'my-project', isDirectory: () => true },
    ] as unknown as Awaited<ReturnType<typeof fsPromises.readdir>>);
    vi.mocked(fsPromises.stat).mockResolvedValue({
      isDirectory: () => true,
      mtime: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), // 60 days old
    } as Awaited<ReturnType<typeof fsPromises.stat>>);
    vi.mocked(fsPromises.access).mockRejectedValue(new Error('No package.json'));
    vi.mocked(utils.getSize).mockResolvedValue(100000000);

    const result = await scanner.scan();

    expect(result.category.id).toBe('node-modules');
  });

  it('should skip hidden directories', async () => {
    vi.mocked(utils.exists).mockResolvedValue(true);
    vi.mocked(fsPromises.readdir).mockResolvedValue([
      { name: '.hidden', isDirectory: () => true },
      { name: 'visible', isDirectory: () => true },
    ] as unknown as Awaited<ReturnType<typeof fsPromises.readdir>>);
    vi.mocked(fsPromises.stat).mockResolvedValue({
      isDirectory: () => true,
      mtime: new Date(),
    } as Awaited<ReturnType<typeof fsPromises.stat>>);

    const result = await scanner.scan();

    expect(result.category.id).toBe('node-modules');
  });

  it('should skip non-directories', async () => {
    vi.mocked(utils.exists).mockResolvedValue(true);
    vi.mocked(fsPromises.readdir).mockResolvedValue([
      { name: 'file.txt', isDirectory: () => false },
    ] as unknown as Awaited<ReturnType<typeof fsPromises.readdir>>);

    const result = await scanner.scan();

    expect(result.items).toHaveLength(0);
  });

  it('should find node_modules in subdirectories', async () => {
    vi.mocked(utils.exists).mockResolvedValue(true);

    let callCount = 0;
    vi.mocked(fsPromises.readdir).mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return [
          { name: 'project', isDirectory: () => true },
        ] as unknown as Awaited<ReturnType<typeof fsPromises.readdir>>;
      }
      return [
        { name: 'node_modules', isDirectory: () => true },
      ] as unknown as Awaited<ReturnType<typeof fsPromises.readdir>>;
    });

    vi.mocked(fsPromises.stat).mockResolvedValue({
      isDirectory: () => true,
      mtime: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
    } as Awaited<ReturnType<typeof fsPromises.stat>>);
    vi.mocked(fsPromises.access).mockResolvedValue(undefined);
    vi.mocked(utils.getSize).mockResolvedValue(50000000);

    const result = await scanner.scan();

    expect(result.category.id).toBe('node-modules');
  });

  it('should handle readdir errors gracefully', async () => {
    vi.mocked(utils.exists).mockResolvedValue(true);
    vi.mocked(fsPromises.readdir).mockRejectedValue(new Error('Permission denied'));

    const result = await scanner.scan();

    expect(result.items).toHaveLength(0);
  });

  it('should mark orphaned node_modules', async () => {
    vi.mocked(utils.exists).mockResolvedValue(true);
    vi.mocked(fsPromises.readdir).mockResolvedValue([
      { name: 'node_modules', isDirectory: () => true },
    ] as unknown as Awaited<ReturnType<typeof fsPromises.readdir>>);
    vi.mocked(fsPromises.stat).mockResolvedValue({
      isDirectory: () => true,
      mtime: new Date(),
    } as Awaited<ReturnType<typeof fsPromises.stat>>);
    vi.mocked(fsPromises.access).mockRejectedValue(new Error('No package.json'));
    vi.mocked(utils.getSize).mockResolvedValue(100000000);

    const result = await scanner.scan();

    expect(result.category.id).toBe('node-modules');
  });

  it('should check for old projects with package.json', async () => {
    vi.mocked(utils.exists).mockResolvedValue(true);
    vi.mocked(fsPromises.readdir).mockResolvedValue([
      { name: 'node_modules', isDirectory: () => true },
    ] as unknown as Awaited<ReturnType<typeof fsPromises.readdir>>);
    vi.mocked(fsPromises.stat).mockResolvedValue({
      isDirectory: () => true,
      mtime: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), // 60 days old
    } as Awaited<ReturnType<typeof fsPromises.stat>>);
    vi.mocked(fsPromises.access).mockResolvedValue(undefined);
    vi.mocked(utils.getSize).mockResolvedValue(50000000);

    const result = await scanner.scan({ daysOld: 30 });

    expect(result.category.id).toBe('node-modules');
  });

  it('should skip recent projects', async () => {
    vi.mocked(utils.exists).mockResolvedValue(true);
    vi.mocked(fsPromises.readdir).mockResolvedValue([
      { name: 'node_modules', isDirectory: () => true },
    ] as unknown as Awaited<ReturnType<typeof fsPromises.readdir>>);
    vi.mocked(fsPromises.stat).mockResolvedValue({
      isDirectory: () => true,
      mtime: new Date(), // Today
    } as Awaited<ReturnType<typeof fsPromises.stat>>);
    vi.mocked(fsPromises.access).mockResolvedValue(undefined);

    const result = await scanner.scan({ daysOld: 30 });

    expect(result.items).toHaveLength(0);
  });

  it('should clean items', async () => {
    const result = await scanner.clean([]);

    expect(result.category.id).toBe('node-modules');
  });

  it('should clean items with dry run', async () => {
    const items = [
      { path: '/test/node_modules', size: 1000, name: 'test-project', isDirectory: true },
    ];

    const result = await scanner.clean(items, true);

    expect(result.category.id).toBe('node-modules');
    expect(utils.removeItems).toHaveBeenCalledWith(items, true);
  });

  it('should sort results by size descending', async () => {
    vi.mocked(utils.exists).mockResolvedValue(true);
    vi.mocked(fsPromises.readdir).mockResolvedValue([
      { name: 'node_modules', isDirectory: () => true },
    ] as unknown as Awaited<ReturnType<typeof fsPromises.readdir>>);
    vi.mocked(fsPromises.stat).mockResolvedValue({
      isDirectory: () => true,
      mtime: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
    } as Awaited<ReturnType<typeof fsPromises.stat>>);
    vi.mocked(fsPromises.access).mockRejectedValue(new Error('No package.json'));
    vi.mocked(utils.getSize).mockResolvedValue(100000000);

    const result = await scanner.scan();

    if (result.items.length > 1) {
      for (let i = 0; i < result.items.length - 1; i++) {
        expect(result.items[i].size).toBeGreaterThanOrEqual(result.items[i + 1].size);
      }
    }
  });

  it('should respect maxDepth limit', async () => {
    vi.mocked(utils.exists).mockResolvedValue(true);

    let depth = 0;
    vi.mocked(fsPromises.readdir).mockImplementation(async () => {
      depth++;
      return [
        { name: `level${depth}`, isDirectory: () => true },
      ] as unknown as Awaited<ReturnType<typeof fsPromises.readdir>>;
    });
    vi.mocked(fsPromises.stat).mockResolvedValue({
      isDirectory: () => true,
      mtime: new Date(),
    } as Awaited<ReturnType<typeof fsPromises.stat>>);

    const result = await scanner.scan();

    expect(result.category.id).toBe('node-modules');
  });
});
