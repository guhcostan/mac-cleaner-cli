import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { DuplicatesScanner } from './duplicates.js';
import * as fsUtils from '../utils/fs.js';

vi.mock('../utils/fs.js', () => ({
  exists: vi.fn(),
  getFileHash: vi.fn(),
}));

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
});

