import { BaseScanner } from './base-scanner.js';
import { CATEGORIES, type ScanResult, type ScannerOptions } from '../types.js';
import { PATHS, exists, getDirectoryItems } from '../utils/index.js';

export class IosBackupsScanner extends BaseScanner {
  category = CATEGORIES['ios-backups'];

  async scan(_options?: ScannerOptions): Promise<ScanResult> {
    const items = [];

    if (await exists(PATHS.iosBackups)) {
      const backupItems = await getDirectoryItems(PATHS.iosBackups);
      for (const item of backupItems) {
        items.push({
          ...item,
          name: `iOS Backup: ${item.name.substring(0, 8)}...`,
        });
      }
    }

    return this.createResult(items);
  }
}




