import { BaseScanner } from './base-scanner.js';
import { CATEGORIES, type ScanResult, type ScannerOptions } from '../types.js';
import { PATHS, exists, getDirectoryItems } from '../utils/index.js';
import { readdir } from 'fs/promises';
import { join } from 'path';

export class TempFilesScanner extends BaseScanner {
  category = CATEGORIES['temp-files'];

  async scan(_options?: ScannerOptions): Promise<ScanResult> {
    const items = [];

    if (await exists(PATHS.tmp)) {
      const tmpItems = await getDirectoryItems(PATHS.tmp);
      items.push(...tmpItems);
    }

    if (await exists(PATHS.varFolders)) {
      try {
        const varFolderItems = await this.scanVarFolders();
        items.push(...varFolderItems);
      } catch {
        // May not have permission
      }
    }

    return this.createResult(items);
  }

  private async scanVarFolders() {
    const items = [];

    try {
      const level1 = await readdir(PATHS.varFolders);
      for (const dir1 of level1) {
        const path1 = join(PATHS.varFolders, dir1);
        try {
          const level2 = await readdir(path1);
          for (const dir2 of level2) {
            const tempPath = join(path1, dir2, 'T');
            if (await exists(tempPath)) {
              const tempItems = await getDirectoryItems(tempPath);
              items.push(...tempItems);
            }
          }
        } catch {
          continue;
        }
      }
    } catch {
      // Ignore errors
    }

    return items;
  }
}




