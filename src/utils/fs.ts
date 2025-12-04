import { stat, readdir, rm, access } from 'fs/promises';
import { join } from 'path';
import type { CleanableItem } from '../types.js';

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
    const stats = await stat(path);
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
        if (entry.isFile()) {
          const stats = await stat(fullPath);
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
          const stats = await stat(fullPath);

          if (minAge) {
            const daysOld = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);
            if (daysOld < minAge) continue;
          }

          const size = entry.isDirectory() ? await getDirectorySize(fullPath) : stats.size;

          if (minSize && size < minSize) continue;

          items.push({
            path: fullPath,
            size,
            name: entry.name,
            isDirectory: entry.isDirectory(),
            modifiedAt: stats.mtime,
          });

          if (recursive && entry.isDirectory()) {
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
        const stats = await stat(fullPath);
        const size = entry.isDirectory() ? await getDirectorySize(fullPath) : stats.size;

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

export async function removeItem(path: string, dryRun = false): Promise<boolean> {
  if (dryRun) {
    return true;
  }

  try {
    await rm(path, { recursive: true, force: true });
    return true;
  } catch {
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




