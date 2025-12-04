import { BaseScanner } from './base-scanner.js';
import { CATEGORIES, type ScanResult, type ScannerOptions } from '../types.js';
import { PATHS, exists, getDirectoryItems } from '../utils/index.js';

export class SystemCacheScanner extends BaseScanner {
  category = CATEGORIES['system-cache'];

  async scan(_options?: ScannerOptions): Promise<ScanResult> {
    const items = [];

    if (await exists(PATHS.userCaches)) {
      const userCacheItems = await getDirectoryItems(PATHS.userCaches);
      items.push(...userCacheItems);
    }

    return this.createResult(items);
  }
}




