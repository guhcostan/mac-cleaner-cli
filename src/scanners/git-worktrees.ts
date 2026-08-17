import { spawn } from 'child_process';
import { readdir, readFile, stat, lstat } from 'fs/promises';
import { basename, dirname, join } from 'path';
import { BaseScanner } from './base-scanner.js';
import { CATEGORIES, type CleanableItem, type ScanResult, type ScannerOptions } from '../types.js';
import { HOME, PATHS, exists, formatRelativeAge, getSize, mapPool } from '../utils/index.js';

const DEFAULT_DAYS_OLD = 7;
const HOME_MAX_DEPTH = 5;
const AGENT_ROOT_MAX_DEPTH = 6;
const SIZE_CONCURRENCY = 8;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

const SKIP_DIRS = new Set([
  'node_modules',
  'Library',
  '.Trash',
  'Applications',
  'Movies',
  'Music',
  'Pictures',
  'Public',
  'Caches',
  'dist',
  'build',
  '.next',
  'target',
  'vendor',
  '__pycache__',
  '.npm',
  '.cache',
  '.pnpm-store',
  'Pods',
  'DerivedData',
  'Coverage',
  'coverage',
]);

const ALLOWED_DOT_DIRS = new Set([
  '.cursor',
  '.claude',
  '.codex',
  '.worktrees',
]);

const NESTED_WORKTREE_DIRS = [
  '.claude/worktrees',
  '.cursor/worktrees',
  '.worktrees',
];

type WorktreeStatus = 'orphaned' | 'stale';

interface WorktreeCandidate {
  path: string;
  modifiedAt: Date;
  status: WorktreeStatus;
  mainRepo?: string;
}

export class GitWorktreesScanner extends BaseScanner {
  category = CATEGORIES['git-worktrees'];

  constructor(private readonly searchRoots: string[] = defaultSearchRoots()) {
    super();
  }

  async scan(options?: ScannerOptions): Promise<ScanResult> {
    const daysOld = options?.daysOld ?? DEFAULT_DAYS_OLD;
    const minSize = options?.minSize ?? 0;
    const discovered = new Map<string, WorktreeCandidate>();

    for (const root of uniquePaths(this.searchRoots)) {
      if (!(await exists(root))) continue;
      const maxDepth = root === HOME ? HOME_MAX_DEPTH : AGENT_ROOT_MAX_DEPTH;
      await this.crawl(root, { daysOld, discovered, maxDepth, depth: 0 });
    }

    const candidates = [...discovered.values()];
    const items: CleanableItem[] = [];

    await mapPool(candidates, SIZE_CONCURRENCY, async (candidate) => {
      const size = await directorySizeBytes(candidate.path);
      if (size <= minSize) return;
      items.push({
        path: candidate.path,
        size,
        name: formatName(candidate),
        isDirectory: true,
        modifiedAt: candidate.modifiedAt,
        detail: formatDetail(candidate),
      });
    });

    items.sort((a, b) => b.size - a.size);
    return this.createResult(items);
  }

  private async crawl(
    dir: string,
    ctx: {
      daysOld: number;
      discovered: Map<string, WorktreeCandidate>;
      maxDepth: number;
      depth: number;
    }
  ): Promise<void> {
    if (ctx.depth > ctx.maxDepth) return;

    const gitKind = await entryKind(join(dir, '.git'));

    if (gitKind === 'file') {
      await this.considerLinkedWorktree(dir, ctx);
      return;
    }

    if (gitKind === 'directory') {
      await this.collectFromRegistry(dir, join(dir, '.git'), ctx);
      for (const relative of NESTED_WORKTREE_DIRS) {
        const nested = join(dir, relative);
        if (await exists(nested)) {
          await this.crawl(nested, { ...ctx, depth: ctx.depth + 1 });
        }
      }
      return;
    }

    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    const children = entries
      .filter((entry) => entry.isDirectory() && shouldDescend(entry.name))
      .map((entry) => join(dir, entry.name));

    await mapPool(children, SIZE_CONCURRENCY, (child) =>
      this.crawl(child, { ...ctx, depth: ctx.depth + 1 })
    );
  }

