import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HomebrewScanner } from './homebrew.js';

vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

vi.mock('util', () => ({
  promisify: vi.fn((fn) => fn),
}));

describe('HomebrewScanner', () => {
  let scanner: HomebrewScanner;

  beforeEach(() => {
    scanner = new HomebrewScanner();
    vi.clearAllMocks();
  });

  it('should have correct category', () => {
    expect(scanner.category.id).toBe('homebrew');
    expect(scanner.category.name).toBe('Homebrew Cache');
    expect(scanner.category.group).toBe('Development');
    expect(scanner.category.safetyLevel).toBe('safe');
  });

  it('should handle homebrew not installed', async () => {
    const { exec } = await import('child_process');
    vi.mocked(exec).mockImplementation((_cmd, callback) => {
      (callback as (err: Error | null, stdout: string, stderr: string) => void)(new Error('brew not found'), '', '');
      return {} as ReturnType<typeof exec>;
    });

    const result = await scanner.scan();

    expect(result.items).toHaveLength(0);
  });

  it('should clean using brew cleanup', async () => {
    const items = [
      { path: '/usr/local/Homebrew/cache', size: 1000, name: 'Homebrew Cache', isDirectory: true },
    ];

    const result = await scanner.clean(items, true);

    expect(result.category.id).toBe('homebrew');
    expect(result.cleanedItems).toBe(1);
    expect(result.freedSpace).toBe(1000);
  });
});

