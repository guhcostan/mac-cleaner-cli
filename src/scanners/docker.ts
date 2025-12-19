import { BaseScanner } from './base-scanner.js';
import { CATEGORIES, type ScanResult, type ScannerOptions, type CleanableItem, type CleanResult } from '../types.js';
import { spawn } from 'child_process';
import { access } from 'fs/promises';
import { constants } from 'fs';

/**
 * Known safe Docker binary locations on macOS.
 * We check these in order to avoid $PATH manipulation attacks.
 */
const DOCKER_PATHS = [
  '/usr/local/bin/docker',
  '/opt/homebrew/bin/docker',
  '/Applications/Docker.app/Contents/Resources/bin/docker',
];

/**
 * Valid Docker resource types that we expect from `docker system df`.
 * Used to validate output and prevent injection.
 */
const VALID_DOCKER_TYPES = ['images', 'containers', 'local volumes', 'build cache'];

/**
 * Finds the Docker binary in known safe locations.
 */
async function findDockerBinary(): Promise<string | null> {
  for (const path of DOCKER_PATHS) {
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
 * Executes a command using spawn (safer than exec) and returns stdout.
 */
function execCommand(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      timeout: 30000, // 30 second timeout
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

export class DockerScanner extends BaseScanner {
  category = CATEGORIES['docker'];
  private dockerPath: string | null = null;

  async scan(_options?: ScannerOptions): Promise<ScanResult> {
    const items: CleanableItem[] = [];

    try {
      // Find Docker binary in safe locations
      this.dockerPath = await findDockerBinary();
      if (!this.dockerPath) {
        // Docker not found in safe locations
        return this.createResult(items);
      }

      const stdout = await execCommand(this.dockerPath, [
        'system', 'df', '--format', '{{.Type}}\t{{.Size}}\t{{.Reclaimable}}'
      ]);
      const lines = stdout.trim().split('\n');

      for (const line of lines) {
        const [type, , reclaimable] = line.split('\t');
        
        // Validate that the type is one we expect (security check)
        const normalizedType = type?.toLowerCase().trim();
        if (!normalizedType || !VALID_DOCKER_TYPES.includes(normalizedType)) {
          continue;
        }

        const reclaimableBytes = this.parseDockerSize(reclaimable);

        if (reclaimableBytes > 0) {
          items.push({
            path: `docker:${normalizedType.replace(/\s+/g, '-')}`,
            size: reclaimableBytes,
            name: `Docker ${type}`,
            isDirectory: false,
          });
        }
      }
    } catch {
      // Docker may not be installed or running
    }

    return this.createResult(items);
  }

  private parseDockerSize(sizeStr: string): number {
    const match = sizeStr.match(/([\d.]+)\s*(B|KB|MB|GB|TB|kB)/i);
    if (!match) return 0;

    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();

    const multipliers: Record<string, number> = {
      B: 1,
      KB: 1024,
      MB: 1024 * 1024,
      GB: 1024 * 1024 * 1024,
      TB: 1024 * 1024 * 1024 * 1024,
    };

    return value * (multipliers[unit] || 1);
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

    const errors: string[] = [];
    let freedSpace = 0;

    try {
      // Ensure we have a valid Docker path from the scan
      if (!this.dockerPath) {
        this.dockerPath = await findDockerBinary();
      }
      
      if (!this.dockerPath) {
        errors.push('Docker binary not found in safe locations');
        return {
          category: this.category,
          cleanedItems: 0,
          freedSpace: 0,
          errors,
        };
      }

      const beforeSize = items.reduce((sum, item) => sum + item.size, 0);
      
      // Use spawn with explicit arguments instead of exec
      // Note: We intentionally exclude --volumes to prevent accidental data loss
      // Users who want to clean volumes should do so manually
      await execCommand(this.dockerPath, ['system', 'prune', '-af']);
      
      freedSpace = beforeSize;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`Docker cleanup failed: ${message}`);
    }

    return {
      category: this.category,
      cleanedItems: errors.length === 0 ? items.length : 0,
      freedSpace,
      errors,
    };
  }
}

