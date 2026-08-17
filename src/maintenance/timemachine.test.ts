import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { clearTimeMachineSnapshots } from './timemachine.js';

interface FakeProcess {
  stdout?: string;
  stderr?: string;
  code?: number;
  error?: Error;
}

const spawnCalls: Array<{ command: string; args: string[] }> = [];
let respond: (command: string, args: string[]) => FakeProcess;

vi.mock('child_process', () => ({
  spawn: (command: string, args: string[]) => {
    spawnCalls.push({ command, args });
    const result = respond(command, args);

    return {
      stdout: {
        on: (event: string, callback: (data: Buffer) => void) => {
          if (event === 'data' && result.stdout) {
            setTimeout(() => callback(Buffer.from(result.stdout as string)), 0);
          }
        },
      },
      stderr: {
        on: (event: string, callback: (data: Buffer) => void) => {
          if (event === 'data' && result.stderr) {
            setTimeout(() => callback(Buffer.from(result.stderr as string)), 0);
          }
        },
      },
      on: (event: string, callback: (arg?: number | Error) => void) => {
        if (event === 'error' && result.error) {
          setTimeout(() => callback(result.error), 0);
        }
        if (event === 'close' && !result.error) {
          setTimeout(() => callback(result.code ?? 0), 0);
        }
      },
    };
  },
}));

const SNAPSHOTS = 'Snapshot dates for all disks:\n2024-01-15-123456\n2024-01-16-123456\n';

describe('clearTimeMachineSnapshots', () => {
  beforeEach(() => {
    spawnCalls.length = 0;
    respond = () => ({ code: 0 });
    vi.spyOn(process, 'getuid').mockReturnValue(501);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should fail when tmutil is not available', async () => {
    respond = () => ({ code: 1, stderr: 'command not found' });

    const result = await clearTimeMachineSnapshots();

    expect(result.success).toBe(false);
    expect(result.message).toContain('Failed to list');
    expect(result.error).toContain('tmutil not available');
  });

  it('should succeed without deleting when there are no snapshots', async () => {
    respond = () => ({ stdout: 'Snapshot dates for all disks:\n' });

    const result = await clearTimeMachineSnapshots();

    expect(result).toEqual({
      success: true,
      message: 'No Time Machine local snapshots found',
    });
    expect(spawnCalls).toHaveLength(1);
  });

  it('should ignore lines that are not valid snapshot dates', async () => {
    respond = () => ({ stdout: 'not-a-date\n2024-13\n$(rm -rf /)\n' });

    const result = await clearTimeMachineSnapshots();

    expect(result.message).toBe('No Time Machine local snapshots found');
  });

  it('should require sudo when not root and sudo needs a password', async () => {
    respond = (command) => {
      if (command === 'sudo') return { code: 1, stderr: 'a password is required' };
      return { stdout: SNAPSHOTS };
    };

    const result = await clearTimeMachineSnapshots();

    expect(result.success).toBe(false);
    expect(result.message).toContain('Found 2 snapshot(s)');
    expect(result.requiresSudo).toBe(true);
  });

  it('should delete each snapshot through sudo when passwordless sudo works', async () => {
    respond = () => ({ stdout: SNAPSHOTS });

    const result = await clearTimeMachineSnapshots();

    expect(result).toEqual({
      success: true,
      message: 'Deleted 2 Time Machine snapshots',
    });
    expect(spawnCalls.slice(2).map((call) => call.args)).toEqual([
      ['-n', '/usr/bin/tmutil', 'deletelocalsnapshots', '2024-01-15-123456'],
      ['-n', '/usr/bin/tmutil', 'deletelocalsnapshots', '2024-01-16-123456'],
    ]);
  });

  it('should delete snapshots directly when running as root', async () => {
    vi.spyOn(process, 'getuid').mockReturnValue(0);
    respond = () => ({ stdout: '2024-01-15-123456\n' });

    const result = await clearTimeMachineSnapshots();

    expect(result).toEqual({
      success: true,
      message: 'Deleted 1 Time Machine snapshot',
    });
    expect(spawnCalls.map((call) => call.command)).toEqual(['/usr/bin/tmutil', '/usr/bin/tmutil']);
  });

  it('should report a partial success when some deletions fail', async () => {
    vi.spyOn(process, 'getuid').mockReturnValue(0);
    respond = (_command, args) => {
      if (args.includes('2024-01-16-123456')) return { code: 1, stderr: 'busy' };
      if (args.includes('deletelocalsnapshots')) return { code: 0 };
      return { stdout: SNAPSHOTS };
    };

    const result = await clearTimeMachineSnapshots();

    expect(result.success).toBe(true);
    expect(result.message).toBe('Deleted 1/2 Time Machine snapshots (1 error(s))');
  });

  it('should fail when every deletion fails', async () => {
    vi.spyOn(process, 'getuid').mockReturnValue(0);
    respond = (_command, args) => {
      if (args.includes('deletelocalsnapshots')) return { code: 1, stderr: 'busy' };
      return { stdout: SNAPSHOTS };
    };

    const result = await clearTimeMachineSnapshots();

    expect(result.success).toBe(false);
    expect(result.message).toBe('Failed to delete Time Machine snapshots');
    expect(result.error).toContain('2024-01-15-123456: busy');
  });

  it('should surface spawn errors while deleting', async () => {
    vi.spyOn(process, 'getuid').mockReturnValue(0);
    respond = (_command, args) => {
      if (args.includes('deletelocalsnapshots')) return { error: new Error('spawn ENOENT') };
      return { stdout: '2024-01-15-123456\n' };
    };

    const result = await clearTimeMachineSnapshots();

    expect(result.success).toBe(false);
    expect(result.error).toContain('spawn ENOENT');
  });
});
