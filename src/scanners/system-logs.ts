import { BaseScanner } from './base-scanner.js';
import { CATEGORIES, type ScanResult, type ScannerOptions } from '../types.js';
import { PATHS, exists, getDirectoryItems } from '../utils/index.js';

export class SystemLogsScanner extends BaseScanner {
  category = CATEGORIES['system-logs'];

  async scan(_options?: ScannerOptions): Promise<ScanResult> {
    const items = [];

    if (await exists(PATHS.userLogs)) {
      const userLogItems = await getDirectoryItems(PATHS.userLogs);
      items.push(...userLogItems);
    }

    if (await exists(PATHS.systemLogs)) {
      try {
        const systemLogItems = await getDirectoryItems(PATHS.systemLogs);
        items.push(...systemLogItems);
      } catch {
        // May not have permission to read system logs
      }
    }

    return this.createResult(items);
  }
}




