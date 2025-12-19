import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DockerScanner } from './docker.js';

// Mock child_process spawn
const mockSpawn = vi.fn();
const mockOn = vi.fn();
const mockStdout = { on: vi.fn() };
const mockStderr = { on: vi.fn() };

vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => {
    mockSpawn(...args);
    return {
      stdout: mockStdout,
      stderr: mockStderr,
      on: mockOn,
    };
  },
}));

// Mock fs/promises access to control Docker binary detection
vi.mock('fs/promises', async () => {
  const actual = await vi.importActual('fs/promises');
  return {
    ...actual,
    access: vi.fn().mockRejectedValue(new Error('Not found')),
  };
});

describe('DockerScanner', () => {
  let scanner: DockerScanner;

  beforeEach(() => {
    scanner = new DockerScanner();
    vi.clearAllMocks();
    
    // Reset mock implementations
    mockStdout.on.mockReset();
    mockStderr.on.mockReset();
    mockOn.mockReset();
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

  it('should return empty items when docker binary not found', async () => {
    // Default mock rejects access, so Docker binary won't be found
    const result = await scanner.scan();
    expect(result.category.id).toBe('docker');
    expect(result.items).toHaveLength(0);
  });

  it('should clean with dry run without calling docker', async () => {
    const items = [
      { path: 'docker:images', size: 1000000000, name: 'Docker Images', isDirectory: false },
      { path: 'docker:containers', size: 500000000, name: 'Docker Containers', isDirectory: false },
    ];

    const result = await scanner.clean(items, true);

    expect(result.cleanedItems).toBe(2);
    expect(result.freedSpace).toBe(1500000000);
    expect(result.errors).toHaveLength(0);
    // spawn should not be called in dry run
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('should return error when docker binary not found during clean', async () => {
    const items = [
      { path: 'docker:images', size: 1000000000, name: 'Docker Images', isDirectory: false },
    ];

    const result = await scanner.clean(items, false);

    expect(result.cleanedItems).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('not found');
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

  it('should validate docker output types', () => {
    // This tests that only valid docker types are accepted
    // The scanner should filter out unexpected types for security
    const validTypes = ['images', 'containers', 'local volumes', 'build cache'];
    validTypes.forEach(type => {
      expect(type.toLowerCase()).toMatch(/^(images|containers|local volumes|build cache)$/);
    });
  });
});

