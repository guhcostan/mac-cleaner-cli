import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chmod, link, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, utimes, writeFile } from 'fs/promises';
import { join } from 'path';
import { execFileSync } from 'child_process';
const { home } = vi.hoisted(() => ({ home: `/private/tmp/mac-cleaner-repo-${process.pid}` }));
vi.mock('os', async (original) => ({ ...await original<typeof import('os')>(), homedir: () => home }));
import { NodeModulesScanner } from '../scanners/node-modules.js';
import { clearConfigCache, initConfig } from '../utils/config.js';
import { cleanSelectedResults, scanTotals } from '../utils/cleanup.js';
import { BaseScanner } from '../scanners/base-scanner.js';
import { CATEGORIES } from '../types.js';
import { restoreBackup, getBackupDir } from '../utils/backup.js';
import { matchesExclude, validatePatterns } from './eligibility.js';

let root: string;
const scanner = new NodeModulesScanner();
const old = new Date(Date.now() - 40 * 86400000);
const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' }, stdio: 'pipe' });
async function artifact(name = 'project') {
  const project = join(root, name);
  const path = join(project, 'node_modules');
  await mkdir(path, { recursive: true });
  await writeFile(join(project, 'package.json'), '{}');
  await writeFile(join(path, 'file'), 'hello');
  await age(project, path, join(path, 'file'));
  return path;
}
async function age(...paths: string[]) { for (const path of paths) await utimes(path, old, old); }
const scan = (extra = {}) => scanner.scan({ roots: [root], ...extra });
beforeEach(async () => { clearConfigCache(); await mkdir(home, { recursive: true }); root = await mkdtemp(join(home, 'fixture-')); });
afterEach(async () => { clearConfigCache(); await rm(home, { recursive: true, force: true }); });

