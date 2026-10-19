import { spawn } from 'child_process';
import { lstat, realpath } from 'fs/promises';
import { homedir } from 'os';
import { dirname, isAbsolute, join, relative, resolve } from 'path';
import type { ArtifactEvidence, CleanableItem, CleanContext, RepoCategoryId, RepoPolicy, RepoRoot, ScannerOptions } from '../types.js';
import { classify } from './rules.js';
import { loadConfig } from '../utils/config.js';
import { inspectTree } from './walker.js';

export class EligibilityError extends Error {
  constructor(readonly reason: string) { super(reason); }
}
export function contains(parent: string, path: string): boolean {
  return path === parent || path.startsWith(parent + '/');
}
export function reasonOf(error: unknown): string {
  if (error instanceof EligibilityError) return error.reason;
  return (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'MISSING' : (error as NodeJS.ErrnoException).code ?? 'INSPECTION_FAILED';
}
export function validatePatterns(patterns: unknown): asserts patterns is string[] {
  if (!Array.isArray(patterns) || patterns.some((p) => typeof p !== 'string' || !p || isAbsolute(p) || /[!{}[\]\\\0]/.test(p) || p.split('/').some((s) => !s || s === '.' || s === '..' || (s.includes('**') && s !== '**')))) {
    throw new EligibilityError('INVALID_EXCLUSIONS');
  }
}
function segmentMatch(pattern: string, name: string): boolean {
  return new RegExp('^' + pattern.replace(/[.+^$()|\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 's').test(name);
}
export function matchesExclude(pattern: string, path: string): boolean {
  const parts = path.split('/');
  if (!pattern.includes('/')) return parts.some((part) => segmentMatch(pattern, part));
  const patterns = pattern.split('/');
  const match = (i: number, j: number): boolean => {
    if (i === patterns.length) return true; // prefix, on a component boundary
    if (patterns[i] === '**') return match(i + 1, j) || (j < parts.length && match(i, j + 1));
    return j < parts.length && segmentMatch(patterns[i], parts[j]) && match(i + 1, j + 1);
  };
  return match(0, 0);
}
export function excluded(path: string, policy: RepoPolicy): boolean {
  return policy.roots.some((root) => contains(root.path, path) && policy.excludePaths.some((pattern) => matchesExclude(pattern, relative(root.path, path))));
}
export function freezeContext(policy: RepoPolicy, items: CleanableItem[], complete = true): CleanContext {
  const evidence = Object.fromEntries(items.filter((i) => i.artifact).map((i) => [i.path, Object.freeze({ ...i.artifact! })]));
  return Object.freeze({ repoPolicy: Object.freeze({ ...policy, roots: Object.freeze(policy.roots.map((r) => Object.freeze({ ...r }))), categories: Object.freeze([...policy.categories]), excludePaths: Object.freeze([...policy.excludePaths]) }), evidence: Object.freeze(evidence), complete });
}

export async function normalizePolicy(categories: RepoCategoryId[], options: ScannerOptions = {}, refresh = false): Promise<RepoPolicy> {
  const config = await loadConfig(undefined, refresh);
  if (config.repoPolicyError) throw new EligibilityError(config.repoPolicyError);
  if (options.excludePaths !== undefined) validatePatterns(options.excludePaths);
  if (options.roots !== undefined && !Array.isArray(options.roots)) throw new EligibilityError('INVALID_ROOTS');
  if (options.includeEcosystems !== undefined && !Array.isArray(options.includeEcosystems)) throw new EligibilityError('INVALID_ECOSYSTEM');
  const patterns = [...(config.excludePaths ?? []), ...(options.excludePaths ?? [])];
  validatePatterns(patterns);
  if (options.includeEcosystems?.some((e) => !['node', 'rust', 'go'].includes(e))) throw new EligibilityError('INVALID_ECOSYSTEM');
  const daysOld = options.daysOld ?? config.nodeModulesDaysOld ?? 30;
  if (!Number.isInteger(daysOld) || daysOld < 0 || daysOld > 365) throw new EligibilityError('INVALID_AGE');
  const explicitRoots = !!options.roots?.length;
  const defaults = ['Projects', 'Developer', 'Code', 'dev', 'workspace', 'repos'].map((p) => join(homedir(), p));
  const inputs = explicitRoots ? options.roots!.map((input) => ({ input, nodeOnly: false })) : [
    ...[...defaults, ...(config.extraPaths?.projects ?? [])].map((input) => ({ input, nodeOnly: false })),
    ...(categories.includes('node-modules') ? (config.extraPaths?.nodeModules ?? []).map((input) => ({ input, nodeOnly: true })) : []),
  ];
  const roots: RepoRoot[] = [];
  const home = await realpath(homedir());
  for (const { input, nodeOnly } of inputs) {
    if (typeof input !== 'string' || !input || input.includes('\0')) throw new EligibilityError('INVALID_ROOT');
    const lexical = resolve(input.startsWith('~/') ? join(homedir(), input.slice(2)) : input);
    try {
      const path = await realpath(lexical);
      if (![home, '/Users', '/Volumes'].some((base) => path.startsWith(base + '/')) || [home, '/Users', '/Volumes'].includes(path)) throw new EligibilityError('INVALID_ROOT');
      const stat = await lstat(path);
      if (!stat.isDirectory()) throw new EligibilityError('INVALID_ROOT');
      if (!roots.some((r) => r.input === lexical && r.nodeOnly === nodeOnly)) roots.push({ input: lexical, path, nodeOnly, dev: stat.dev, ino: stat.ino });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT' && !explicitRoots) continue;
      throw error;
    }
  }
  return { roots, categories: categories.filter((c) => !config.excludeCategories?.includes(c as import('../types.js').CategoryId)), excludePaths: patterns, daysOld, configDaysOld: config.nodeModulesDaysOld ?? 30, maxDepth: config.projectScanMaxDepth ?? 4, explicitRoots };
}

async function currentPolicy(context: CleanContext): Promise<{ policy: RepoPolicy; currentRoots: readonly RepoRoot[] }> {
  const original = context.repoPolicy;
  const current = await normalizePolicy([...original.categories], { roots: original.explicitRoots ? original.roots.map((r) => r.input) : undefined, excludePaths: [...original.excludePaths] }, true);
  const policy = { ...original, maxDepth: Math.min(original.maxDepth, current.maxDepth), categories: current.categories, excludePaths: current.excludePaths, daysOld: Math.max(current.configDaysOld === original.configDaysOld ? original.daysOld : current.configDaysOld, original.daysOld), roots: original.roots.filter((r) => current.roots.some((c) => contains(c.path, r.path) && (!c.nodeOnly || r.nodeOnly))) };
  return { policy, currentRoots: current.roots };
}

/** Lexical checks precede realpath; no links below a bound canonical root. */
export async function checkIdentity(path: string, policy: RepoPolicy, evidence?: ArtifactEvidence): Promise<void> {
  const stat = await lstat(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new EligibilityError('TYPE_CHANGED');
  const roots = policy.roots.filter((root) => path !== root.path && contains(root.path, path));
  if (!roots.length) throw new EligibilityError('OUT_OF_ROOT');
  for (const root of roots) {
    if (await realpath(root.input) !== root.path) throw new EligibilityError('ROOT_CHANGED');
    const bound = await lstat(root.path);
    if (bound.dev !== root.dev || bound.ino !== root.ino) throw new EligibilityError('ROOT_CHANGED');
    for (let current = dirname(path); current !== root.path; current = dirname(current)) {
      const parent = await lstat(current);
      if (parent.isSymbolicLink() || !parent.isDirectory()) throw new EligibilityError('SYMLINK_ANCESTOR');
    }
  }
  if (await realpath(path) !== path) throw new EligibilityError('OUT_OF_ROOT');
  if (evidence && (evidence.dev !== stat.dev || evidence.ino !== stat.ino)) throw new EligibilityError('REPLACED');
}

export async function checkMarkerIdentity(path: string, evidence: ArtifactEvidence): Promise<void> {
  const marker = await lstat(join(dirname(path), evidence.marker));
  if (marker.isSymbolicLink() || !marker.isFile() || marker.dev !== evidence.markerDev || marker.ino !== evidence.markerIno) throw new EligibilityError('MARKER_CHANGED');
}

export interface RepoMetrics { gitProcesses: number; directoriesVisited: number; candidatesInspected: number; entriesInspected: number; gitMilliseconds: number; inspectionMilliseconds: number }
export const newMetrics = (): RepoMetrics => ({ gitProcesses: 0, directoriesVisited: 0, candidatesInspected: 0, entriesInspected: 0, gitMilliseconds: 0, inspectionMilliseconds: 0 });

/** Bounded argument-array Git transport. No shell, inherited routing or optional locks. */
export async function gitQuery(cwd: string, args: string[], input = '', metrics?: RepoMetrics, signal?: AbortSignal): Promise<{ code: number; output: string }> {
  const started = performance.now();
  if (metrics) metrics.gitProcesses++;
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  return new Promise((resolveQuery, reject) => {
    const child = spawn('git', ['-C', cwd, ...args], { env: { ...env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' }, stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks: Buffer[] = [];
    let bytes = 0;
    let failed = false;
    const fail = () => { failed = true; child.kill('SIGKILL'); reject(new EligibilityError('GIT_UNKNOWN')); };
    const abort = () => { failed = true; child.kill('SIGKILL'); reject(new EligibilityError('CANCELLED')); };
    const timer = setTimeout(fail, 10000);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    child.on('error', () => { clearTimeout(timer); fail(); });
    child.stdout.on('data', (chunk: Buffer) => { bytes += chunk.length; if (bytes > 16 * 1024 * 1024) fail(); else chunks.push(chunk); });
    child.stderr.on('data', (chunk: Buffer) => { bytes += chunk.length; if (bytes > 16 * 1024 * 1024) fail(); });
    child.stdin.on('error', () => { /* exit status handles an early closed pipe */ });
    child.on('close', (code) => { if (metrics) metrics.gitMilliseconds += performance.now() - started; clearTimeout(timer); signal?.removeEventListener('abort', abort); if (!failed) { const bytes = Buffer.concat(chunks); const output = bytes.toString('utf8'); if (!Buffer.from(output).equals(bytes)) reject(new EligibilityError('GIT_UNKNOWN')); else resolveQuery({ code: code ?? -1, output }); } });
    child.stdin.end(input);
  });
}

export class GitBatch {
  private boundaries = new Map<string, Promise<string | undefined>>();
  constructor(private metrics?: RepoMetrics, private signal?: AbortSignal) {}
  private boundary(dir: string): Promise<string | undefined> {
    const cached = this.boundaries.get(dir);
    if (cached) return cached;
    const query = (async () => {
      try { await lstat(join(dir, '.git')); return dir; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new EligibilityError('GIT_UNKNOWN'); }
      return dirname(dir) === dir ? undefined : this.boundary(dirname(dir));
    })();
    this.boundaries.set(dir, query);
    return query;
  }
  async check(candidates: { path: string; ignored: boolean }[]): Promise<Map<string, string>> {
    const rejected = new Map<string, string>();
    const groups = new Map<string, typeof candidates>();
    for (const candidate of candidates) {
      try {
        const root = await this.boundary(dirname(candidate.path));
        if (!root) { if (candidate.ignored) rejected.set(candidate.path, 'IGNORE_REQUIRED'); continue; }
        groups.set(root, [...(groups.get(root) ?? []), candidate]);
      } catch { rejected.set(candidate.path, 'GIT_UNKNOWN'); }
    }
    for (const [root, group] of groups) {
      try {
        const query = (args: string[], input = '') => gitQuery(root, args, input, this.metrics, this.signal);
        const must = async (args: string[]) => { const r = await query(args); if (r.code !== 0) throw new EligibilityError('GIT_UNKNOWN'); return r.output; };
        const top = (await must(['rev-parse', '--show-toplevel'])).replace(/\n$/, '');
        if (await realpath(top) !== root) throw new EligibilityError('GIT_UNKNOWN');
        const index = await must(['ls-files', '--cached', '--stage', '-z']);
        const head = await query(['rev-parse', '--verify', 'HEAD^{commit}']);
        let tree = '';
        if (head.code === 0) tree = await must(['ls-tree', '-r', '--full-tree', '-z', head.output.trim()]);
        else {
          const ref = await must(['symbolic-ref', '-q', 'HEAD']);
          if (!ref.startsWith('refs/heads/') || (await query(['show-ref', '--verify', '--quiet', ref.trim()])).code !== 1) throw new EligibilityError('GIT_UNKNOWN');
        }
        const tracked = [...index.split('\0'), ...tree.split('\0')].filter(Boolean).map((line) => {
          const tab = line.indexOf('\t');
          if (tab < 0) throw new EligibilityError('GIT_UNKNOWN');
          return join(root, line.slice(tab + 1));
        });
        const ambiguous = group.filter((c) => c.ignored).map((c) => c.path + '/');
        const ignored = new Set<string>();
        if (ambiguous.length) {
          const result = await query(['check-ignore', '--stdin', '-z'], ambiguous.join('\0') + '\0');
          if (result.code !== 0 && result.code !== 1) throw new EligibilityError('GIT_UNKNOWN');
          result.output.split('\0').filter(Boolean).forEach((p) => ignored.add(p));
        }
        for (const candidate of group) {
          if (tracked.some((p) => contains(candidate.path, p) || contains(p, candidate.path))) rejected.set(candidate.path, 'TRACKED_CONTENT');
          else if (candidate.ignored && !ignored.has(candidate.path + '/')) rejected.set(candidate.path, 'IGNORE_REQUIRED');
        }
      } catch { for (const candidate of group) rejected.set(candidate.path, 'GIT_UNKNOWN'); }
    }
    return rejected;
  }
}

export async function validateSelected(items: CleanableItem[], category: RepoCategoryId, context?: CleanContext, metrics?: RepoMetrics): Promise<{ valid: CleanableItem[]; rejected: { path: string; reason: string }[] }> {
  const valid: CleanableItem[] = [];
  const rejected: { path: string; reason: string }[] = [];
  const candidates: { item: CleanableItem; ignored: boolean }[] = [];
  let policy: RepoPolicy | undefined;
  let currentRoots: readonly RepoRoot[] = [];
  try { if (context) ({ policy, currentRoots } = await currentPolicy(context)); }
  catch (error) { return { valid, rejected: items.map((i) => ({ path: i.path, reason: reasonOf(error) })) }; }
  for (const item of items) {
    try {
      const evidence = context?.evidence[item.path];
      if (!context?.complete || !evidence || evidence.category !== category) throw new EligibilityError('MISSING_CONTEXT');
      if (!policy) throw new EligibilityError('MISSING_CONTEXT');
      if (!policy.categories.includes(category)) throw new EligibilityError('CATEGORY_DISABLED');
      const maxDepth = policy.maxDepth;
      const withinDepth = (roots: readonly RepoRoot[]) => roots.some((r) => contains(r.path, dirname(item.path)) && relative(r.path, dirname(item.path)).split('/').filter(Boolean).length <= maxDepth && (category === 'node-modules' || !r.nodeOnly));
      if (!withinDepth(policy.roots) || !withinDepth(currentRoots)) throw new EligibilityError('OUT_OF_ROOT');
      validatePatterns(policy.excludePaths);
      await checkIdentity(item.path, policy, evidence);
      const rule = await classify(item.path, [category]);
      if (!rule || rule.marker !== evidence.marker) throw new EligibilityError('MARKER_MISSING');
      await checkMarkerIdentity(item.path, evidence);
      if (metrics) metrics.candidatesInspected++;
      // Keep old authority/identity bindings, but apply keep patterns relative to
      // every original and currently applicable root. Root edits cannot rebase
      // an exclusion away from a selected candidate or its contents.
      const measured = await inspectTree(item.path, { ...policy, roots: [...policy.roots, ...currentRoots] }, metrics);
      const parent = await lstat(dirname(item.path));
      if (category === 'node-modules' && Date.now() - Math.max(parent.mtimeMs, measured.newestEntryModifiedAt.getTime()) < policy.daysOld * 86400000) throw new EligibilityError('RECENT_ACTIVITY');
      candidates.push({ item: { ...item, ...measured, artifact: evidence }, ignored: rule.requiresIgnoredDirectory });
    } catch (error) { rejected.push({ path: item.path, reason: reasonOf(error) }); }
  }
  const gitRejected = await new GitBatch(metrics).check(candidates.map(({ item, ignored }) => ({ path: item.path, ignored })));
  for (const { item } of candidates) {
    const reason = gitRejected.get(item.path);
    if (reason) rejected.push({ path: item.path, reason }); else valid.push(item);
  }
  return { valid, rejected };
}
