import { mkdir, rename, readdir, stat, rm } from 'fs/promises';
import { join, dirname, resolve, relative } from 'path';
import { homedir } from 'os';
import type { CleanableItem } from '../types.js';

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

export async function ensureBackupDir(): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const sessionDir = join(BACKUP_DIR, timestamp);
  await mkdir(sessionDir, { recursive: true });
  return sessionDir;
}

export async function backupItem(item: CleanableItem, backupDir: string): Promise<boolean> {
  try {
    const relativePath = item.path.replace(homedir(), 'HOME');
    const backupPath = join(backupDir, relativePath);
    await mkdir(dirname(backupPath), { recursive: true });
    await rename(item.path, backupPath);
    return true;
  } catch {
    return false;
  }
}

export async function backupItems(
  items: CleanableItem[],
  onProgress?: (current: number, total: number, item: CleanableItem) => void
): Promise<{ backupDir: string; success: number; failed: number }> {
  const backupDir = await ensureBackupDir();
  let success = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    onProgress?.(i + 1, items.length, item);

    const backed = await backupItem(item, backupDir);
    if (backed) {
      success++;
    } else {
      failed++;
    }
  }

  return { backupDir, success, failed };
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

  // Validate that backupDir is within our expected backup location
  const resolvedBackupDir = resolve(backupDir);
  if (!resolvedBackupDir.startsWith(BACKUP_DIR)) {
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

