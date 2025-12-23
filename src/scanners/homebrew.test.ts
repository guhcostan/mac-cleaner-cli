import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { HomebrewScanner } from './homebrew.js';

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

// Mock fs/promises access to control brew binary detection
vi.mock('fs/promises', async () => {
  const actual = await vi.importActual('fs/promises');
  return {
    ...actual,
    access: vi.fn().mockRejectedValue(new Error('Not found')),
  };
});

describe('HomebrewScanner', () => {
  let scanner: HomebrewScanner;
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'mac-cleaner-brew-test-'));
    scanner = new HomebrewScanner();
    vi.clearAllMocks();
    
    mockStdout.on.mockReset();
    mockStderr.on.mockReset();
    mockOn.mockReset();
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('should have correct category', () => {
    expect(scanner.category.id).toBe('homebrew');
    expect(scanner.category.name).toBe('Homebrew Cache');
    expect(scanner.category.group).toBe('Development');
    expect(scanner.category.safetyLevel).toBe('safe');
  });

  it('should handle homebrew not installed', async () => {
    // access mock already rejects, so brew binary won't be found
    const result = await scanner.scan();
    expect(result.items).toHaveLength(0);
  });

  it('should return empty when brew binary not found in safe locations', async () => {
    const result = await scanner.scan();
    expect(result.items).toHaveLength(0);
    expect(result.category.id).toBe('homebrew');
  });

  it('should clean using brew cleanup with dry run', async () => {
    const items = [
      { path: '/usr/local/Homebrew/cache', size: 1000, name: 'Homebrew Cache', isDirectory: true },
    ];

    const result = await scanner.clean(items, true);

    expect(result.category.id).toBe('homebrew');
    expect(result.cleanedItems).toBe(1);
    expect(result.freedSpace).toBe(1000);
    // spawn should not be called in dry run
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('should return error when brew binary not found during clean', async () => {
    const items = [
      { path: '/usr/local/Homebrew/cache', size: 1000, name: 'Homebrew Cache', isDirectory: true },
    ];

    const result = await scanner.clean(items, false);

    expect(result.cleanedItems).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('not found');
  });

  it('should handle brew cleanup failure gracefully', async () => {
    const items = [
      { path: '/usr/local/Homebrew/cache', size: 1000, name: 'Homebrew Cache', isDirectory: true },
    ];

    const result = await scanner.clean(items, false);

    // Since we can't find brew binary, it should fail gracefully
    expect(result.cleanedItems).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

