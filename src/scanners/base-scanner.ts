import type { Scanner, Category, ScanResult, CleanResult, CleanableItem, ScannerOptions } from '../types.js';
import { removeItems } from '../utils/fs.js';
import { backupItems } from '../utils/backup.js';

export abstract class BaseScanner implements Scanner {
  abstract category: Category;

  /**
   * Scanners that delete files can back them up first. Scanners that delegate
   * cleanup to an external tool (Docker, Homebrew) override this with `false`:
   * there is no file of ours to move, and promising a backup there would repeat
   * the very problem this module exists to fix.
   */
  readonly supportsBackup: boolean = true;

  abstract scan(options?: ScannerOptions): Promise<ScanResult>;

  async clean(items: CleanableItem[], dryRun = false, backupDir?: string): Promise<CleanResult> {
    if (backupDir) {
      const result = await backupItems(items, backupDir, dryRun);

      return {
        category: this.category,
        cleanedItems: result.success,
        // Nothing was freed: the files are still on disk, inside the backup.
        freedSpace: 0,
        backedUpSize: result.backedUpSize,
        backupDir,
        errors: result.failed > 0 ? [`Failed to back up ${result.failed} items (nothing was deleted for those)`] : [],
      };
    }

    const result = await removeItems(items, dryRun);

    const errors: string[] = [];
    if (result.failed > 0) {
      // Summarize failures by error code (e.g. "32 EPERM, 3 EACCES") so users can
      // tell permission issues apart from real failures without flooding the output
      const countsByCode = new Map<string, number>();
      for (const failure of result.failures) {
        countsByCode.set(failure.error, (countsByCode.get(failure.error) ?? 0) + 1);
      }
      const breakdown = [...countsByCode.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([code, count]) => `${count} ${code}`)
        .join(', ');
      errors.push(`Failed to remove ${result.failed} items (${breakdown})`);
    }

    return {
      category: this.category,
      cleanedItems: result.success,
      freedSpace: result.freedSpace,
      errors,
    };
  }

  protected createResult(items: CleanableItem[], error?: string): ScanResult {
    const totalSize = items.reduce((sum, item) => sum + item.size, 0);
    return {
      category: this.category,
      items,
      totalSize,
      error,
    };
  }
}
