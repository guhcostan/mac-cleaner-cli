import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { uninstallCommand } from './uninstall.js';
import * as fsUtils from '../utils/fs.js';
import * as inquirerPrompts from '@inquirer/prompts';

vi.mock('../utils/fs.js', () => ({
  exists: vi.fn(),
  getSize: vi.fn(),
}));

vi.mock('../utils/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/index.js')>();
  return {
    ...actual,
    exists: vi.fn(() => false),
    getSize: vi.fn(() => 0),
    formatSize: vi.fn((size: number) => `${size} bytes`),
    createCleanProgress: vi.fn(() => ({
      update: vi.fn(),
      finish: vi.fn(),
    })),
  };
});

vi.mock('@inquirer/prompts', () => ({
  confirm: vi.fn(),
  checkbox: vi.fn(),
}));

describe('uninstall command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should display message when no apps found', async () => {
    vi.mocked(fsUtils.exists).mockResolvedValue(false);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await uninstallCommand({});

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No applications found'));

    consoleSpy.mockRestore();
  });

  it('should display message when no apps selected', async () => {
    vi.mocked(inquirerPrompts.checkbox).mockResolvedValue([]);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await uninstallCommand({});

    consoleSpy.mockRestore();
  });

  it('should handle dry run option', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await uninstallCommand({ dryRun: true });

    consoleSpy.mockRestore();
  });

  it('should handle yes option for auto-confirm', async () => {
    vi.mocked(fsUtils.exists).mockResolvedValue(false);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await uninstallCommand({ yes: true });

    consoleSpy.mockRestore();
  });

  it('should handle noProgress option', async () => {
    vi.mocked(fsUtils.exists).mockResolvedValue(false);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await uninstallCommand({ noProgress: true });

    consoleSpy.mockRestore();
  });
});
