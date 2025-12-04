import { BaseScanner } from './base-scanner.js';
import { CATEGORIES, type ScanResult, type ScannerOptions, type CleanableItem } from '../types.js';
import { PATHS, exists, getSize } from '../utils/index.js';
import { readdir, stat } from 'fs/promises';
import { join } from 'path';

const KEEP_LANGUAGES = ['en', 'en_US', 'en_GB', 'pt', 'pt_BR', 'pt_PT', 'Base'];

export class LanguageFilesScanner extends BaseScanner {
  category = CATEGORIES['language-files'];

  async scan(_options?: ScannerOptions): Promise<ScanResult> {
    const items: CleanableItem[] = [];

    if (await exists(PATHS.applications)) {
      const apps = await readdir(PATHS.applications);

      for (const app of apps) {
        if (!app.endsWith('.app')) continue;

        const resourcesPath = join(PATHS.applications, app, 'Contents', 'Resources');

        if (await exists(resourcesPath)) {
          try {
            const resources = await readdir(resourcesPath);
            const lprojDirs = resources.filter(
              (r) => r.endsWith('.lproj') && !KEEP_LANGUAGES.includes(r.replace('.lproj', ''))
            );

            for (const lproj of lprojDirs) {
              const lprojPath = join(resourcesPath, lproj);
              try {
                const size = await getSize(lprojPath);
                const stats = await stat(lprojPath);
                items.push({
                  path: lprojPath,
                  size,
                  name: `${app}: ${lproj}`,
                  isDirectory: true,
                  modifiedAt: stats.mtime,
                });
              } catch {
                continue;
              }
            }
          } catch {
            continue;
          }
        }
      }
    }

    return this.createResult(items);
  }
}




