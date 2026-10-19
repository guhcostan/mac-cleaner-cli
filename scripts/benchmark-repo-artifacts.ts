// Bun-only benchmark: isolated temporary HOME via module mock, never user data.
import { mock } from 'bun:test';
import * as os from 'os';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { execFileSync } from 'child_process';
const fixtureHome = await mkdtemp('/private/tmp/mac-cleaner-bench-');
mock.module('os', () => ({ ...os, homedir: () => fixtureHome }));
const { CATEGORIES } = await import('../src/types.js');
const { scanRepoArtifacts } = await import('../src/repo-artifacts/walker.js');
const { newMetrics, validateSelected } = await import('../src/repo-artifacts/eligibility.js');
const ids = ['node-build-artifacts', 'rust-artifacts'] as const;
const records = [];
const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
try {
  for (const [name, projects, files, worktrees] of [['small', 10, 20, 1], ['medium', 100, 50, 5], ['large', 500, 100, 25]] as const) {
    const root = join(fixtureHome, name);
    await mkdir(root);
    for (let w = 0; w < worktrees; w++) {
      const worktree = join(root, `repo-${w}`); await mkdir(worktree);
      execFileSync('git', ['-C', worktree, 'init', '-q'], { env });
      await writeFile(join(worktree, '.gitignore'), 'dist/\n.next/\ntarget/\n');
    }
    for (let p = 0; p < projects; p++) {
      const project = join(root, `repo-${p % worktrees}`, `project-${p}`); await mkdir(project);
      await writeFile(join(project, 'package.json'), '{}'); await writeFile(join(project, 'Cargo.toml'), '');
      for (const artifact of ['.next', 'dist', 'target']) {
        const path = join(project, artifact); await mkdir(path);
        await Promise.all(Array.from({ length: files }, (_, i) => writeFile(join(path, `${i}.bin`), Buffer.alloc(128))));
      }
    }
    for (const overlap of [false, true]) {
      const metrics = newMetrics();
      let peakRss = process.memoryUsage().rss;
      const sample = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, 5);
      const started = performance.now();
      const results = await scanRepoArtifacts(ids.map((id) => CATEGORIES[id]), { roots: overlap ? [root, join(root, 'repo-0')] : [root] }, metrics);
      const wallMilliseconds = performance.now() - started;
      clearInterval(sample); peakRss = Math.max(peakRss, process.memoryUsage().rss);
      if (results.some((r) => r.error) || results.reduce((n, r) => n + r.items.length, 0) !== projects * 3) throw new Error('Benchmark eligibility mismatch');
      const cleanMetrics = newMetrics();
      const refreshStart = performance.now();
      for (const result of results) {
        const validated = await validateSelected(result.items, result.category.id as typeof ids[number], result.context, cleanMetrics);
        if (validated.rejected.length) throw new Error('Benchmark validation rejected');
      }
      const refreshMilliseconds = performance.now() - refreshStart;
      records.push({ name, projects, filesPerArtifact: files, worktrees, overlap, candidates: projects * 3, wallMilliseconds, peakRssBytes: peakRss, ...metrics, selectedValidation: { wallMilliseconds: refreshMilliseconds, ...cleanMetrics } });
      console.error(`${name} overlap=${overlap}: ${wallMilliseconds.toFixed(1)} ms; ${metrics.gitProcesses} Git processes; ${metrics.candidatesInspected} candidates`);
    }
    await rm(root, { recursive: true, force: true });
  }
  const document = { measuredAt: new Date().toISOString(), runtime: `Bun ${Bun.version}`, platform: `${os.platform()} ${os.arch()}`, method: 'Single sample per size/order; fixture creation excluded; no cleanup mutation; scan then selected validation; peak RSS sampled every 5ms includes process baseline. Files are logical 128-byte fixtures, not representative storage throughput. Overlap scans follow non-overlap scans, so cache/order effects remain.', records };
  await writeFile('docs/plans/repo-artifact-cleanup/performance.json', JSON.stringify(document, null, 2) + '\n');
} finally { await rm(fixtureHome, { recursive: true, force: true }); }
