import { BaseScanner } from './base-scanner.js';
import { CATEGORIES, type ScanResult, type ScannerOptions, type CleanableItem, type CleanResult } from '../types.js';
import { createPathItem, execCommand, findExecutable, sumItemSizes } from '../utils/index.js';
import { homedir } from 'os';
import { join, resolve } from 'path';

/**
 * Known safe Homebrew binary locations.
 */
const BREW_PATHS = [
  '/opt/homebrew/bin/brew',      // Apple Silicon
  '/usr/local/bin/brew',          // Intel
  '/home/linuxbrew/.linuxbrew/bin/brew', // Linux
];

/**
 * Expected cache path prefixes for Homebrew.
 * Used to validate the cache path returned by brew --cache.
 */
const EXPECTED_CACHE_PREFIXES = [
  join(homedir(), 'Library', 'Caches', 'Homebrew'),
  '/opt/homebrew/Caches',
  '/usr/local/Caches',
];

/**
 * Finds the Homebrew binary in known safe locations.
 */
function findBrewBinary(): Promise<string | null> {
  return findExecutable(BREW_PATHS);
}

export class HomebrewScanner extends BaseScanner {
  category = CATEGORIES['homebrew'];
  private brewPath: string | null = null;

  async scan(_options?: ScannerOptions): Promise<ScanResult> {
    const items: CleanableItem[] = [];

    try {
      // Find Homebrew binary in safe locations
      this.brewPath = await findBrewBinary();
      if (!this.brewPath) {
        return this.createResult(items);
      }

      const cachePath = await execCommand(this.brewPath, ['--cache']);
      const brewCache = cachePath.trim();

      // Security: validate the cache path is in an expected location
      const resolvedCache = resolve(brewCache);
      const isValidCache = EXPECTED_CACHE_PREFIXES.some(prefix => 
        resolvedCache.startsWith(prefix + '/') || resolvedCache === prefix
      );

      if (!isValidCache) {
        console.warn(`Unexpected Homebrew cache location: ${brewCache}`);
        return this.createResult(items);
      }

      const item = await createPathItem(brewCache, 'Homebrew Download Cache', { skipEmpty: true });
      if (item) {
        items.push(item);
      }
    } catch {
      // Homebrew may not be installed
    }

    return this.createResult(items);
  }

  async clean(items: CleanableItem[], dryRun = false): Promise<CleanResult> {
    if (dryRun) {
      return {
        category: this.category,
        cleanedItems: items.length,
        freedSpace: sumItemSizes(items),
        errors: [],
      };
    }

    // Ensure we have a valid brew path
    if (!this.brewPath) {
      this.brewPath = await findBrewBinary();
    }

    if (!this.brewPath) {
      return super.clean(items, dryRun);
    }

    let brewCache: string | null = null;
    try {
      const cachePath = await execCommand(this.brewPath, ['--cache']);
      brewCache = cachePath.trim();
    } catch {
      // Ignore - fall back to direct deletion
    }

    const selectedBrewCacheRoot = brewCache ? items.some((item) => item.path === brewCache) : false;
    if (!selectedBrewCacheRoot) {
      return super.clean(items, dryRun);
    }

    const errors: string[] = [];
    let freedSpace = 0;

    try {
      const beforeSize = sumItemSizes(items);
      await execCommand(this.brewPath, ['cleanup', '--prune=all']);
      freedSpace = beforeSize;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`Homebrew cleanup failed: ${message}`);
    }

    return {
      category: this.category,
      cleanedItems: errors.length === 0 ? items.length : 0,
      freedSpace,
      errors,
    };
  }
}






