import { BaseScanner } from './base-scanner.js';
import { CATEGORIES, type ScanResult, type ScannerOptions, type CleanableItem, type CleanResult } from '../types.js';
import { exists, getSize } from '../utils/index.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { stat } from 'fs/promises';

const execAsync = promisify(exec);

export class HomebrewScanner extends BaseScanner {
  category = CATEGORIES['homebrew'];

  async scan(_options?: ScannerOptions): Promise<ScanResult> {
    const items: CleanableItem[] = [];

    try {
      const { stdout: cachePath } = await execAsync('brew --cache');
      const brewCache = cachePath.trim();

      if (await exists(brewCache)) {
        const size = await getSize(brewCache);
        if (size > 0) {
          const stats = await stat(brewCache);
          items.push({
            path: brewCache,
            size,
            name: 'Homebrew Download Cache',
            isDirectory: true,
            modifiedAt: stats.mtime,
          });
        }
      }
    } catch {
      // Homebrew may not be installed
    }

    return this.createResult(items);
  }

  async clean(items: CleanableItem[], dryRun = false): Promise<CleanResult> {
    if (dryRun) {
      return {
        category: this.category,
        cleanedItems: items.length,
        freedSpace: items.reduce((sum, item) => sum + item.size, 0),
        errors: [],
      };
    }

    const errors: string[] = [];
    let freedSpace = 0;

    try {
      const beforeSize = items.reduce((sum, item) => sum + item.size, 0);
      await execAsync('brew cleanup --prune=all');
      freedSpace = beforeSize;
    } catch (error) {
      errors.push(`Homebrew cleanup failed: ${error}`);
    }

    return {
      category: this.category,
      cleanedItems: errors.length === 0 ? items.length : 0,
      freedSpace,
      errors,
    };
  }
}




