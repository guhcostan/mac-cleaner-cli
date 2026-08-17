import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { join, relative } from 'path';
import { tmpdir } from 'os';
import { walkFiles } from './walk.js';

describe('walkFiles', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'mac-cleaner-walk-test-'));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  async function collect(root: string, maxDepth: number, includeHidden?: boolean) {
    const found: string[] = [];
    await walkFiles(root, { maxDepth, includeHidden }, (filePath) => {
      found.push(relative(testDir, filePath));
    });
    return found.sort();
  }

  it('should walk nested files up to maxDepth', async () => {
    await mkdir(join(testDir, 'a', 'b'), { recursive: true });
    await writeFile(join(testDir, 'root.txt'), 'root');
    await writeFile(join(testDir, 'a', 'one.txt'), 'one');
    await writeFile(join(testDir, 'a', 'b', 'two.txt'), 'two');

    expect(await collect(testDir, 1)).toEqual(['a/one.txt', 'root.txt']);
    expect(await collect(testDir, 2)).toEqual(['a/b/two.txt', 'a/one.txt', 'root.txt']);
  });

  it('should skip hidden entries by default', async () => {
    await mkdir(join(testDir, '.hidden'), { recursive: true });
    await writeFile(join(testDir, '.secret'), 'secret');
    await writeFile(join(testDir, '.hidden', 'file.txt'), 'file');
    await writeFile(join(testDir, 'visible.txt'), 'visible');

    expect(await collect(testDir, 3)).toEqual(['visible.txt']);
    expect(await collect(testDir, 3, true)).toEqual([
      '.hidden/file.txt',
      '.secret',
      'visible.txt',
    ]);
  });

  it('should expose file stats', async () => {
    await writeFile(join(testDir, 'sized.txt'), 'abcde');

    const sizes: number[] = [];
    await walkFiles(testDir, { maxDepth: 1 }, (_path, stats) => {
      sizes.push(stats.size);
    });

    expect(sizes).toEqual([5]);
  });

  it('should ignore unreadable roots', async () => {
    await expect(collect(join(testDir, 'missing'), 2)).resolves.toEqual([]);
  });
});
