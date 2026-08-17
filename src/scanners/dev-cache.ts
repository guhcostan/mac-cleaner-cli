import { BaseScanner } from './base-scanner.js';
import { CATEGORIES, type ScanResult, type ScannerOptions, type CleanableItem } from '../types.js';
import { PATHS, collectDirectoryItems, createPathItem } from '../utils/index.js';

export class DevCacheScanner extends BaseScanner {
  category = CATEGORIES['dev-cache'];

  async scan(_options?: ScannerOptions): Promise<ScanResult> {
    const items: CleanableItem[] = [];

    const devPaths = [
      { name: 'npm cache', path: PATHS.npmCache },
      { name: 'Yarn cache', path: PATHS.yarnCache },
      { name: 'pnpm store', path: PATHS.pnpmCache },
      { name: 'pip cache', path: PATHS.pipCache },
      { name: 'CocoaPods cache', path: PATHS.cocoapodsCache },
      { name: 'Gradle cache', path: PATHS.gradleCache },
      { name: 'Cargo cache', path: PATHS.cargoCache },
    ];

    for (const dev of devPaths) {
      const item = await createPathItem(dev.path, dev.name, { skipEmpty: true });
      if (item) {
        items.push(item);
      }
    }

    const xcodeItems = await collectDirectoryItems([PATHS.xcodeDerivedData]);
    for (const item of xcodeItems) {
      items.push({
        ...item,
        name: `Xcode: ${item.name}`,
      });
    }

    const archivesItem = await createPathItem(PATHS.xcodeArchives, 'Xcode Archives', {
      skipEmpty: true,
    });
    if (archivesItem) {
      items.push(archivesItem);
    }

    return this.createResult(items);
  }
}







