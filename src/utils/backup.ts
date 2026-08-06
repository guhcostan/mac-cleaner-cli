import { mkdir, rename, readdir, stat, rm, cp } from 'fs/promises';
import { join, dirname, resolve, relative } from 'path';
import { homedir } from 'os';
import type { CleanableItem } from '../types.js';
import { validatePathSafety } from './fs.js';

const BACKUP_DIR = join(homedir(), '.mac-cleaner-cli', 'backup');
const BACKUP_RETENTION_DAYS = 7;

/**
 * Validates that a restore path is safe and within the home directory.
 * Prevents path traversal attacks via malicious backup files.
 */
function validateRestorePath(targetPath: string): string | null {
  const home = homedir();
  const resolved = resolve(targetPath);

  // Ensure the resolved path is within the home directory
  if (!resolved.startsWith(home + '/') && resolved !== home) {
    return `Path traversal detected: ${targetPath} resolves outside home directory`;
  }

  // Check for suspicious patterns that might indicate an attack
  if (targetPath.includes('..')) {
    return `Suspicious path pattern detected: ${targetPath}`;
  }

  return null;
}

/**
 * Creates this session's backup directory.
 *
 * The name is an ISO timestamp, which has millisecond resolution — two sessions
 * started in the same millisecond would land in the SAME directory and one could
 * overwrite the other. `mkdir` with `recursive: true` does not report that: it
 * accepts an existing directory silently. Hence the incremental suffix and the
 * non-recursive `mkdir` on the last level, which is what makes creation
 * exclusive.
 */
export async function ensureBackupDir(): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  await mkdir(BACKUP_DIR, { recursive: true });

  for (let attempt = 0; ; attempt++) {
    const sessionDir = join(BACKUP_DIR, attempt === 0 ? timestamp : `${timestamp}-${attempt}`);
    try {
      await mkdir(sessionDir);
      return sessionDir;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }
}

/**
 * Maps an original path to its path inside the backup.
 *
 * Only paths INSIDE the home directory are accepted, for two reasons:
 *
 * 1. `restoreBackup()` only knows how to restore what sits under the `HOME/`
 *    prefix — accepting anything else would create a backup that cannot be
 *    restored.
 * 2. The previous implementation used `item.path.replace(homedir(), 'HOME')`,
 *    which replaces the FIRST occurrence anywhere in the string and, for a path
 *    outside home, returned an absolute path — making `join(backupDir, '/x')`
 *    land outside the backup directory entirely.
 *
 * Returns null when the path cannot be backed up safely.
 */
export function backupPathFor(originalPath: string, backupDir: string): string | null {
  const home = homedir();
  const resolved = resolve(originalPath);

  if (!resolved.startsWith(home + '/')) {
    return null;
  }

  const relativeToHome = relative(home, resolved);
  if (!relativeToHome || relativeToHome.startsWith('..')) {
    return null;
  }

  return join(backupDir, 'HOME', relativeToHome);
}

/**
 * Moves an item into the backup directory instead of deleting it.
 *
 * `rename` first (instant, same volume) with a copy-then-remove fallback,
 * because `rename` fails with EXDEV when the item lives on another volume — a
 * real case for `/Volumes/*` and some caches.
 *
 * Safety contract: if the backup fails, the item is NOT deleted. Callers count
 * that as a failure, never as a silent success.
 */
