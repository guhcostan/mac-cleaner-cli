import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushDnsCache } from './dns-cache.js';

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

describe('flushDnsCache', () => {
  beforeEach(() => {
    spawnCalls.length = 0;
    respond = () => ({ code: 0 });
    vi.spyOn(process, 'getuid').mockReturnValue(501);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should require sudo when not root and sudo needs a password', async () => {
    respond = () => ({ code: 1, stderr: 'a password is required' });

    const result = await flushDnsCache();

    expect(result).toEqual({
      success: false,
      message: 'DNS cache flush requires administrator privileges',
      error: 'Run with sudo: sudo mac-cleaner-cli maintenance --dns',
      requiresSudo: true,
    });
    expect(spawnCalls).toEqual([{ command: '/usr/bin/sudo', args: ['-n', '/usr/bin/true'] }]);
  });

  it('should flush the cache directly when running as root', async () => {
    vi.spyOn(process, 'getuid').mockReturnValue(0);

    const result = await flushDnsCache();

    expect(result).toEqual({ success: true, message: 'DNS cache flushed successfully' });
    expect(spawnCalls).toEqual([
      { command: '/usr/bin/dscacheutil', args: ['-flushcache'] },
      { command: '/usr/bin/killall', args: ['-HUP', 'mDNSResponder'] },
    ]);
  });

  it('should flush the cache through sudo when passwordless sudo works', async () => {
    const result = await flushDnsCache();

    expect(result.success).toBe(true);
    expect(spawnCalls).toEqual([
      { command: '/usr/bin/sudo', args: ['-n', '/usr/bin/true'] },
      { command: '/usr/bin/sudo', args: ['-n', '/usr/bin/dscacheutil', '-flushcache'] },
      { command: '/usr/bin/sudo', args: ['-n', '/usr/bin/killall', '-HUP', 'mDNSResponder'] },
    ]);
  });

  it('should report that sudo is required when the flush is not permitted', async () => {
    vi.spyOn(process, 'getuid').mockReturnValue(0);
    respond = () => ({ code: 1, stderr: 'dscacheutil: Operation not permitted' });

    const result = await flushDnsCache();

    expect(result.success).toBe(false);
    expect(result.message).toBe('Failed to flush DNS cache');
    expect(result.error).toBe('Run with sudo: sudo mac-cleaner-cli maintenance --dns');
    expect(result.requiresSudo).toBe(true);
  });

  it('should surface other failures verbatim', async () => {
    vi.spyOn(process, 'getuid').mockReturnValue(0);
    respond = () => ({ code: 1, stderr: 'mDNSResponder: no matching processes' });

    const result = await flushDnsCache();

    expect(result.success).toBe(false);
    expect(result.error).toBe('mDNSResponder: no matching processes');
    expect(result.requiresSudo).toBe(false);
  });

  it('should surface spawn errors', async () => {
    vi.spyOn(process, 'getuid').mockReturnValue(0);
    respond = () => ({ error: new Error('spawn ENOENT') });

    const result = await flushDnsCache();

    expect(result.success).toBe(false);
    expect(result.error).toBe('spawn ENOENT');
  });

  it('should fail when killall fails after a successful flush', async () => {
    vi.spyOn(process, 'getuid').mockReturnValue(0);
    respond = (command) => {
      if (command === '/usr/bin/killall') return { code: 1, stderr: 'killall failed' };
      return { code: 0 };
    };

    const result = await flushDnsCache();

    expect(result.success).toBe(false);
    expect(result.error).toBe('killall failed');
  });
});
