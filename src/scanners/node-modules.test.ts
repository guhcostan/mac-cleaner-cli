import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { NodeModulesScanner } from './node-modules.js';
import * as fsUtils from '../utils/fs.js';

vi.mock('../utils/fs.js', () => ({
  exists: vi.fn(),
  getSize: vi.fn(),
  removeItems: vi.fn().mockResolvedValue({ deleted: 0, freedSpace: 0, errors: [] }),
}));

describe('NodeModulesScanner', () => {
  const scanner = new NodeModulesScanner();
  const testDir = join(tmpdir(), 'clean-my-mac-node-modules-test');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(testDir, { recursive: true, force: true });
  });

  it('should have correct category', () => {
    expect(scanner.category.id).toBe('node-modules');
    expect(scanner.category.name).toBe('Node Modules');
    expect(scanner.category.group).toBe('Development');
    expect(scanner.category.safetyLevel).toBe('moderate');
  });

  it('should return empty results when no search paths exist', async () => {
    vi.mocked(fsUtils.exists).mockResolvedValue(false);

    const result = await scanner.scan();

    expect(result.items).toHaveLength(0);
    expect(result.totalSize).toBe(0);
  });

  it('should have clean method', async () => {
    const result = await scanner.clean([]);
    expect(result.category.id).toBe('node-modules');
  });

  it('should scan existing directories', async () => {
    vi.mocked(fsUtils.exists).mockResolvedValue(true);
    vi.mocked(fsUtils.getSize).mockResolvedValue(1000);

    const result = await scanner.scan();

    expect(fsUtils.exists).toHaveBeenCalled();
  });

  it('should clean items successfully', async () => {
    const items = [
      { path: '/test/node_modules', size: 1000, name: 'test-project', isDirectory: true },
    ];

    const result = await scanner.clean(items);

    expect(result.category.id).toBe('node-modules');
    expect(fsUtils.removeItems).toHaveBeenCalledWith(items, false);
  });

  it('should support dry run mode', async () => {
    const items = [
      { path: '/test/node_modules', size: 1000, name: 'test-project', isDirectory: true },
    ];

    const result = await scanner.clean(items, true);

    expect(fsUtils.removeItems).toHaveBeenCalledWith(items, true);
  });
});
