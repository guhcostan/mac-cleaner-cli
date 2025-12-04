import type { Scanner, Category, ScanResult, CleanResult, CleanableItem, ScannerOptions } from '../types.js';
import { removeItems } from '../utils/fs.js';

export abstract class BaseScanner implements Scanner {
  abstract category: Category;

  abstract scan(options?: ScannerOptions): Promise<ScanResult>;

  async clean(items: CleanableItem[], dryRun = false): Promise<CleanResult> {
    const result = await removeItems(items, dryRun);

    return {
      category: this.category,
      cleanedItems: result.success,
      freedSpace: result.freedSpace,
      errors: result.failed > 0 ? [`Failed to remove ${result.failed} items`] : [],
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




