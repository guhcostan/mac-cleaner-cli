import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import { clearTimeMachineSnapshots, listTimeMachineSnapshotDates } from './timemachine.js';

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

interface FakeProcess extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
}

/**
 * Queues one fake child process per expected spawn call. Each entry either
 * resolves with stdout (code 0) or fails with the given code/stderr.
 */
function queueSpawns(runs: { stdout?: string; stderr?: string; code?: number | null }[]): void {
  const exitCode = (run: { code?: number | null }) => ('code' in run ? run.code : 0);

  let call = 0;
  vi.mocked(spawn).mockImplementation((() => {
    const run = runs[Math.min(call, runs.length - 1)];
    call++;

    const proc = new EventEmitter() as FakeProcess;
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();

    setImmediate(() => {
      if (run.stdout) {
        proc.stdout.emit('data', Buffer.from(run.stdout));
      }
      if (run.stderr) {
        proc.stderr.emit('data', Buffer.from(run.stderr));
      }
      const code = exitCode(run);
      proc.emit('close', code, code === null ? 'SIGTERM' : null);
    });

    return proc;
  }) as unknown as typeof spawn);
}

const SNAPSHOT_OUTPUT = [
  'Snapshot dates for all disks:',
  '2024-01-15-123456',
  '2024-01-16-010203',
  '',
].join('\n');

describe('listTimeMachineSnapshotDates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });


  it('parses snapshot dates and skips the header line', async () => {
    queueSpawns([{ stdout: SNAPSHOT_OUTPUT }]);

    const result = await listTimeMachineSnapshotDates();

    expect(result.error).toBeUndefined();
    expect(result.dates).toEqual(['2024-01-15-123456', '2024-01-16-010203']);
  });

  it('returns no dates and no error when there are no snapshots', async () => {
    queueSpawns([{ stdout: 'Snapshot dates for all disks:\n' }]);

    const result = await listTimeMachineSnapshotDates();

    expect(result.dates).toEqual([]);
    expect(result.error).toBeUndefined();
  });

  it('reports a parse error instead of claiming there are no snapshots', async () => {
    queueSpawns([{ stdout: 'Datas de snapshot\n15/01/2024 12:34\n' }]);

    const result = await listTimeMachineSnapshotDates();

    expect(result.dates).toEqual([]);
    expect(result.error).toContain('Could not parse tmutil output');
  });

  it('reports an error when tmutil is unavailable', async () => {
    queueSpawns([{ code: 1, stderr: 'command not found' }]);

    const result = await listTimeMachineSnapshotDates();

    expect(result.dates).toEqual([]);
    expect(result.error).toContain('tmutil not available');
  });
});

describe('clearTimeMachineSnapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Exercise the unprivileged path regardless of who runs the suite
    vi.spyOn(process, 'getuid').mockReturnValue(501);
  });

  it('does not spawn anything in dry-run mode', async () => {
    const result = await clearTimeMachineSnapshots({
      dates: ['2024-01-15-123456', '2024-01-16-010203'],
      dryRun: true,
    });

    expect(spawn).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.message).toContain('[DRY RUN]');
    expect(result.message).toContain('2 Time Machine snapshots');
  });

  it('ignores dates that do not match the expected format', async () => {
    const result = await clearTimeMachineSnapshots({
      dates: ['; rm -rf /', '2024-01-15'],
    });

    expect(spawn).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: true,
      message: 'No Time Machine local snapshots found',
    });
  });

  it('deletes each snapshot through sudo -n and reports the count', async () => {
    queueSpawns([{ stdout: SNAPSHOT_OUTPUT }, { stdout: '' }, { stdout: '' }]);

    const result = await clearTimeMachineSnapshots({
      dates: ['2024-01-15-123456', '2024-01-16-010203'],
    });

    expect(result.success).toBe(true);
    expect(result.message).toBe('Deleted 2 Time Machine snapshots');

    const deleteCalls = vi
      .mocked(spawn)
      .mock.calls.filter((call) => (call[1] as string[])?.includes('deletelocalsnapshots'));
    expect(deleteCalls).toHaveLength(2);
    expect(deleteCalls[0][1]).toEqual([
      '-n',
      '/usr/bin/tmutil',
      'deletelocalsnapshots',
      '2024-01-15-123456',
    ]);
  });

  it('asks for sudo when tmutil cannot be run non-interactively', async () => {
    queueSpawns([{ code: 1, stderr: 'sudo: a password is required' }]);

    const result = await clearTimeMachineSnapshots({ dates: ['2024-01-15-123456'] });

    expect(result.success).toBe(false);
    expect(result.requiresSudo).toBe(true);
    expect(result.error).toContain('sudo mac-cleaner-cli maintenance --timemachine');
  });

  it('reports partial failures', async () => {
    queueSpawns([
      { stdout: SNAPSHOT_OUTPUT },
      { stdout: '' },
      { code: 1, stderr: 'snapshot busy' },
    ]);

    const result = await clearTimeMachineSnapshots({
      dates: ['2024-01-15-123456', '2024-01-16-010203'],
    });

    expect(result.success).toBe(true);
    expect(result.message).toBe('Deleted 1/2 Time Machine snapshots (1 error(s))');
  });

  it('fails with a timeout message when the process is killed', async () => {
    queueSpawns([{ stdout: SNAPSHOT_OUTPUT }, { code: null }]);

    const result = await clearTimeMachineSnapshots({ dates: ['2024-01-15-123456'] });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Timed out');
  });

  it('lists snapshots itself when no dates are provided', async () => {
    queueSpawns([{ stdout: SNAPSHOT_OUTPUT }, { stdout: SNAPSHOT_OUTPUT }, { stdout: '' }, { stdout: '' }]);

    const result = await clearTimeMachineSnapshots();

    expect(result.success).toBe(true);
    expect(result.message).toBe('Deleted 2 Time Machine snapshots');
  });
});
