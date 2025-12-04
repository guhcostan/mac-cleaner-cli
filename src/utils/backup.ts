import { mkdir, rename, readdir, stat, rm } from 'fs/promises';
import { join, dirname } from 'path';
import { homedir } from 'os';
import type { CleanableItem } from '../types.js';

const BACKUP_DIR = join(homedir(), '.mac-cleaner-cli', 'backup');
const BACKUP_RETENTION_DAYS = 7;

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

export async function restoreBackup(backupDir: string): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;

  async function restoreDir(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        if (entry.name === 'HOME') {
          await restoreDir(entryPath);
        } else {
          await restoreDir(entryPath);
        }
      } else {
        const relativePath = entryPath.replace(backupDir + '/', '').replace('HOME', homedir());
        try {
          await mkdir(dirname(relativePath), { recursive: true });
          await rename(entryPath, relativePath);
          success++;
        } catch {
          failed++;
        }
      }
    }
  }

  await restoreDir(backupDir);
  return { success, failed };
}

export function getBackupDir(): string {
  return BACKUP_DIR;
}

