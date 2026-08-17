import { spawn } from 'child_process';
import { access } from 'fs/promises';
import { constants } from 'fs';

export const DEFAULT_EXEC_TIMEOUT = 30_000;

/**
 * Executes a command using spawn (safer than exec, no shell involved) and
 * resolves with stdout. Rejects with stderr when the process exits non-zero.
 */
export function execCommand(
  command: string,
  args: string[],
  timeout = DEFAULT_EXEC_TIMEOUT
): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      timeout,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer | string) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data: Buffer | string) => {
      stderr += data.toString();
    });

    proc.on('close', (code: number | null) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr || `Process exited with code ${code}`));
      }
    });

    proc.on('error', reject);
  });
}

/**
 * Returns the first candidate that exists and is executable, or null.
 * Candidates are absolute paths so $PATH manipulation cannot redirect us.
 */
export async function findExecutable(candidates: readonly string[]): Promise<string | null> {
  for (const path of candidates) {
    try {
      await access(path, constants.X_OK);
      return path;
    } catch {
      continue;
    }
  }
  return null;
}