describe('repository safety fixtures', () => {
  it('requires immediate readable regular non-symlink markers; never accepts orphans', async () => {
    const path = await artifact();
    await rm(join(root, 'project/package.json'));
    await writeFile(join(root, 'package.json'), '{}');
    expect((await scan()).items).toEqual([]);
    await symlink(join(root, 'package.json'), join(root, 'project/package.json'));
    expect((await scan()).items).toEqual([]);
    await rm(join(root, 'project/package.json'));
    await mkdir(join(root, 'project/package.json'));
    expect((await scan()).items).toEqual([]);
    await rm(join(root, 'project/package.json'), { recursive: true });
    await writeFile(join(root, 'project/package.json'), '{}');
    await chmod(join(root, 'project/package.json'), 0);
    expect((await scan()).items).toEqual([]);
    await chmod(join(root, 'project/package.json'), 0o600);
    await age(join(root, 'project'), path);
    expect((await scan()).items).toHaveLength(1);
  });
  it('measures logical file/link bytes, hardlinks, directories and newest entry', async () => {
    const path = await artifact();
    await link(join(path, 'file'), join(path, 'hard'));
    await symlink('/nonexistent/external', join(path, 'link'));
    await mkdir(join(path, 'empty'));
    expect((await scan()).items).toHaveLength(0);
    const result = await scan({ daysOld: 0 });
    expect(result.items[0].size).toBe(10 + (await lstat(join(path, 'link'))).size);
    expect(result.items[0].fileCount).toBe(2);
    expect(result.items[0].newestEntryModifiedAt!.getTime()).toBeGreaterThan(old.getTime());
    expect(Object.isFrozen(result.context?.evidence)).toBe(true);
    expect((await scan({ daysOld: 0 })).items[0].id).toBe(result.items[0].id);
  });
  it('protects excluded descendants, overlapping roots and nested .git files', async () => {
    const path = await artifact();
    expect((await scan({ excludePaths: ['**/file'] })).items).toEqual([]);
    expect((await scan({ roots: [join(root, 'project'), root], excludePaths: ['project/node_modules/file'] })).items).toEqual([]);
    await writeFile(join(path, '.git'), 'gitdir: /missing');
    expect((await scan({ daysOld: 0 })).warnings).toContainEqual({ path, reason: 'NESTED_REPOSITORY' });
  });
  it('protects index and HEAD union including staged removals and newline paths', async () => {
    const path = await artifact();
    git('init', '-q');
    git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.test');
    const tracked = join(path, 'tab\tline\nfile');
    await writeFile(tracked, 'tracked');
    git('add', '.'); git('commit', '-qm', 'fixture');
    git('rm', '--cached', tracked);
    await writeFile(join(root, '.gitignore'), 'node_modules/\n');
    expect((await scan({ daysOld: 0 })).warnings).toContainEqual({ path, reason: 'TRACKED_CONTENT' });
  });
  it('handles unborn index and refuses a broken detected repository', async () => {
    const path = await artifact();
    git('init', '-q');
    expect((await scan()).items).toHaveLength(1);
    git('add', 'project/node_modules/file');
    expect((await scan()).items).toHaveLength(0);
    await writeFile(join(root, '.git/index'), 'broken');
    expect((await scan()).warnings).toContainEqual({ path, reason: 'GIT_UNKNOWN' });
  });
  it('refreshes tracked protection at clean, validates selected identities and marker removal', async () => {
    const path = await artifact();
    git('init', '-q');
    const result = await scan();
    git('add', 'project/node_modules/file');
    expect((await scanner.clean(result.items, true, undefined, result.context)).errors.join()).toContain('TRACKED_CONTENT');
    git('rm', '--cached', 'project/node_modules/file');
    await rename(path, path + '-old');
    await mkdir(path); await age(path, join(root, 'project'));
    for (const dryRun of [true, false]) expect((await scanner.clean(result.items, dryRun, undefined, result.context)).errors.join()).toContain('REPLACED');
    await rm(path, { recursive: true }); await rename(path + '-old', path);
    await rm(join(root, 'project/package.json'));
    expect((await scanner.clean(result.items, true, undefined, result.context)).errors.join()).toContain('MARKER_MISSING');
  });
  it('rejects parent symlink swaps, forged paths, absent context and newly recent children', async () => {
    const path = await artifact();
    const result = await scan();
    expect((await scanner.clean(result.items, true)).errors.join()).toContain('MISSING_CONTEXT');
    expect((await scanner.clean([{ ...result.items[0], path: join(path, 'file') }], true, undefined, result.context)).errors.join()).toContain('MISSING_CONTEXT');
    await writeFile(join(path, 'file'), 'recent');
    expect((await scanner.clean(result.items, true, undefined, result.context)).errors.join()).toContain('RECENT_ACTIVITY');
    await rename(join(root, 'project'), join(root, 'original'));
    await symlink(join(root, 'original'), join(root, 'project'));
    expect((await scanner.clean(result.items, true, undefined, result.context)).errors.join()).toContain('SYMLINK_ANCESTOR');
  });
  it('removes only an unchanged selected candidate', async () => {
    const first = await artifact('a'); await artifact('b');
    const result = await scan();
    const clean = await scanner.clean(result.items.filter((i) => i.path === first), false, undefined, result.context);
    expect(clean.cleanedItems).toBe(1);
    await expect(lstat(first)).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await scan()).items).toHaveLength(1);
  });
});

describe('keep pattern grammar', () => {
  it('uses component prefixes and zero-or-more globstar segments', () => {
    expect(matchesExclude('**/target', 'target')).toBe(true);
    expect(matchesExclude('**/target', 'a/b/target/file')).toBe(true);
    expect(matchesExclude('docs/build', 'docs/building')).toBe(false);
    expect(matchesExclude('a/*/b?.txt', 'a/x/b1.txt')).toBe(true);
    for (const pattern of ['', '/abs', '../x', 'a/../b', '!keep', '{a,b}', '[x]', 'x**', 'a//b']) expect(() => validatePatterns([pattern])).toThrow();
  });
});


