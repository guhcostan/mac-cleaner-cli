import { spawn } from 'child_process';
import type { MaintenanceResult } from './dns-cache.js';

const TMUTIL = '/usr/bin/tmutil';

/**
 * Executes a command using spawn (safer than exec).
 */
function execCommand(command: string, args: string[], timeout = 30000): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      timeout,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data: Buffer) => {
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
 * Checks if we can run sudo without a password (non-interactive).
 */
async function canSudoWithoutPassword(): Promise<boolean> {
  try {
    await execCommand('sudo', ['-n', 'true']);
    return true;
  } catch {
    return false;
  }
}

/**
 * Deletes Time Machine local snapshots on macOS.
 *
 * Local snapshots are created automatically by Time Machine and can accumulate
 * to hundreds of gigabytes. They are safe to delete — macOS will recreate them
 * as needed once a backup drive is connected.
 *
 * Security notes:
 * - Uses spawn instead of exec to prevent command injection
 * - Snapshot date strings are validated against a strict regex before use
 * - Uses sudo -n (non-interactive) to avoid interactive password prompts
 */
export async function clearTimeMachineSnapshots(): Promise<MaintenanceResult> {
  const isRoot = process.getuid?.() === 0;

  // List all local snapshot dates
  let snapshotOutput: string;
  try {
    snapshotOutput = await execCommand(TMUTIL, ['listlocalsnapshotdates']);
  } catch {
    return {
      success: false,
      message: 'Failed to list Time Machine snapshots',
      error: 'tmutil not available or Time Machine is not configured on this Mac',
    };
  }

  // Snapshot dates have the format "2024-01-15-123456" — validate strictly
  const DATE_REGEX = /^\d{4}-\d{2}-\d{2}-\d{6}$/;
  const dates = snapshotOutput
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => DATE_REGEX.test(line));

  if (dates.length === 0) {
    return {
      success: true,
      message: 'No Time Machine local snapshots found',
    };
  }

  if (!isRoot) {
    const canSudo = await canSudoWithoutPassword();
    if (!canSudo) {
      return {
        success: false,
        message: `Found ${dates.length} snapshot(s) but cannot delete without privileges`,
        error: 'Run with sudo: sudo mac-cleaner-cli maintenance --timemachine',
        requiresSudo: true,
      };
    }
  }

  const errors: string[] = [];
  for (const date of dates) {
    try {
      if (isRoot) {
        await execCommand(TMUTIL, ['deletelocalsnapshots', date], 60000);
      } else {
        await execCommand('sudo', ['-n', TMUTIL, 'deletelocalsnapshots', date], 60000);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`${date}: ${msg}`);
    }
  }

  const deleted = dates.length - errors.length;

  if (errors.length > 0 && deleted === 0) {
    return {
      success: false,
      message: 'Failed to delete Time Machine snapshots',
      error: errors[0],
    };
  }

  return {
    success: true,
    message:
      errors.length > 0
        ? `Deleted ${deleted}/${dates.length} Time Machine snapshots (${errors.length} error(s))`
        : `Deleted ${deleted} Time Machine snapshot${deleted !== 1 ? 's' : ''}`,
  };
}
