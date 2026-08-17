import { spawn } from 'child_process';
import type { MaintenanceResult } from './dns-cache.js';

const TMUTIL = '/usr/bin/tmutil';

// Snapshot dates have the format "2024-01-15-123456"
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}-\d{6}$/;

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

    proc.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
      if (code === 0) {
        resolve(stdout);
      } else if (code === null) {
        reject(new Error(stderr.trim() || `Timed out after ${timeout}ms (killed by ${signal ?? 'signal'})`));
      } else {
        reject(new Error(stderr.trim() || `Process exited with code ${code}`));
      }
    });

    proc.on('error', reject);
  });
}

function isRoot(): boolean {
  return process.getuid?.() === 0;
}

/**
 * Checks whether tmutil can be run through sudo without a password prompt.
 *
 * Probes the real command instead of `sudo -n true` so that a sudoers entry
 * scoped to tmutil (the recommended setup) is detected correctly.
 */
async function canSudoTmutil(): Promise<boolean> {
  try {
    await execCommand('sudo', ['-n', TMUTIL, 'listlocalsnapshotdates']);
    return true;
  } catch {
    return false;
  }
}

export interface SnapshotList {
  dates: string[];
  error?: string;
}

/**
 * Lists Time Machine local snapshot dates.
 *
 * Returns an `error` when tmutil is unavailable, or when it produced output
 * that contains no recognizable snapshot dates — the latter would otherwise be
 * indistinguishable from "there are no snapshots".
 */
export async function listTimeMachineSnapshotDates(): Promise<SnapshotList> {
  let output: string;
  try {
    output = await execCommand(TMUTIL, ['listlocalsnapshotdates']);
  } catch {
    return {
      dates: [],
      error: 'tmutil not available or Time Machine is not configured on this Mac',
    };
  }

  const lines = output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    // tmutil prints a header line such as "Snapshot dates for all disks:"
    .filter((line) => !line.endsWith(':'));

  const dates = lines.filter((line) => DATE_REGEX.test(line));

  if (dates.length === 0 && lines.length > 0) {
    return {
      dates: [],
      error: `Could not parse tmutil output (${lines.length} unrecognized line(s))`,
    };
  }

  return { dates };
}

export interface ClearSnapshotsOptions {
  /** Snapshot dates to delete. Listed automatically when omitted. */
  dates?: string[];
  /** Report what would be deleted without deleting anything. */
  dryRun?: boolean;
}

/**
 * Deletes Time Machine local snapshots on macOS.
 *
 * Local snapshots are created automatically by Time Machine and can accumulate
 * to hundreds of gigabytes. macOS recreates them as needed once a backup drive
 * is connected — but deleting them is irreversible, so callers are expected to
 * confirm with the user first (see `maintenanceCommand`).
 *
 * Security notes:
 * - Uses spawn instead of exec to prevent command injection
 * - Snapshot date strings are validated against a strict regex before use
 * - Uses sudo -n (non-interactive) to avoid interactive password prompts
 */
export async function clearTimeMachineSnapshots(
  options: ClearSnapshotsOptions = {}
): Promise<MaintenanceResult> {
  let dates = options.dates;

  if (!dates) {
    const listed = await listTimeMachineSnapshotDates();
    if (listed.error) {
      return {
        success: false,
        message: 'Failed to list Time Machine snapshots',
        error: listed.error,
      };
    }
    dates = listed.dates;
  }

  // Never pass unvalidated strings to tmutil, even when dates come from a caller
  dates = dates.filter((date) => DATE_REGEX.test(date));

  if (dates.length === 0) {
    return {
      success: true,
      message: 'No Time Machine local snapshots found',
    };
  }

  if (options.dryRun) {
    return {
      success: true,
      message: `[DRY RUN] Would delete ${dates.length} Time Machine snapshot${dates.length !== 1 ? 's' : ''}`,
    };
  }

  const root = isRoot();

  if (!root && !(await canSudoTmutil())) {
    return {
      success: false,
      message: `Found ${dates.length} snapshot(s) but cannot delete without privileges`,
      error: 'Run with sudo: sudo mac-cleaner-cli maintenance --timemachine',
      requiresSudo: true,
    };
  }

  const errors: string[] = [];
  for (const date of dates) {
    try {
      if (root) {
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
