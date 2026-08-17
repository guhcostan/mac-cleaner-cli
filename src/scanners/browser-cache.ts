import { BaseScanner } from './base-scanner.js';
import { CATEGORIES, type ScanResult, type ScannerOptions, type CleanableItem } from '../types.js';
import { PATHS, createPathItem } from '../utils/index.js';

export class BrowserCacheScanner extends BaseScanner {
  category = CATEGORIES['browser-cache'];

  async scan(_options?: ScannerOptions): Promise<ScanResult> {
    const items: CleanableItem[] = [];

    const browserPaths = [
      { name: 'Google Chrome', path: PATHS.chromeCache },
      { name: 'Safari', path: PATHS.safariCache },
      { name: 'Firefox', path: PATHS.firefoxProfiles },
      { name: 'Arc', path: PATHS.arcCache },
    ];

    for (const browser of browserPaths) {
      const item = await createPathItem(browser.path, `${browser.name} Cache`);
      if (item) {
        items.push(item);
      }
    }

    return this.createResult(items);
  }
}

