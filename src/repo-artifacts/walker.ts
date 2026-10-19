import { createHash, randomUUID } from 'crypto';
import { lstat, readdir } from 'fs/promises';
import { basename, dirname, join } from 'path';
import type { CleanableItem, RepoCategoryId, RepoPolicy, ScanResult, ScannerOptions, Category, ScanEvent } from '../types.js';
import { classify, type ArtifactRule } from './rules.js';
import { checkIdentity, contains, EligibilityError, excluded, freezeContext, GitBatch, newMetrics, normalizePolicy, reasonOf, type RepoMetrics } from './eligibility.js';

function checkAbort(signal?: AbortSignal): void { if (signal?.aborted) throw new EligibilityError('CANCELLED'); }
/** Observer failures cannot alter scanner authorization or lose the terminal event. */
export function emitEvent(options: ScannerOptions, event: ScanEvent): void {
  try { options.onEvent?.(event.type === 'candidate' ? { ...event, item: { ...event.item, artifact: event.item.artifact ? { ...event.item.artifact } : undefined } } : event); } catch { /* An observer does not control eligibility. */ }
}

export async function inspectTree(path: string, policy: RepoPolicy, metrics?: RepoMetrics, signal?: AbortSignal): Promise<{ size: number; fileCount: number; newestEntryModifiedAt: Date }> {
  const started = performance.now();
  let size = 0;
  let fileCount = 0;
  let newest = 0;
  const pending = [path];
  while (pending.length) {
    checkAbort(signal);
    const current = pending.pop()!;
    if (metrics) metrics.entriesInspected++;
    if (excluded(current, policy)) throw new EligibilityError('EXCLUDED_CONTENT');
    if (basename(current) === '.git') throw new EligibilityError('NESTED_REPOSITORY');
    const stats = await lstat(current);
    newest = Math.max(newest, stats.mtimeMs);
    if (stats.isFile()) { size += stats.size; fileCount++; }
    else if (stats.isSymbolicLink()) size += stats.size;
    else if (stats.isDirectory()) {
      for (const name of await readdir(current)) pending.push(join(current, name));
    } else throw new EligibilityError('UNSUPPORTED_ENTRY');
  }
  if (metrics) metrics.inspectionMilliseconds += performance.now() - started;
  return { size, fileCount, newestEntryModifiedAt: new Date(newest) };
}