  private async collectFromRegistry(
    repoPath: string,
    gitDir: string,
    ctx: {
      daysOld: number;
      discovered: Map<string, WorktreeCandidate>;
    }
  ): Promise<void> {
    const metaDir = join(gitDir, 'worktrees');
    if (!(await exists(metaDir))) return;

    let names: string[];
    try {
      names = await readdir(metaDir);
    } catch {
      return;
    }

    await mapPool(names, SIZE_CONCURRENCY, async (name) => {
      try {
        const pointer = (await readFile(join(metaDir, name, 'gitdir'), 'utf8')).trim();
        if (!pointer) return;
        const worktreePath = dirname(pointer);
        if (!(await exists(worktreePath))) return;
        await this.considerLinkedWorktree(worktreePath, ctx, repoPath);
      } catch {
        return;
      }
    });
  }

  private async considerLinkedWorktree(
    worktreePath: string,
    ctx: {
      daysOld: number;
      discovered: Map<string, WorktreeCandidate>;
    },
    mainRepoHint?: string
  ): Promise<void> {
    if (ctx.discovered.has(worktreePath)) return;

    const gitFile = join(worktreePath, '.git');
    const gitDir = await readGitDirPointer(gitFile);
    if (!gitDir) return;

    let modifiedAt: Date;
    try {
      modifiedAt = (await stat(worktreePath)).mtime;
    } catch {
      return;
    }

    const ageDays = (Date.now() - modifiedAt.getTime()) / MS_PER_DAY;
    const orphaned = !(await exists(gitDir));
    if (!orphaned && ageDays < ctx.daysOld) return;

    ctx.discovered.set(worktreePath, {
      path: worktreePath,
      modifiedAt,
      mainRepo: mainRepoHint ?? inferMainRepo(gitDir),
      status: orphaned ? 'orphaned' : 'stale',
    });
  }
}

function defaultSearchRoots(): string[] {
  return [
    HOME,
    PATHS.cursorWorktrees,
    PATHS.codexWorktrees,
    PATHS.claudeWorktrees,
  ];
}

function shouldDescend(name: string): boolean {
  if (SKIP_DIRS.has(name)) return false;
  if (name === '.git') return false;
  if (name.startsWith('.')) return ALLOWED_DOT_DIRS.has(name);
  return true;
}

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths)];
}

function inferMainRepo(gitDir: string): string | undefined {
  const marker = '/.git/worktrees/';
  const index = gitDir.lastIndexOf(marker);
  if (index === -1) return undefined;
  return gitDir.slice(0, index);
}

function formatName(candidate: WorktreeCandidate): string {
  const label = basename(candidate.path);
  const repo = candidate.mainRepo ? basename(candidate.mainRepo) : 'unknown';
  return `${repo}/${label}`;
}

function formatDetail(candidate: WorktreeCandidate): string {
  if (candidate.status === 'orphaned') return 'orphaned';
  return formatRelativeAge(candidate.modifiedAt);
}

async function readGitDirPointer(gitFilePath: string): Promise<string | null> {
  try {
    if ((await entryKind(gitFilePath)) !== 'file') return null;
    const contents = await readFile(gitFilePath, 'utf8');
    const match = contents.match(/^gitdir:\s*(.+)$/m);
    return match?.[1]?.trim() ?? null;
  } catch {
    return null;
  }
}

async function entryKind(path: string): Promise<'file' | 'directory' | null> {
  try {
    const stats = await lstat(path);
    if (stats.isSymbolicLink()) return null;
    if (stats.isFile()) return 'file';
    if (stats.isDirectory()) return 'directory';
    return null;
  } catch {
    return null;
  }
}

function directorySizeBytes(path: string): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn('/usr/bin/du', ['-sk', path], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120_000,
    });

    let stdout = '';
    proc.stdout.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    proc.on('error', () => {
      void getSize(path).then(resolve);
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        void getSize(path).then(resolve);
        return;
      }
      const kb = Number.parseInt(stdout, 10);
      resolve(Number.isFinite(kb) ? kb * 1024 : 0);
    });
  });
}

