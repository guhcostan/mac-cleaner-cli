import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { execFileSync } from 'child_process';
const { home } = vi.hoisted(() => ({ home: `/private/tmp/mac-cleaner-categories-${process.pid}` }));
vi.mock('os', async (original) => ({ ...await original<typeof import('os')>(), homedir: () => home }));
import { clearConfigCache } from '../utils/config.js';
import { runScans } from '../scanners/index.js';
import { scanRepoArtifacts } from './walker.js';
import { newMetrics } from './eligibility.js';
import { CATEGORIES } from '../types.js';
import { autoSelectableFilePaths } from '../pickers/selection-rules.js';
let root: string;
beforeEach(async () => { clearConfigCache(); await mkdir(home, { recursive: true }); root = await mkdtemp(join(home, 'fixture-')); });
afterEach(async () => { clearConfigCache(); await rm(home, { recursive: true, force: true }); });
const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { stdio: 'pipe' });
async function outputs(parent: string, marker: string, names: string[]) {
  await mkdir(parent, { recursive: true }); await writeFile(join(parent, marker), '{}');
  for (const name of names) { await mkdir(join(parent, name), { recursive: true }); await writeFile(join(parent, name, 'file'), 'data'); }
}
it('classifies the full Rust/Node table and omits ambiguous non-Git outputs', async () => {
  await outputs(root, 'package.json', ['node_modules', '.next', '.turbo', '.parcel-cache', 'coverage', 'dist', 'build', 'out', '.cache']);
  await outputs(root, 'Cargo.toml', ['target']);
  const ids = ['node-modules', 'node-build-artifacts', 'rust-artifacts'] as const;
  const nonGit = await runScans([...ids], { roots: [root], daysOld: 0 });
  expect(nonGit.totalItems).toBe(5);
  git('init', '-q'); await writeFile(join(root, '.gitignore'), 'coverage/\ndist/\nbuild/\nout/\n.cache/\n');
  const metrics = newMetrics();
  const results = await scanRepoArtifacts(ids.map((id) => CATEGORIES[id]), { roots: [root], daysOld: 0 }, metrics);
  expect(results.flatMap((r) => r.items)).toHaveLength(10);
  expect(metrics.candidatesInspected).toBe(10);
  expect(autoSelectableFilePaths(results, 'node-build-artifacts')).toEqual([]);
  expect(CATEGORIES['node-build-artifacts'].supportsFileSelection).toBe(true);
  git('add', '-f', 'dist/file');
  expect((await runScans([...ids], { roots: [root], daysOld: 0 })).totalItems).toBe(9);
});
it('bounds parent discovery at depth 0..4 but checks all candidate descendants', async () => {
  for (let depth = 0; depth <= 5; depth++) await outputs(join(root, ...Array(depth).fill('child')), 'Cargo.toml', ['target']);
  const result = await runScans(['rust-artifacts'], { roots: [root] });
  expect(result.totalItems).toBe(5);
  const deep = join(root, 'target', ...Array(8).fill('inside'));
  await mkdir(deep, { recursive: true }); await writeFile(join(deep, 'keep.txt'), 'keep');
  const kept = await runScans(['rust-artifacts'], { roots: [root], excludePaths: ['**/keep.txt'] });
  expect(kept.totalItems).toBe(4);
});
it('discovers hidden worktree containers, prunes dependency trees, keeps legacy roots Node-only', async () => {
  await outputs(join(root, '.claude/worktrees/project'), 'Cargo.toml', ['target']);
  await outputs(join(root, 'node_modules/embedded'), 'Cargo.toml', ['target']);
  expect((await runScans(['rust-artifacts'], { roots: [root] })).totalItems).toBe(1);
  await writeFile(join(home, '.maccleanerrc'), JSON.stringify({ extraPaths: { nodeModules: [root] } })); clearConfigCache();
  expect((await runScans(['rust-artifacts'])).totalItems).toBe(0);
});
it('shares discovery across categories and overlapping roots', async () => {
  await outputs(join(root, 'project'), 'Cargo.toml', ['target']);
  await outputs(join(root, 'project'), 'package.json', ['.next']);
  const metrics = newMetrics();
  const results = await scanRepoArtifacts([CATEGORIES['rust-artifacts'], CATEGORIES['node-build-artifacts']], { roots: [root, join(root, 'project')] }, metrics);
  expect(results.flatMap((r) => r.items)).toHaveLength(2);
  expect(metrics.candidatesInspected).toBe(2);
});

it('assigns a Node/Go dist collision once and allows explicit Go-only selection', async () => {
  await outputs(root, 'package.json', ['dist']); await outputs(root, 'go.mod', ['bin']);
  git('init', '-q'); await writeFile(join(root, '.gitignore'), 'dist/\nbin/\n');
  const both = await runScans(['go-artifacts', 'node-build-artifacts'], { roots: [root] });
  expect(both.results.find((r) => r.category.id === 'node-build-artifacts')?.items.map((i) => i.path)).toEqual([join(root, 'dist')]);
  expect(both.results.find((r) => r.category.id === 'go-artifacts')?.items.map((i) => i.path)).toEqual([join(root, 'bin')]);
  const only = await runScans(['go-artifacts'], { roots: [root] });
  expect(only.totalItems).toBe(2);
  const { getScanner } = await import('../scanners/index.js');
  expect((await getScanner('go-artifacts').clean(only.results[0].items, true)).cleanedItems).toBe(0);
  expect((await getScanner('go-artifacts').clean(only.results[0].items, true, undefined, only.results[0].context)).wouldCleanItems).toBe(2);
});

