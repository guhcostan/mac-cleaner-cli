import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { chmod, mkdir, mkdtemp, rename, rm, symlink, utimes, writeFile } from 'fs/promises';
import { execFileSync } from 'child_process';
import { join } from 'path';
const { home } = vi.hoisted(() => ({ home: `/private/tmp/mac-cleaner-git-${process.pid}` }));
vi.mock('os', async (original) => ({ ...await original<typeof import('os')>(), homedir: () => home }));
import { runScans, getScanner } from '../scanners/index.js';
import { clearConfigCache } from '../utils/config.js';
import { GitBatch, newMetrics } from './eligibility.js';
let root: string;
const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' }, stdio: 'pipe' }).toString().trim();
beforeEach(async () => {
  clearConfigCache(); await mkdir(home, { recursive: true }); root = await mkdtemp(join(home, 'fixture-'));
  await writeFile(join(root, 'Cargo.toml'), ''); await mkdir(join(root, 'target')); await writeFile(join(root, 'target/file'), 'data');
});
afterEach(async () => { vi.unstubAllEnvs(); vi.restoreAllMocks(); clearConfigCache(); await rm(home, { recursive: true, force: true }); });
function init() { git('init', '-q'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.test'); git('config', 'commit.gpgsign', 'false'); git('config', 'core.hooksPath', '/dev/null'); }
const scan = () => runScans(['rust-artifacts'], { roots: [root] });
it('uses each linked worktree index, not the common Git directory', async () => {
  init(); await writeFile(join(root, '.gitignore'), 'target/\n'); git('add', 'Cargo.toml', '.gitignore'); git('commit', '-qm', 'fixture');
  const linked = join(root, 'linked'); git('worktree', 'add', '-qb', 'linked', linked);
  await mkdir(join(linked, 'target')); await writeFile(join(linked, 'target/file'), 'tracked');
  execFileSync('git', ['-C', linked, 'add', '-f', 'target/file']);
  const results = await scan();
  expect(results.results[0].items.map((i) => i.path)).toEqual([join(root, 'target')]);
  expect(results.results[0].warnings).toContainEqual({ path: join(linked, 'target'), reason: 'TRACKED_CONTENT' });
});
it('protects gitlinks even with no nested .git metadata on disk', async () => {
  init(); git('add', 'Cargo.toml'); git('commit', '-qm', 'fixture');
  const commit = git('rev-parse', 'HEAD');
  git('update-index', '--add', '--cacheinfo', `160000,${commit},target/submodule`);
  expect((await scan()).results[0].warnings).toContainEqual({ path: join(root, 'target'), reason: 'TRACKED_CONTENT' });
});
it('protects conflict stages and tracked symlink entries', async () => {
  init();
  const blob = execFileSync('git', ['-C', root, 'hash-object', '-w', '--stdin'], { input: 'conflict' }).toString().trim();
  execFileSync('git', ['-C', root, 'update-index', '-z', '--index-info'], { input: `100644 ${blob} 1\ttarget/conflict\0` });
  expect((await scan()).totalItems).toBe(0);
  git('update-index', '--force-remove', 'target/conflict');
  await symlink('/unfollowed', join(root, 'target/link')); git('add', 'target/link');
  expect((await scan()).totalItems).toBe(0);
});
it('fails closed when Git is missing, HEAD is broken or .git is invalid', async () => {
  init();
  vi.stubEnv('PATH', '');
  expect((await scan()).results[0].warnings).toContainEqual({ path: join(root, 'target'), reason: 'GIT_UNKNOWN' });
  vi.unstubAllEnvs();
  await writeFile(join(root, '.git/HEAD'), 'broken\n');
  expect((await scan()).totalItems).toBe(0);
  await rm(join(root, '.git'), { recursive: true }); await writeFile(join(root, '.git'), 'gitdir: /missing');
  expect((await scan()).results[0].error).toBeDefined();
});
it('counts Git queries per worktree batch regardless of candidate count', async () => {
  init();
  const metrics = newMetrics();
  const batch = new GitBatch(metrics);
  const paths = Array.from({ length: 50 }, (_, i) => ({ path: join(root, `candidate-${i}`), ignored: false }));
  expect((await batch.check(paths)).size).toBe(0);
  expect(metrics.gitProcesses).toBe(5);
});
it('vetoes unreadable descendants and reports partial root failures', async () => {
  const blocked = join(root, 'target/blocked'); await mkdir(blocked); await chmod(blocked, 0);
  try {
    const result = await scan(); expect(result.totalItems).toBe(0); expect(result.results[0].error).toBeDefined();
  } finally { await chmod(blocked, 0o700); }
});
it('rechecks marker identity and configured exclusions after preview', async () => {
  const result = await scan();
  await rename(join(root, 'Cargo.toml'), join(root, 'old-marker')); await writeFile(join(root, 'Cargo.toml'), 'replacement');
  // Keep replacement inode distinct even on filesystems that quickly reuse inodes.
  const changed = await getScanner('rust-artifacts').clean(result.results[0].items, true, undefined, result.results[0].context);
  expect(changed.outcomes?.[0].reason).toBe('MARKER_CHANGED');
});
it('accepts the exact Node age boundary and rejects one millisecond of newer activity', async () => {
  const path = join(root, 'node_modules'); await mkdir(path); await writeFile(join(root, 'package.json'), '{}'); await writeFile(join(path, 'file'), 'data');
  const now = Math.floor(Date.now() / 1000) * 1000; const boundary = new Date(now - 30 * 86400000);
  await utimes(join(path, 'file'), boundary, boundary); await utimes(path, boundary, boundary); await utimes(root, boundary, boundary);
  vi.spyOn(Date, 'now').mockReturnValue(now);
  expect((await getScanner('node-modules').scan({ roots: [root] })).items).toHaveLength(1);
  const recent = new Date(boundary.getTime() + 2); await utimes(join(path, 'file'), recent, recent);
  expect((await getScanner('node-modules').scan({ roots: [root] })).items).toHaveLength(0);
});
