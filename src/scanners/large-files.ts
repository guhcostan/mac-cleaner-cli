import { BaseScanner } from './base-scanner.js';
import { CATEGORIES, type ScanResult, type ScannerOptions, type CleanableItem } from '../types.js';
import { PATHS, SIZE_THRESHOLDS, walkFiles } from '../utils/index.js';
import { basename } from 'path';

export class LargeFilesScanner extends BaseScanner {
  category = CATEGORIES['large-files'];

  async scan(options?: ScannerOptions): Promise<ScanResult> {
    const minSize = options?.minSize ?? SIZE_THRESHOLDS.LARGE_FILE;
    const items: CleanableItem[] = [];

    const searchPaths = [PATHS.downloads, PATHS.documents];

    for (const searchPath of searchPaths) {
      await walkFiles(searchPath, { maxDepth: 3 }, (filePath, stats) => {
        if (stats.size < minSize) return;
        items.push({
          path: filePath,
          size: stats.size,
          name: basename(filePath),
          isDirectory: false,
          modifiedAt: stats.mtime,
        });
      });
    }

    items.sort((a, b) => b.size - a.size);

    return this.createResult(items);
  }
}