describe('request policy and execution', () => {
  it('appends config roots, keeps defaults after init, and overrides roots explicitly', async () => {
    await artifact();
    await initConfig();
    const dev = join(home, 'dev');
    await mkdir(dev);
    const defaultRoot = root;
    root = dev;
    await artifact('default');
    root = defaultRoot;
    expect((await scanner.scan()).items).toHaveLength(1);
    await writeFile(join(home, '.maccleanerrc'), JSON.stringify({ extraPaths: { projects: [root] } }));
    clearConfigCache();
    expect((await scanner.scan()).items).toHaveLength(2);
    expect((await scan()).items).toHaveLength(1);
    const invalid = await scanner.scan({ roots: [home] });
    expect(invalid.error).toBe('INVALID_ROOT');
  });
  it('rechecks config exclusions and fails closed for malformed config', async () => {
    await artifact();
    const result = await scan();
    await writeFile(join(home, '.maccleanerrc'), JSON.stringify({ excludePaths: ['**/file'] }));
    expect((await scanner.clean(result.items, true, undefined, result.context)).outcomes?.[0].reason).toBe('EXCLUDED_CONTENT');
    await writeFile(join(home, '.maccleanerrc'), '{bad');
    expect((await scanner.clean(result.items, true, undefined, result.context)).errors.join()).toContain('INVALID_CONFIG');
    clearConfigCache();
    expect((await scan()).items).toEqual([]);
  });
  it('isolates concurrent root/exclusion contexts and does not clean new discoveries', async () => {
    await artifact('one'); await artifact('two');
    const [one, two] = await Promise.all([scan({ roots: [join(root, 'one')] }), scan({ roots: [join(root, 'two')], excludePaths: ['keep'] })]);
    await artifact('new');
    const cleaned = await scanner.clean(one.items, false, undefined, one.context);
    expect(cleaned.cleanedItems).toBe(1);
    expect((await scanner.clean(two.items, true, undefined, two.context)).wouldCleanItems).toBe(1);
    expect((await scan()).items).toHaveLength(2);
  });
  it('dry-run and real mode reject missing/protected/unsupported backup paths alike', async () => {
    class Files extends BaseScanner { category = CATEGORIES.trash; async scan() { return this.createResult([]); } }
    const files = new Files();
    const outside = await mkdtemp('/private/tmp/mac-cleaner-external-');
    try {
      await writeFile(join(outside, 'file'), 'data');
      const items = ['/System/test', join(root, 'missing'), join(outside, 'file')].map((path) => ({ path, size: 4, name: path, isDirectory: false }));
      for (const dry of [true, false]) {
        const result = await files.clean(items, dry, join(root, 'backup'));
        expect(result.outcomes?.map((o) => o.reason)).toEqual(['PROTECTED', 'ENOENT', 'BACKUP_UNSUPPORTED_PATH']);
        expect(result.cleanedItems).toBe(0);
      }
      expect(await readFile(join(outside, 'file'), 'utf8')).toBe('data');
    } finally { await rm(outside, { recursive: true, force: true }); }
  });
  it('simulates backup without mutations and preserves restore mapping', async () => {
    const path = await artifact();
    const result = await scan();
    const backup = join(getBackupDir(), 'fixture-session');
    const before = await readdir(root);
    const simulated = await scanner.clean(result.items, true, backup, result.context);
    expect(simulated).toMatchObject({ cleanedItems: 0, freedSpace: 0, backedUpSize: 0, wouldBackUpSize: 5 });
    expect(await readdir(root)).toEqual(before);
    expect((await scanner.clean(result.items, false, backup, result.context)).backedUpSize).toBe(5);
    expect((await restoreBackup(backup)).success).toBeGreaterThan(0);
    expect(await readFile(join(path, 'file'), 'utf8')).toBe('hello');
  });
  it('deduplicates only validated selected ancestors; rejected parent does not suppress child', async () => {
    class Files extends BaseScanner { category = CATEGORIES['git-worktrees']; async scan() { return this.createResult([]); } }
    const files = new Files();
    const path = await artifact();
    const child = await scan();
    const parentItem = { path: join(root, 'project'), size: 7, name: 'parent', isDirectory: true };
    const parent = { category: files.category, items: [parentItem], totalSize: 7 };
    const lookup = (id: string) => id === 'node-modules' ? scanner : files;
    expect(scanTotals([child, parent])).toEqual({ totalSize: 7, totalItems: 1 });
    const both = await cleanSelectedResults([child, parent], lookup, { dryRun: true });
    expect(both.wouldCleanItems).toBe(1);
    expect(both.results[0].outcomes?.[0].reason).toBe('SKIPPED_COVERED_BY_PARENT');
    expect((await cleanSelectedResults([child], lookup, { dryRun: true })).wouldCleanItems).toBe(1);
    const invalid = { ...parent, items: [{ ...parentItem, isDirectory: false }] };
    const independent = await cleanSelectedResults([invalid, child], lookup, { dryRun: true });
    expect(independent.wouldCleanItems).toBe(1);
    expect(independent.results[1].outcomes?.[0].path).toBe(path);
  });
});


