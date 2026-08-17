import { BaseScanner } from './base-scanner.js';
import { CATEGORIES, type ScanResult, type ScannerOptions } from '../types.js';
import { PATHS, collectDirectoryItems } from '../utils/index.js';

export class SystemLogsScanner extends BaseScanner {
  category = CATEGORIES['system-logs'];

  async scan(_options?: ScannerOptions): Promise<ScanResult> {
    const items = await collectDirectoryItems([PATHS.userLogs, PATHS.systemLogs]);

    return this.createResult(items);
  }
}







