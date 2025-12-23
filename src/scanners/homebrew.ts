import { BaseScanner } from './base-scanner.js';
import { CATEGORIES, type ScanResult, type ScannerOptions, type CleanableItem, type CleanResult } from '../types.js';
import { exists, getSize } from '../utils/index.js';
import { spawn } from 'child_process';
import { stat, access } from 'fs/promises';
import { constants } from 'fs';
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
async function findBrewBinary(): Promise<string | null> {
  for (const path of BREW_PATHS) {
    try {
      await access(path, constants.X_OK);
      return path;
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Executes a command using spawn and returns stdout.
 */
function execCommand(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      timeout: 30000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr || `Process exited with code ${code}`));
      }
    });

    proc.on('error', reject);
  });
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

      if (await exists(brewCache)) {
        const size = await getSize(brewCache);
        if (size > 0) {
          const stats = await stat(brewCache);
          items.push({
            path: brewCache,
            size,
            name: 'Homebrew Download Cache',
            isDirectory: true,
            modifiedAt: stats.mtime,
          });
        }
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
        freedSpace: items.reduce((sum, item) => sum + item.size, 0),
        errors: [],
      };
    }

    let brewCache: string | null = null;
    try {
      const { stdout: cachePath } = await execAsync('brew --cache');
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
      // Ensure we have a valid brew path
      if (!this.brewPath) {
        this.brewPath = await findBrewBinary();
      }

      if (!this.brewPath) {
        errors.push('Homebrew binary not found in safe locations');
        return {
          category: this.category,
          cleanedItems: 0,
          freedSpace: 0,
          errors,
        };
      }

      const beforeSize = items.reduce((sum, item) => sum + item.size, 0);
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