export async function backupItem(item: CleanableItem, backupDir: string): Promise<boolean> {
  const safetyError = validatePathSafety(item.path);
  if (safetyError) {
    console.error(safetyError);
    return false;
  }

  const backupPath = backupPathFor(item.path, backupDir);
  if (!backupPath) {
    console.error(`Cannot back up path outside home directory: ${item.path}`);
    return false;
  }

  try {
    await mkdir(dirname(backupPath), { recursive: true });
    await rename(item.path, backupPath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') {
      return false;
    }
  }

  // Different volume: copy preserving symlinks (never following the target),
  // and only then remove the original.
  try {
    await cp(item.path, backupPath, {
      recursive: true,
      verbatimSymlinks: true,
      errorOnExist: false,
      force: true,
    });
    await rm(item.path, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Moves every item into `backupDir` instead of deleting them.
 *
 * `backedUpSize` is reported separately from "freed space" on purpose: moving a
 * file to another folder on the SAME disk does not free a single byte. The space
 * only appears after `mac-cleaner-cli backup --clean`. Calling it "freed" would
 * trade one untruth (a backup that never happened) for another.
 */
export async function backupItems(
  items: CleanableItem[],
  backupDir: string,
  dryRun = false,
  onProgress?: (current: number, total: number, item: CleanableItem) => void
): Promise<{ success: number; failed: number; backedUpSize: number }> {
  let success = 0;
  let failed = 0;
  let backedUpSize = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    onProgress?.(i + 1, items.length, item);

    const backed = dryRun
      ? backupPathFor(item.path, backupDir) !== null
      : await backupItem(item, backupDir);

    if (backed) {
      success++;
      backedUpSize += item.size;
    } else {
      failed++;
    }
  }

  return { success, failed, backedUpSize };
}

export async function cleanOldBackups(): Promise<number> {
  let cleaned = 0;
  const now = Date.now();
  const maxAge = BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;

  try {
    const entries = await readdir(BACKUP_DIR);

    for (const entry of entries) {
      const entryPath = join(BACKUP_DIR, entry);
      try {
        const stats = await stat(entryPath);
        if (stats.isDirectory() && now - stats.mtime.getTime() > maxAge) {
          await rm(entryPath, { recursive: true, force: true });
          cleaned++;
        }
      } catch {
        continue;
      }
    }
  } catch {
    // Backup dir may not exist
  }

  return cleaned;
}

export async function listBackups(): Promise<{ path: string; date: Date; size: number }[]> {
  const backups: { path: string; date: Date; size: number }[] = [];

  try {
    const entries = await readdir(BACKUP_DIR);

    for (const entry of entries) {
      const entryPath = join(BACKUP_DIR, entry);
      try {
        const stats = await stat(entryPath);
        if (stats.isDirectory()) {
          const size = await getBackupSize(entryPath);
          backups.push({
            path: entryPath,
            date: stats.mtime,
            size,
          });
        }
      } catch {
        continue;
      }
    }
  } catch {
    // Backup dir may not exist
  }

  return backups.sort((a, b) => b.date.getTime() - a.date.getTime());
}

async function getBackupSize(dir: string): Promise<number> {
  let size = 0;

  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = join(dir, entry.name);
      try {
        if (entry.isFile()) {
          const stats = await stat(entryPath);
          size += stats.size;
        } else if (entry.isDirectory()) {
          size += await getBackupSize(entryPath);
        }
      } catch {
        continue;
      }
    }
  } catch {
    // Ignore errors
  }

  return size;
}

export async function restoreBackup(backupDir: string): Promise<{ success: number; failed: number; errors: string[] }> {
  let success = 0;
  let failed = 0;
  const errors: string[] = [];
  const home = homedir();

  // Validate that backupDir is within our expected backup location.
  // The `+ '/'` matters: without it, `~/.mac-cleaner-cli/backup-anything`
  // passed the check simply by being a textual prefix.
  const resolvedBackupDir = resolve(backupDir);
  if (
    resolvedBackupDir !== BACKUP_DIR &&
    !resolvedBackupDir.startsWith(BACKUP_DIR + '/')
  ) {
    return {
      success: 0,
      failed: 1,
      errors: ['Invalid backup directory: must be within the mac-cleaner-cli backup folder']
    };
  }

  async function restoreDir(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      errors.push(`Failed to read directory ${dir}: ${code || 'unknown error'}`);
      failed++;
      return;
    }

    for (const entry of entries) {
      const entryPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        await restoreDir(entryPath);
      } else {
        // Compute the relative path from backup directory
        const relFromBackup = relative(resolvedBackupDir, entryPath);

        // Replace HOME prefix with actual home directory
        // Use a more secure replacement that only matches at the start
        let targetPath: string;
        if (relFromBackup.startsWith('HOME/')) {
          targetPath = join(home, relFromBackup.slice(5)); // Remove 'HOME/' prefix
        } else if (relFromBackup === 'HOME') {
          // Skip if it's just 'HOME' without a subpath
          continue;
        } else {
          // Files not under HOME - skip them for security
          errors.push(`Skipping file outside HOME structure: ${relFromBackup}`);
          failed++;
          continue;
        }

        // Validate the target path to prevent path traversal attacks
        const validationError = validateRestorePath(targetPath);
        if (validationError) {
          errors.push(validationError);
          failed++;
          continue;
        }

        try {
          await mkdir(dirname(targetPath), { recursive: true });
          await rename(entryPath, targetPath);
          success++;
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          errors.push(`Failed to restore ${entry.name}: ${code || 'unknown error'}`);
          failed++;
        }
      }
    }
  }

  await restoreDir(resolvedBackupDir);
  return { success, failed, errors };
}

export function getBackupDir(): string {
  return BACKUP_DIR;
}
