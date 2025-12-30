import { readdir, readFile, stat } from 'fs/promises';
import { join, isAbsolute } from 'path';
import { homedir } from 'os';
import { BaseScanner } from './base-scanner.js';
import { CATEGORIES, type CleanableItem, type ScanResult, type ScannerOptions } from '../types.js';
import { exists } from '../utils/index.js';

const SYSTEM_BINARY_PREFIXES = [
  '/usr/bin/',
  '/bin/',
  '/sbin/',
  '/usr/sbin/',
  '/usr/local/bin/',
  '/opt/homebrew/bin/',
];

export class LaunchAgentsScanner extends BaseScanner {
  category = CATEGORIES['launch-agents'];

  async scan(_options?: ScannerOptions): Promise<ScanResult> {
    const items: CleanableItem[] = [];
    const launchAgentsDir = join(homedir(), 'Library', 'LaunchAgents');

    // Check if directory exists
    if (!(await exists(launchAgentsDir))) {
      return this.createResult([]);
    }

    try {
      const files = await readdir(launchAgentsDir);
      const plistFiles = files.filter((file) => file.endsWith('.plist'));

      for (const plistFile of plistFiles) {
        const plistPath = join(launchAgentsDir, plistFile);

        try {
          // Parse plist to extract program path
          const programPath = await this.parsePlistForProgram(plistPath);

          if (!programPath) {
            // No program path found or malformed plist, skip
            continue;
          }

          // Skip relative paths (can't validate)
          if (!isAbsolute(programPath)) {
            continue;
          }

          // Skip system binaries
          if (this.isSystemBinary(programPath)) {
            continue;
          }

          // Check if the program path exists
          const isOrphaned = !(await exists(programPath));

          if (isOrphaned) {
            // Get plist file size and metadata
            const stats = await stat(plistPath);

            items.push({
              path: plistPath,
              size: stats.size,
              name: `${plistFile} → ${programPath} (missing)`,
              isDirectory: false,
              modifiedAt: stats.mtime,
            });
          }
        } catch (error) {
          // Error processing this plist, skip and continue
          continue;
        }
      }
    } catch (error) {
      return this.createResult([], `Failed to read LaunchAgents directory: ${error instanceof Error ? error.message : String(error)}`);
    }

    return this.createResult(items);
  }

  /**
   * Parses a plist file to extract the program path.
   * Looks for the "Program" key or the first element of "ProgramArguments" array.
   */
  private async parsePlistForProgram(plistPath: string): Promise<string | null> {
    try {
      const content = await readFile(plistPath, 'utf-8');

      // Try to extract Program key
      const programMatch = content.match(/<key>Program<\/key>\s*<string>([^<]+)<\/string>/);
      if (programMatch && programMatch[1]) {
        return programMatch[1].trim();
      }

      // Try to extract first element of ProgramArguments array
      const programArgsMatch = content.match(/<key>ProgramArguments<\/key>\s*<array>\s*<string>([^<]+)<\/string>/);
      if (programArgsMatch && programArgsMatch[1]) {
        return programArgsMatch[1].trim();
      }

      // No program path found
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Checks if a path is a system binary that should not be marked as orphaned.
   */
  private isSystemBinary(path: string): boolean {
    return SYSTEM_BINARY_PREFIXES.some((prefix) => path.startsWith(prefix));
  }
}