it('omits Go from defaults, opts in by include/config/category and honors exclusions', async () => {
  const { ALL_SCANNERS, runAllScans } = await import('../scanners/index.js');
  // Stub non-repository discovery so this fixture cannot scan the host.
  const spies = Object.values(ALL_SCANNERS).filter((s) => !['node-modules', 'node-build-artifacts', 'rust-artifacts', 'go-artifacts'].includes(s.category.id)).map((s) => vi.spyOn(s, 'scan').mockResolvedValue({ category: s.category, items: [], totalSize: 0 }));
  try {
    await outputs(root, 'go.mod', ['bin', 'dist']); git('init', '-q'); await writeFile(join(root, '.gitignore'), 'dist/\nbin/\n');
    expect((await runAllScans({ roots: [root] })).results.some((r) => r.category.id === 'go-artifacts')).toBe(false);
    expect((await runAllScans({ roots: [root], includeEcosystems: ['go'] })).totalItems).toBe(2);
    await writeFile(join(home, '.maccleanerrc'), JSON.stringify({ includeEcosystems: ['go'] })); clearConfigCache();
    expect((await runAllScans({ roots: [root] })).totalItems).toBe(2);
    await writeFile(join(home, '.maccleanerrc'), JSON.stringify({ excludeCategories: ['go-artifacts'] })); clearConfigCache();
    expect((await runScans(['go-artifacts'], { roots: [root] })).results[0].skipped).toBe('CATEGORY_EXCLUDED');
  } finally { spies.forEach((s) => s.mockRestore()); }
});

it('emits one lifecycle with matching candidates/warnings and returns a Promise summary', async () => {
  await outputs(root, 'Cargo.toml', ['target']);
  await outputs(join(root, 'node'), 'package.json', ['dist']);
  const events: import('../types.js').ScanEvent[] = [];
  const result = await runScans(['rust-artifacts', 'node-build-artifacts'], { roots: [root], onEvent: (event) => events.push(event) });
  expect(events.filter((e) => e.type === 'start')).toHaveLength(1);
  expect(events.filter((e) => e.type === 'done')).toHaveLength(1);
  expect(new Set(events.map((e) => e.runId)).size).toBe(1);
  expect(events.filter((e) => e.type === 'candidate')).toHaveLength(result.totalItems);
  expect(events.at(-1)).toMatchObject({ type: 'done', cancelled: false, candidates: 1, warnings: 1 });
  expect(result.results.flatMap((r) => r.warnings ?? [])).toHaveLength(1);
  expect(events.some((e) => e.type === 'progress')).toBe(true);
});
it('cancels during metadata emission without publishing a usable clean plan', async () => {
  await outputs(root, 'Cargo.toml', ['target']);
  await outputs(join(root, 'next'), 'Cargo.toml', ['target']);
  const abort = new AbortController();
  const events: import('../types.js').ScanEvent[] = [];
  const result = await runScans(['rust-artifacts'], { roots: [root], signal: abort.signal, onEvent: (event) => { events.push(event); if (event.type === 'candidate') abort.abort(); } });
  expect(result.cancelled).toBe(true);
  expect(result.totalItems).toBe(0);
  expect(result.results[0].context?.complete).toBe(false);
  expect(events.at(-1)).toMatchObject({ type: 'done', cancelled: true, candidates: 0 });
  const preAborted = await runScans(['rust-artifacts'], { roots: [root], signal: abort.signal });
  expect(preAborted.totalItems).toBe(0);
});
it('isolates candidate event observers from scan evidence and still terminates on policy errors', async () => {
  await outputs(root, 'Cargo.toml', ['target']);
  const result = await runScans(['rust-artifacts'], { roots: [root], onEvent: (event) => { if (event.type === 'candidate') event.item.path = '/forged'; } });
  expect(result.results[0].items[0].path).toBe(join(root, 'target'));
  const events: import('../types.js').ScanEvent[] = [];
  await runScans(['rust-artifacts'], { roots: [root], excludePaths: ['../bad'], onEvent: (e) => events.push(e) });
  expect(events[0].type).toBe('start');
  expect(events.at(-1)?.type).toBe('done');
  expect(events.filter((e) => e.type === 'warning')).toHaveLength(1);
});


it('supports standalone scanner calls with the same safe configuration', async () => {
  const { getScanner } = await import('../scanners/index.js');
  await outputs(root, 'Cargo.toml', ['target']); await outputs(root, 'package.json', ['.next']); await outputs(root, 'go.mod', ['bin']);
  git('init', '-q'); await writeFile(join(root, '.gitignore'), 'bin/');
  for (const category of ['rust-artifacts', 'node-build-artifacts', 'go-artifacts'] as const) {
    const events: import('../types.js').ScanEvent[] = [];
    const result = await getScanner(category).scan({ roots: [root], onEvent: (event) => events.push(event) });
    expect(result.items).toHaveLength(1); expect(events.at(-1)).toMatchObject({ type: 'done', candidates: 1 });
  }
});
