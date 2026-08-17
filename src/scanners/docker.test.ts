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

describe('DockerScanner', () => {
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

  it('should have correct category', () => {
    expect(scanner.category.id).toBe('docker');
    expect(scanner.category.name).toBe('Docker');
    expect(scanner.category.group).toBe('Development');
    expect(scanner.category.safetyLevel).toBe('safe');
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

  describe('clean', () => {
    const items = [
      { path: 'docker:images', size: 1000000000, name: 'Docker Images', isDirectory: false },
      { path: 'docker:containers', size: 500000000, name: 'Docker Containers', isDirectory: false },
    ];

    it('should clean with dry run without calling docker', async () => {
      const result = await scanner.clean(items, true);

      expect(result.cleanedItems).toBe(2);
      expect(result.freedSpace).toBe(1500000000);
      expect(result.errors).toHaveLength(0);
      expect(spawnCalls).toHaveLength(0);
    });

    it('should return error when docker binary not found during clean', async () => {
      const result = await scanner.clean(items.slice(0, 1), false);

      expect(result.cleanedItems).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('not found');
    });

    it('should prune without volumes and report the freed space', async () => {
      dockerInstalled();
      respond = () => ({ stdout: 'Total reclaimed space: 1.5GB' });

      const result = await scanner.clean(items, false);

      expect(spawnCalls).toEqual([{ command: DOCKER_BIN, args: ['system', 'prune', '-af'] }]);
      expect(result.cleanedItems).toBe(2);
      expect(result.freedSpace).toBe(1500000000);
      expect(result.errors).toHaveLength(0);
    });

    it('should report an error when the prune fails', async () => {
      dockerInstalled();
      respond = () => ({ code: 1, stderr: 'daemon is not running' });

      const result = await scanner.clean(items, false);

      expect(result.cleanedItems).toBe(0);
      expect(result.freedSpace).toBe(0);
      expect(result.errors[0]).toContain('Docker cleanup failed: daemon is not running');
    });

    it('should reuse the docker path discovered during scan', async () => {
      dockerInstalled();
      await scanner.scan();
      vi.mocked(access).mockRejectedValue(new Error('Not found'));

      const result = await scanner.clean(items, false);

      expect(result.errors).toHaveLength(0);
      expect(spawnCalls.at(-1)).toEqual({ command: DOCKER_BIN, args: ['system', 'prune', '-af'] });
    });
  });

  it('should parse docker size correctly', () => {
    const parseSize = (scanner as unknown as { parseDockerSize: (s: string) => number }).parseDockerSize.bind(scanner);

    expect(parseSize('1.5 GB')).toBe(1.5 * 1024 * 1024 * 1024);
    expect(parseSize('500 MB')).toBe(500 * 1024 * 1024);
    expect(parseSize('100 KB')).toBe(100 * 1024);
    expect(parseSize('100 kB')).toBe(100 * 1024);
    expect(parseSize('50 B')).toBe(50);
    expect(parseSize('1 TB')).toBe(1024 * 1024 * 1024 * 1024);
    expect(parseSize('invalid')).toBe(0);
  });
});
