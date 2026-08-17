import { BaseScanner } from './base-scanner.js';
import { CATEGORIES, type ScanResult, type ScannerOptions } from '../types.js';
import { PATHS, collectDirectoryItems } from '../utils/index.js';

export class SystemCacheScanner extends BaseScanner {
  category = CATEGORIES['system-cache'];

  async scan(_options?: ScannerOptions): Promise<ScanResult> {
    const items = await collectDirectoryItems([PATHS.userCaches]);

    return this.createResult(items);
  }
}







