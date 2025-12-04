import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DockerScanner } from './docker.js';
import * as childProcess from 'child_process';

vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

vi.mock('util', () => ({
  promisify: vi.fn((fn) => fn),
}));

describe('DockerScanner', () => {
  let scanner: DockerScanner;

  beforeEach(() => {
    scanner = new DockerScanner();
    vi.clearAllMocks();
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

  it('should handle docker not running', async () => {
    vi.mocked(childProcess.exec).mockImplementation((_cmd, callback) => {
      (callback as (err: Error | null, result: { stdout: string; stderr: string }) => void)(new Error('docker not running'), { stdout: '', stderr: '' });
      return {} as ReturnType<typeof childProcess.exec>;
    });

    const result = await scanner.scan();
    expect(result.category.id).toBe('docker');
    expect(result.items).toHaveLength(0);
  });

  it('should scan docker system when running', async () => {
    vi.mocked(childProcess.exec).mockImplementation((cmd, callback) => {
      if (typeof cmd === 'string' && cmd.includes('docker system df')) {
        const stdout = 'Images\t5.5GB\t2.1GB (38%)\nContainers\t1GB\t500MB (50%)\nVolumes\t2GB\t0B (0%)';
        (callback as (err: Error | null, result: { stdout: string; stderr: string }) => void)(null, { stdout, stderr: '' });
      }
      return {} as ReturnType<typeof childProcess.exec>;
    });

    const result = await scanner.scan();

    expect(result.items.length).toBeGreaterThanOrEqual(1);
  });

  it('should clean with dry run', async () => {
    const items = [
      { path: 'docker:images', size: 1000000000, name: 'Docker Images', isDirectory: false },
      { path: 'docker:containers', size: 500000000, name: 'Docker Containers', isDirectory: false },
    ];

    const result = await scanner.clean(items, true);

    expect(result.cleanedItems).toBe(2);
    expect(result.freedSpace).toBe(1500000000);
    expect(result.errors).toHaveLength(0);
  });

  it('should clean docker system successfully', async () => {
    vi.mocked(childProcess.exec).mockImplementation((_cmd, callback) => {
      (callback as (err: Error | null, result: { stdout: string; stderr: string }) => void)(null, { stdout: '', stderr: '' });
      return {} as ReturnType<typeof childProcess.exec>;
    });

    const items = [
      { path: 'docker:images', size: 1000000000, name: 'Docker Images', isDirectory: false },
    ];

    const result = await scanner.clean(items, false);

    expect(result.cleanedItems).toBe(1);
    expect(result.freedSpace).toBe(1000000000);
    expect(result.errors).toHaveLength(0);
  });

  it('should handle docker cleanup failure', async () => {
    vi.mocked(childProcess.exec).mockImplementation((_cmd, callback) => {
      (callback as (err: Error | null, result: { stdout: string; stderr: string }) => void)(new Error('prune failed'), { stdout: '', stderr: '' });
      return {} as ReturnType<typeof childProcess.exec>;
    });

    const items = [
      { path: 'docker:images', size: 1000000000, name: 'Docker Images', isDirectory: false },
    ];

    const result = await scanner.clean(items, false);

    expect(result.cleanedItems).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
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

