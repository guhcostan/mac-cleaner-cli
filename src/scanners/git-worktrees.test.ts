import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, utimes, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { GitWorktreesScanner } from './git-worktrees.js';

async function makeStale(path: string, daysAgo: number): Promise<void> {
  const past = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  await utimes(path, past, past);
}

async function createLinkedWorktree(options: {
  mainRepo: string;
  worktree: string;
  name: string;
  staleDays?: number;
}): Promise<void> {
  const worktreeGitDir = join(options.mainRepo, '.git', 'worktrees', options.name);
  await mkdir(worktreeGitDir, { recursive: true });
  await mkdir(join(options.mainRepo, '.git'), { recursive: true });
  await writeFile(join(options.mainRepo, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  await writeFile(join(worktreeGitDir, 'gitdir'), `${options.worktree}/.git\n`);
  await mkdir(options.worktree, { recursive: true });
  await writeFile(join(options.worktree, '.git'), `gitdir: ${worktreeGitDir}\n`);
  await writeFile(join(options.worktree, 'README.md'), `${options.name} payload`);
  if (options.staleDays !== undefined) {
    await makeStale(options.worktree, options.staleDays);
  }
}

describe('GitWorktreesScanner', () => {
  let root: string;
  let scanner: GitWorktreesScanner;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mac-cleaner-worktrees-'));
    scanner = new GitWorktreesScanner([root]);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('should have correct category', () => {
    expect(scanner.category.id).toBe('git-worktrees');
    expect(scanner.category.name).toBe('Git Worktrees');
    expect(scanner.category.group).toBe('Development');
    expect(scanner.category.safetyLevel).toBe('risky');
    expect(scanner.category.supportsFileSelection).toBe(true);
  });

  it('should find stale linked worktrees via the main repo registry', async () => {
    const mainRepo = join(root, 'my-app');
    const worktree = join(root, 'my-app-feature');
    await createLinkedWorktree({
      mainRepo,
      worktree,
      name: 'feature',
      staleDays: 14,
    });

    const result = await scanner.scan({ daysOld: 7 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].path).toBe(worktree);
    expect(result.items[0].name).toBe('my-app/my-app-feature');
    expect(result.items[0].detail).toMatch(/ago|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|today/);
    expect(result.items[0].size).toBeGreaterThan(0);
  });

  it('should find worktrees outside the crawl root through the git registry', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'mac-cleaner-worktrees-ext-'));
    try {
      const projects = join(parent, 'projects');
      const mainRepo = join(projects, 'app');
      const external = join(parent, 'external-wt');
      await mkdir(projects, { recursive: true });
      await createLinkedWorktree({
        mainRepo,
        worktree: external,
        name: 'external',
        staleDays: 21,
      });

      const localScanner = new GitWorktreesScanner([projects]);
      const result = await localScanner.scan({ daysOld: 7 });

      expect(result.items.some((item) => item.path === external)).toBe(true);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('should find orphaned worktrees even when recent', async () => {
    const worktree = join(root, 'orphaned-wt');
    await mkdir(worktree, { recursive: true });
    await writeFile(
      join(worktree, '.git'),
      'gitdir: /tmp/definitely-missing-git-worktree-meta/abc\n'
    );
    await writeFile(join(worktree, 'keep.txt'), 'orphan payload');

    const result = await scanner.scan({ daysOld: 30 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].path).toBe(worktree);
    expect(result.items[0].detail).toBe('orphaned');
  });

  it('should ignore fresh linked worktrees', async () => {
    const mainRepo = join(root, 'fresh-app');
    const worktree = join(root, 'fresh-app-wt');
    await createLinkedWorktree({
      mainRepo,
      worktree,
      name: 'wt',
    });

    const result = await scanner.scan({ daysOld: 7 });

    expect(result.items).toHaveLength(0);
  });

  it('should ignore primary checkouts with a .git directory', async () => {
    const mainRepo = join(root, 'primary');
    await mkdir(join(mainRepo, '.git'), { recursive: true });
    await writeFile(join(mainRepo, '.git', 'HEAD'), 'ref: refs/heads/main\n');
    await writeFile(join(mainRepo, 'file.txt'), 'main checkout');
    await makeStale(mainRepo, 60);

    const result = await scanner.scan({ daysOld: 7 });

    expect(result.items).toHaveLength(0);
  });

  it('should discover nested agent worktree directories', async () => {
    const mainRepo = join(root, 'agent-app');
    const worktree = join(mainRepo, '.claude', 'worktrees', 'agent-xyz');
    await createLinkedWorktree({
      mainRepo,
      worktree,
      name: 'agent-xyz',
      staleDays: 21,
    });

    const result = await scanner.scan({ daysOld: 7 });

    expect(result.items.some((item) => item.path === worktree)).toBe(true);
  });

  it('should skip heavy directories like Library while crawling', async () => {
    const libraryTrap = join(root, 'Library', 'hidden-wt');
    await mkdir(libraryTrap, { recursive: true });
    await writeFile(
      join(libraryTrap, '.git'),
      'gitdir: /tmp/definitely-missing-git-worktree-meta/library\n'
    );
    await writeFile(join(libraryTrap, 'keep.txt'), 'should not be found');

    const result = await scanner.scan({ daysOld: 1 });

    expect(result.items.some((item) => item.path === libraryTrap)).toBe(false);
  });

  it('should find deep orphaned worktrees under allowed dot directories', async () => {
    const worktree = join(root, 'org', 'repo-host', '.worktrees', 'batch', 'deep-wt');
    await mkdir(worktree, { recursive: true });
    await writeFile(
      join(worktree, '.git'),
      'gitdir: /tmp/definitely-missing-git-worktree-meta/deep\n'
    );
    await writeFile(join(worktree, 'file.txt'), 'deep orphan');

    const result = await scanner.scan({ daysOld: 30 });

    expect(result.items.some((item) => item.path === worktree)).toBe(true);
  });

  it('should clean empty items with dry run', async () => {
    const result = await scanner.clean([], true);
    expect(result.category.id).toBe('git-worktrees');
    expect(result.cleanedItems).toBe(0);
  });
});