it('canonicalizes overlapping total estimates while preserving scan rows', async () => {
  const path = await artifact();
  const alias = join(root, 'alias'); await symlink(join(root, 'project'), alias);
  const result = await scan();
  const duplicate = { ...result, items: [{ ...result.items[0], path: join(alias, 'node_modules') }] };
  expect(scanTotals([result, duplicate])).toEqual({ totalSize: 5, totalItems: 1 });
  expect(result.items[0].path).toBe(path); expect(duplicate.items[0].path).toBe(join(alias, 'node_modules'));
});

it('rejects a rebound root and a newly restrictive discovery depth', async () => {
  await artifact();
  const alias = join(home, 'root-alias'); await symlink(root, alias);
  const result = await scan({ roots: [alias] });
  const other = join(home, 'other'); await mkdir(other);
  await rm(alias); await symlink(other, alias);
  expect((await scanner.clean(result.items, true, undefined, result.context)).cleanedItems).toBe(0);
  const original = await scan();
  await writeFile(join(home, '.maccleanerrc'), JSON.stringify({ projectScanMaxDepth: 0 }));
  expect((await scanner.clean(original.items, true, undefined, original.context)).outcomes?.[0].reason).toBe('OUT_OF_ROOT');
});


it('rejects malformed direct-caller root and exclusion types instead of broadening defaults', async () => {
  await artifact();
  expect((await scan({ roots: '' as unknown as string[] })).error).toBe('INVALID_ROOTS');
  expect((await scan({ excludePaths: 'keep' as unknown as string[] })).error).toBe('INVALID_EXCLUSIONS');
});


it('reports a missing selected repository candidate consistently in dry-run and mutation', async () => {
  const path = await artifact(); const result = await scan(); await rm(path, { recursive: true });
  for (const dryRun of [true, false]) {
    const clean = await scanner.clean(result.items, dryRun, undefined, result.context);
    expect(clean.outcomes?.[0]).toMatchObject({ status: 'rejected', reason: 'MISSING' });
  }
});

it.each([false, true])('applies current keep patterns from a newly applicable root (retain original: %s)', async (retainOriginal) => {
  const path = await artifact();
  const project = join(root, 'project');
  await writeFile(join(home, '.maccleanerrc'), JSON.stringify({ extraPaths: { projects: [project] } }));
  const result = await scanner.scan();
  expect(result.items).toHaveLength(1);
  await writeFile(join(home, '.maccleanerrc'), JSON.stringify({ extraPaths: { projects: retainOriginal ? [project, root] : [root] }, excludePaths: ['project/node_modules/file'] }));
  for (const dryRun of [true, false]) {
    const clean = await scanner.clean(result.items, dryRun, undefined, result.context);
    expect(clean.outcomes?.[0]).toMatchObject({ status: 'rejected', reason: 'EXCLUDED_CONTENT' });
  }
  expect(await readFile(join(path, 'file'), 'utf8')).toBe('hello');
});

it('enforces the current depth budget relative to a changed configured root', async () => {
  await artifact();
  await writeFile(join(home, '.maccleanerrc'), JSON.stringify({ extraPaths: { projects: [join(root, 'project')] }, projectScanMaxDepth: 0 }));
  const result = await scanner.scan();
  expect(result.items).toHaveLength(1);
  await writeFile(join(home, '.maccleanerrc'), JSON.stringify({ extraPaths: { projects: [root] }, projectScanMaxDepth: 0 }));
  const clean = await scanner.clean(result.items, true, undefined, result.context);
  expect(clean.outcomes?.[0]).toMatchObject({ status: 'rejected', reason: 'OUT_OF_ROOT' });
});
