import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { freePurgeableSpace } from './purgeable.js';

interface FakeProcess {
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
      stdout: { on: () => undefined },
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

const PURGE = '/usr/sbin/purge';

describe('freePurgeableSpace', () => {
  beforeEach(() => {
    spawnCalls.length = 0;
    respond = () => ({ code: 0 });
    vi.spyOn(process, 'getuid').mockReturnValue(501);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should run purge directly when running as root', async () => {
    vi.spyOn(process, 'getuid').mockReturnValue(0);

    const result = await freePurgeableSpace();

    expect(result).toEqual({
      success: true,
      message: 'Purgeable space freed successfully',
    });
    expect(spawnCalls).toEqual([{ command: PURGE, args: [] }]);
  });

  it('should run purge through non-interactive sudo when not root', async () => {
    const result = await freePurgeableSpace();

    expect(result.success).toBe(true);
    expect(spawnCalls).toEqual([{ command: '/usr/bin/sudo', args: ['-n', PURGE] }]);
  });

  it('should fall back to running purge without sudo', async () => {
    respond = (command) => {
      if (command === '/usr/bin/sudo') return { code: 1, stderr: 'a password is required' };
      return { code: 0 };
    };

    const result = await freePurgeableSpace();

    expect(result.success).toBe(true);
    expect(spawnCalls.map((call) => call.command)).toEqual(['/usr/bin/sudo', PURGE]);
  });

  it('should report that sudo is required when purge is not permitted', async () => {
    respond = () => ({ code: 1, stderr: 'purge: Operation not permitted' });

    const result = await freePurgeableSpace();

    expect(result.success).toBe(false);
    expect(result.message).toBe('Failed to free purgeable space');
    expect(result.requiresSudo).toBe(true);
    expect(result.error).toContain('sudo mac-cleaner-cli maintenance --purgeable');
  });

  it('should report that sudo is required on permission denied', async () => {
    respond = () => ({ code: 1, stderr: 'Permission denied' });

    const result = await freePurgeableSpace();

    expect(result.requiresSudo).toBe(true);
  });

  it('should surface other failures verbatim', async () => {
    respond = () => ({ code: 127, stderr: 'purge: command not found' });

    const result = await freePurgeableSpace();

    expect(result.success).toBe(false);
    expect(result.requiresSudo).toBe(false);
    expect(result.error).toBe('purge: command not found');
  });

  it('should surface spawn errors', async () => {
    respond = () => ({ error: new Error('spawn ENOENT') });

    const result = await freePurgeableSpace();

    expect(result.success).toBe(false);
    expect(result.error).toBe('spawn ENOENT');
  });
});
