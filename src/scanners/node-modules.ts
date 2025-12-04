import { BaseScanner } from './base-scanner.js';
import { CATEGORIES, type ScanResult, type ScannerOptions, type CleanableItem } from '../types.js';
import { exists, getSize } from '../utils/index.js';
import { readdir, stat, access } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

const DEFAULT_SEARCH_PATHS = [
  join(homedir(), 'Projects'),
  join(homedir(), 'Developer'),
  join(homedir(), 'Code'),
  join(homedir(), 'dev'),
  join(homedir(), 'workspace'),
  join(homedir(), 'repos'),
];

const DEFAULT_DAYS_OLD = 30;

export class NodeModulesScanner extends BaseScanner {
  category = CATEGORIES['node-modules'];

  async scan(options?: ScannerOptions): Promise<ScanResult> {
    const items: CleanableItem[] = [];
    const daysOld = options?.daysOld ?? DEFAULT_DAYS_OLD;

    for (const searchPath of DEFAULT_SEARCH_PATHS) {
      if (await exists(searchPath)) {
        const found = await this.findNodeModules(searchPath, daysOld, 4);
        items.push(...found);
      }
    }

    items.sort((a, b) => b.size - a.size);

    return this.createResult(items);
  }

  private async findNodeModules(
    dir: string,
    daysOld: number,
    maxDepth: number,
    currentDepth = 0
  ): Promise<CleanableItem[]> {
    const items: CleanableItem[] = [];

    if (currentDepth > maxDepth) return items;

    try {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith('.')) continue;

        const fullPath = join(dir, entry.name);

        if (entry.name === 'node_modules') {
          const parentDir = dir;
          const packageJsonPath = join(parentDir, 'package.json');

          try {
            await access(packageJsonPath);
            const parentStats = await stat(parentDir);
            const daysSinceModified = (Date.now() - parentStats.mtime.getTime()) / (1000 * 60 * 60 * 24);

            if (daysSinceModified >= daysOld) {
              const size = await getSize(fullPath);
              const stats = await stat(fullPath);

              items.push({
                path: fullPath,
                size,
                name: `${this.getProjectName(parentDir)} (${Math.floor(daysSinceModified)}d old)`,
                isDirectory: true,
                modifiedAt: stats.mtime,
              });
            }
          } catch {
            // No package.json or orphaned node_modules
            const size = await getSize(fullPath);
            if (size > 0) {
              const stats = await stat(fullPath);
              items.push({
                path: fullPath,
                size,
                name: `${this.getProjectName(parentDir)} (orphaned)`,
                isDirectory: true,
                modifiedAt: stats.mtime,
              });
            }
          }
        } else {
          const subItems = await this.findNodeModules(fullPath, daysOld, maxDepth, currentDepth + 1);
          items.push(...subItems);
        }
      }
    } catch {
      // Ignore permission errors
    }

    return items;
  }

  private getProjectName(projectPath: string): string {
    const parts = projectPath.split('/');
    return parts[parts.length - 1] || projectPath;
  }
}