export async function scanRepoArtifacts(categories: Category[], options: ScannerOptions = {}, metrics = newMetrics(), lifecycle = true): Promise<ScanResult[]> {
  const runId = options.runId ?? randomUUID();
  const warnings: { path: string; reason: string; category?: Category['id'] }[] = [];
  const items: CleanableItem[] = [];
  const warn = (path: string, reason: string, category?: Category['id']) => {
    warnings.push({ path, reason, category }); emitEvent(options, { type: 'warning', runId, category, path, reason });
  };
  if (lifecycle) emitEvent(options, { type: 'start', runId, categories: categories.map((c) => c.id) });
  let policy: RepoPolicy | undefined;
  let failure: string | undefined;
  try {
    checkAbort(options.signal);
    policy = await normalizePolicy(categories.map((c) => c.id as RepoCategoryId), options);
    const activePolicy = policy;
    const candidates: { path: string; rule: ArtifactRule }[] = [];
    const visited = new Map<string, number>();
    const seen = new Set<string>();
    async function walk(dir: string, depth: number): Promise<void> {
      checkAbort(options.signal);
      const budget = activePolicy.maxDepth - depth;
      if (budget < 0 || (visited.get(dir) ?? -1) >= budget || excluded(dir, activePolicy)) return;
      visited.set(dir, budget);
      metrics.directoriesVisited++;
      emitEvent(options, { type: 'progress', runId, path: dir, completed: metrics.directoriesVisited });
      try {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          checkAbort(options.signal);
          if (!entry.isDirectory() || entry.isSymbolicLink() || entry.name === '.git') continue;
          const path = join(dir, entry.name);
          if (excluded(path, activePolicy)) continue;
          const enabled = activePolicy.categories.filter((category) => category === 'node-modules' || activePolicy.roots.some((r) => !r.nodeOnly && contains(r.path, path)));
          let rule: ArtifactRule | undefined;
          try {
            rule = await classify(path, enabled);
            if (rule && !seen.has(path)) { seen.add(path); await checkIdentity(path, activePolicy); candidates.push({ path, rule }); }
          } catch (error) { warn(path, reasonOf(error)); }
          if (rule || entry.name === 'node_modules') continue;
          if (entry.name.startsWith('.') && !['.worktrees', '.claude', '.cursor'].includes(entry.name)) continue;
          await walk(path, depth + 1);
        }
      } catch (error) { if (options.signal?.aborted) throw error; warn(dir, reasonOf(error)); }
    }
    for (const root of policy.roots) await walk(root.path, 0);
    const rejected = await new GitBatch(metrics, options.signal).check(candidates.map(({ path, rule }) => ({ path, ignored: rule.requiresIgnoredDirectory })));
    checkAbort(options.signal);
    for (const { path, rule } of candidates) {
      checkAbort(options.signal);
      const category = categories.find((c) => c.id === rule.category)!.id;
      const rejection = rejected.get(path);
      if (rejection) { warn(path, rejection, category); continue; }
      try {
        await checkIdentity(path, policy);
        metrics.candidatesInspected++;
        const measured = await inspectTree(path, policy, metrics, options.signal);
        const parent = await lstat(dirname(path));
        if (rule.category === 'node-modules' && Date.now() - Math.max(parent.mtimeMs, measured.newestEntryModifiedAt.getTime()) < policy.daysOld * 86400000) continue;
        await checkIdentity(path, policy);
        if (!await classify(path, [rule.category])) throw new EligibilityError('MARKER_MISSING');
        const stats = await lstat(path);
        const markerStats = await lstat(join(dirname(path), rule.marker));
        const item: CleanableItem = { path, name: `${basename(dirname(path))}/${basename(path)}`, ...measured, isDirectory: true, modifiedAt: stats.mtime, id: createHash('sha256').update(rule.category + '\0' + path).digest('hex'), artifact: { category: rule.category, marker: rule.marker, markerDev: markerStats.dev, markerIno: markerStats.ino, dev: stats.dev, ino: stats.ino } };
        items.push(item);
        emitEvent(options, { type: 'candidate', runId, category, item });
      } catch (error) { if (options.signal?.aborted) throw error; warn(path, reasonOf(error), category); }
    }
  } catch (error) { failure = reasonOf(error); if (failure !== 'CANCELLED') warn('', failure); }
  const cancelled = options.signal?.aborted ?? false;
  if (cancelled) items.length = 0;
  const context = policy ? freezeContext(policy, items, !cancelled) : undefined;
  const error = cancelled ? 'CANCELLED' : failure ?? (warnings.some((w) => !['TRACKED_CONTENT', 'IGNORE_REQUIRED', 'EXCLUDED_CONTENT', 'NESTED_REPOSITORY'].includes(w.reason)) ? 'Repository inspection incomplete; see warnings' : undefined);
  const results = categories.map((category) => {
    const selected = items.filter((i) => i.artifact?.category === category.id).sort((a, b) => b.size - a.size || a.path.localeCompare(b.path));
    return { category, items: selected, totalSize: selected.reduce((sum, i) => sum + i.size, 0), context, warnings: warnings.filter((w) => w.category ? w.category === category.id : category.id === categories[0]?.id).map(({ path, reason }) => ({ path, reason })), error };
  });
  if (lifecycle) emitEvent(options, { type: 'done', runId, cancelled, candidates: items.length, warnings: warnings.length });
  return results;
}
