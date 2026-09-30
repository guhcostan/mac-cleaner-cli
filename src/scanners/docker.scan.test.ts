// scan() tests, kept apart from docker.test.ts because they need a spawn mock
// that replays stdout/stderr/exit codes.
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DockerScanner } from './docker.js';

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

// Mock fs/promises access to control Docker binary detection
vi.mock('fs/promises', async () => {
  const actual = await vi.importActual<typeof import('fs/promises')>('fs/promises');
  return {
    ...actual,
    access: vi.fn().mockRejectedValue(new Error('Not found')),
  };
});

const { access } = await import('fs/promises');

const DOCKER_BIN = '/usr/local/bin/docker';

function dockerInstalled(): void {
  vi.mocked(access).mockImplementation(async (path) => {
    if (path === DOCKER_BIN) return undefined;
    throw new Error('Not found');
  });
}

const DF_OUTPUT = [
  'Images\t5.5GB\t2.5GB (45%)',
  'Containers\t100MB\t0B (0%)',
  'Local Volumes\t1GB\t512MB (50%)',
  'Build Cache\t3GB\t3GB (100%)',
].join('\n');

describe('DockerScanner scan', () => {
  let scanner: DockerScanner;

  beforeEach(() => {
    scanner = new DockerScanner();
    spawnCalls.length = 0;
    respond = () => ({ stdout: DF_OUTPUT });
    vi.mocked(access).mockRejectedValue(new Error('Not found'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('scan', () => {
    it('should return empty items when docker binary not found', async () => {
      const result = await scanner.scan();

      expect(result.category.id).toBe('docker');
      expect(result.items).toHaveLength(0);
      expect(spawnCalls).toHaveLength(0);
    });

    it('should report reclaimable space per resource type', async () => {
      dockerInstalled();

      const result = await scanner.scan();

      expect(spawnCalls).toEqual([
        {
          command: DOCKER_BIN,
          args: ['system', 'df', '--format', '{{.Type}}\t{{.Size}}\t{{.Reclaimable}}'],
        },
      ]);
      expect(result.items).toEqual([
        { path: 'docker:images', size: 2.5 * 1024 ** 3, name: 'Docker Images', isDirectory: false },
        { path: 'docker:local-volumes', size: 512 * 1024 ** 2, name: 'Docker Local Volumes', isDirectory: false },
        { path: 'docker:build-cache', size: 3 * 1024 ** 3, name: 'Docker Build Cache', isDirectory: false },
      ]);
      expect(result.totalSize).toBe(2.5 * 1024 ** 3 + 512 * 1024 ** 2 + 3 * 1024 ** 3);
    });

    it('should ignore unknown resource types', async () => {
      dockerInstalled();
      respond = () => ({ stdout: 'Malicious\t1GB\t1GB (100%)\n\t\t\nImages\t1GB\t1GB (100%)' });

      const result = await scanner.scan();

      expect(result.items).toEqual([
        { path: 'docker:images', size: 1024 ** 3, name: 'Docker Images', isDirectory: false },
      ]);
    });

    it('should return empty items when the docker daemon is not running', async () => {
      dockerInstalled();
      respond = () => ({ code: 1, stderr: 'Cannot connect to the Docker daemon' });

      const result = await scanner.scan();

      expect(result.items).toHaveLength(0);
    });
  });
});
