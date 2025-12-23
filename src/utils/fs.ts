import { lstat, readdir, rm, access, unlink } from 'fs/promises';
import { join, resolve } from 'path';
import { homedir } from 'os';
import type { CleanableItem } from '../types.js';

/**
 * System paths that should NEVER be deleted.
 * This is a security safeguard against accidental or malicious deletion.
 */
const PROTECTED_PATHS = [
  '/System',
  '/usr',
  '/bin',
  '/sbin',
  '/etc',
  '/var/log',
  '/var/db',
  '/var/root',
  '/private/var/db',
  '/private/var/root',
  '/private/var/log',
  '/Library/Apple',
  '/Applications/Utilities',
];

/**
 * Paths that are explicitly allowed even if they might match protected patterns.
 * These are safe temporary/cache locations.
 */
const ALLOWED_PATHS = [
  '/tmp',
  '/private/tmp',
  '/var/tmp',
  '/private/var/tmp',
  '/var/folders',
  '/private/var/folders',
];

/**
 * Checks if a path is a protected system path that should never be deleted.
 */
export function isProtectedPath(path: string): boolean {
  const resolved = resolve(path);
  
  // First check if it's in an explicitly allowed location (like /tmp, /var/folders)
  const isAllowed = ALLOWED_PATHS.some((p) => resolved === p || resolved.startsWith(p + '/'));
  if (isAllowed) {
    return false;
  }
  
  return PROTECTED_PATHS.some((p) => resolved === p || resolved.startsWith(p + '/'));
}

/**
 * Validates that a path is safe to delete.
 * Returns an error message if unsafe, or null if safe.
 */
export function validatePathSafety(path: string): string | null {
  const resolved = resolve(path);
  
  // Check for protected system paths
  if (isProtectedPath(resolved)) {
    return `Refusing to delete protected system path: ${path}`;
  }
  
  // Check for root directory
  if (resolved === '/') {
    return 'Refusing to delete root directory';
  }
  
  // Check for home directory itself
  const home = homedir();
  if (resolved === home) {
    return 'Refusing to delete home directory';
  }
  
  return null;
}

export async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function getSize(path: string): Promise<number> {
  try {
    const stats = await lstat(path);
    if (stats.isSymbolicLink()) {
      return stats.size;
    }
    if (stats.isFile()) {
      return stats.size;
    }
    if (stats.isDirectory()) {
      return await getDirectorySize(path);
    }
    return 0;
  } catch {
    return 0;
  }
}

export async function getDirectorySize(dirPath: string): Promise<number> {
  let totalSize = 0;

  try {
    const entries = await readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      try {
        if (entry.isSymbolicLink()) {
          const stats = await lstat(fullPath);
          totalSize += stats.size;
        } else if (entry.isFile()) {
          const stats = await lstat(fullPath);
          totalSize += stats.size;
        } else if (entry.isDirectory()) {
          totalSize += await getDirectorySize(fullPath);
        }
      } catch {
        continue;
      }
    }
  } catch {
    return 0;
  }

  return totalSize;
}

export async function getItems(
  dirPath: string,
  options: {
    recursive?: boolean;
    minAge?: number;
    minSize?: number;
    maxDepth?: number;
  } = {}
): Promise<CleanableItem[]> {
  const items: CleanableItem[] = [];
  const { recursive = false, minAge, minSize, maxDepth = 10 } = options;

  async function processDir(currentPath: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;

    try {
      const entries = await readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(currentPath, entry.name);

        try {
          const stats = await lstat(fullPath);

          if (minAge) {
            const daysOld = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);
            if (daysOld < minAge) continue;
          }

          let size: number;
          if (stats.isSymbolicLink()) {
            size = stats.size;
          } else if (entry.isDirectory()) {
            size = await getDirectorySize(fullPath);
          } else {
            size = stats.size;
          }

          if (minSize && size < minSize) continue;

          items.push({
            path: fullPath,
            size,
            name: entry.name,
            isDirectory: entry.isDirectory(),
            modifiedAt: stats.mtime,
          });

          if (recursive && entry.isDirectory() && !stats.isSymbolicLink()) {
            await processDir(fullPath, depth + 1);
          }
        } catch {
          continue;
        }
      }
    } catch {
      return;
    }
  }

  await processDir(dirPath, 0);
  return items;
}

export async function getDirectoryItems(dirPath: string): Promise<CleanableItem[]> {
  const items: CleanableItem[] = [];

  try {
    const entries = await readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);

      try {
        const stats = await lstat(fullPath);
        let size: number;
        if (stats.isSymbolicLink()) {
          size = stats.size;
        } else if (entry.isDirectory()) {
          size = await getDirectorySize(fullPath);
        } else {
          size = stats.size;
        }

        items.push({
          path: fullPath,
          size,
          name: entry.name,
          isDirectory: entry.isDirectory(),
          modifiedAt: stats.mtime,
        });
      } catch {
        continue;
      }
    }
  } catch {
    return [];
  }

  return items;
}

/**
 * Safely removes a file or directory.
 * 
 * Security measures:
 * 1. Validates path is not a protected system path
 * 2. Re-checks file type immediately before deletion to prevent TOCTOU attacks
 * 3. Handles symlinks safely (removes symlink, not target)
 */
export async function removeItem(path: string, dryRun = false): Promise<boolean> {
  if (dryRun) {
    return true;
  }

  // Security check: validate path is safe to delete
  const safetyError = validatePathSafety(path);
  if (safetyError) {
    console.error(safetyError);
    return false;
  }

  try {
    // Re-check file type immediately before deletion to prevent TOCTOU attacks
    // An attacker could replace a file with a symlink between scan and delete
    const stats = await lstat(path);
    
    if (stats.isSymbolicLink()) {
      // For symlinks, only remove the symlink itself, never follow it
      await unlink(path);
    } else {
      await rm(path, { recursive: true, force: true });
    }
    return true;
  } catch (error) {
    // Log the error for debugging but don't expose details to potential attackers
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT' && code !== 'EACCES') {
      console.error(`Failed to remove ${path}: ${code || 'unknown error'}`);
    }
    return false;
  }
}

export async function removeItems(
  items: CleanableItem[],
  dryRun = false,
  onProgress?: (current: number, total: number, item: CleanableItem) => void
): Promise<{ success: number; failed: number; freedSpace: number }> {
  let success = 0;
  let failed = 0;
  let freedSpace = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    onProgress?.(i + 1, items.length, item);

    const removed = await removeItem(item.path, dryRun);
    if (removed) {
      success++;
      freedSpace += item.size;
    } else {
      failed++;
    }
  }

  return { success, failed, freedSpace };
}







