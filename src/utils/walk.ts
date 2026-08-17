import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import type { Stats } from 'fs';

export interface WalkFilesOptions {
  maxDepth: number;
  includeHidden?: boolean;
}

/**
 * Depth-limited recursive file walk. Unreadable directories and entries are
 * skipped, so callers never have to handle permission errors themselves.
 */
export async function walkFiles(
  root: string,
  options: WalkFilesOptions,
  onFile: (filePath: string, stats: Stats) => void | Promise<void>
): Promise<void> {
  const { maxDepth, includeHidden = false } = options;

  const visit = async (dir: string, depth: number): Promise<void> => {
    if (depth > maxDepth) return;

    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!includeHidden && entry.name.startsWith('.')) continue;

      const fullPath = join(dir, entry.name);

      try {
        if (entry.isFile()) {
          await onFile(fullPath, await stat(fullPath));
        } else if (entry.isDirectory()) {
          await visit(fullPath, depth + 1);
        }
      } catch {
        continue;
      }
    }
  };

  await visit(root, 0);
}
