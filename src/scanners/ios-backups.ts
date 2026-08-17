import { BaseScanner } from './base-scanner.js';
import { CATEGORIES, type ScanResult, type ScannerOptions } from '../types.js';
import { PATHS, collectDirectoryItems } from '../utils/index.js';

export class IosBackupsScanner extends BaseScanner {
  category = CATEGORIES['ios-backups'];

  async scan(_options?: ScannerOptions): Promise<ScanResult> {
    const backupItems = await collectDirectoryItems([PATHS.iosBackups]);
    const items = backupItems.map((item) => ({
      ...item,
      name: `iOS Backup: ${item.name.substring(0, 8)}...`,
    }));

    return this.createResult(items);
  }
}







