import { BaseScanner } from './base-scanner.js';
import { CATEGORIES, type ScanResult, type ScannerOptions } from '../types.js';
import { PATHS, collectDirectoryItems } from '../utils/index.js';

export class TrashScanner extends BaseScanner {
  category = CATEGORIES['trash'];

  async scan(_options?: ScannerOptions): Promise<ScanResult> {
    const items = await collectDirectoryItems([PATHS.trash]);

    return this.createResult(items);
  }
}







