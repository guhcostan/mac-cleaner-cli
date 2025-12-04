import { BaseScanner } from './base-scanner.js';
import { CATEGORIES, type ScanResult, type ScannerOptions } from '../types.js';
import { PATHS, exists, getDirectoryItems } from '../utils/index.js';

export class TrashScanner extends BaseScanner {
  category = CATEGORIES['trash'];

  async scan(_options?: ScannerOptions): Promise<ScanResult> {
    const items = [];

    if (await exists(PATHS.trash)) {
      const trashItems = await getDirectoryItems(PATHS.trash);
      items.push(...trashItems);
    }

    return this.createResult(items);
  }
}




