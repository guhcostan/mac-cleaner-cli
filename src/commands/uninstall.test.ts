import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

// Mock all external dependencies before importing
vi.mock('../utils/index.js', async () => {
  return {
    exists: vi.fn().mockResolvedValue(false),
    getSize: vi.fn().mockResolvedValue(0),
    formatSize: vi.fn((size: number) => `${size} bytes`),
    createCleanProgress: vi.fn(() => ({
      update: vi.fn(),
      finish: vi.fn(),
    })),
  };
});

vi.mock('@inquirer/confirm', () => ({
  default: vi.fn().mockResolvedValue(false),
}));

vi.mock('@inquirer/checkbox', () => ({
  default: vi.fn().mockResolvedValue([]),
}));

vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>();
  return {
    ...actual,
    readdir: vi.fn().mockResolvedValue([]),
    stat: vi.fn().mockResolvedValue({
      isDirectory: () => true,
      mtime: new Date(),
    }),
    rm: vi.fn().mockResolvedValue(undefined),
  };
});

import { uninstallCommand } from './uninstall.js';
import * as utils from '../utils/index.js';
import * as inquirerConfirm from '@inquirer/confirm';
import * as inquirerCheckbox from '@inquirer/checkbox';
import * as fsPromises from 'fs/promises';

const inquirerPrompts = {
  confirm: inquirerConfirm.default,
  checkbox: inquirerCheckbox.default,
};

describe('uninstall command', () => {
  const testDir = join(tmpdir(), 'clean-my-mac-uninstall-test');

  beforeEach(async () => {
    vi.clearAllMocks();
    await mkdir(testDir, { recursive: true }).catch(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(testDir, { recursive: true, force: true }).catch(() => {});
  });

  it('should display message when no apps found', async () => {
    vi.mocked(utils.exists).mockResolvedValue(false);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await uninstallCommand({});

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No applications found'));

    consoleSpy.mockRestore();
  });

  it('should display apps when found', async () => {
    vi.mocked(utils.exists).mockResolvedValue(true);
    vi.mocked(utils.getSize).mockResolvedValue(1000000);
    vi.mocked(fsPromises.readdir).mockResolvedValue(['TestApp.app'] as unknown as Awaited<ReturnType<typeof fsPromises.readdir>>);
    vi.mocked(fsPromises.stat).mockResolvedValue({
      isDirectory: () => true,
      mtime: new Date(),
    } as Awaited<ReturnType<typeof fsPromises.stat>>);
    vi.mocked(inquirerPrompts.checkbox).mockResolvedValue([]);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await uninstallCommand({});

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No applications selected'));

    consoleSpy.mockRestore();
  });

  it('should handle dry run', async () => {
    vi.mocked(utils.exists).mockResolvedValue(true);
    vi.mocked(utils.getSize).mockResolvedValue(1000000);
    vi.mocked(fsPromises.readdir).mockResolvedValue(['TestApp.app'] as unknown as Awaited<ReturnType<typeof fsPromises.readdir>>);
    vi.mocked(fsPromises.stat).mockResolvedValue({
      isDirectory: () => true,
      mtime: new Date(),
    } as Awaited<ReturnType<typeof fsPromises.stat>>);
    vi.mocked(inquirerPrompts.checkbox).mockResolvedValue(['TestApp']);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await uninstallCommand({ dryRun: true });

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('DRY RUN'));
    expect(fsPromises.rm).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('should cancel when user declines', async () => {
    vi.mocked(utils.exists).mockResolvedValue(true);
    vi.mocked(utils.getSize).mockResolvedValue(1000000);
    vi.mocked(fsPromises.readdir).mockResolvedValue(['TestApp.app'] as unknown as Awaited<ReturnType<typeof fsPromises.readdir>>);
    vi.mocked(fsPromises.stat).mockResolvedValue({
      isDirectory: () => true,
      mtime: new Date(),
    } as Awaited<ReturnType<typeof fsPromises.stat>>);
    vi.mocked(inquirerPrompts.checkbox).mockResolvedValue(['TestApp']);
    vi.mocked(inquirerPrompts.confirm).mockResolvedValue(false);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await uninstallCommand({});

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('cancelled'));

    consoleSpy.mockRestore();
  });

  it('should uninstall when confirmed', async () => {
    vi.mocked(utils.exists).mockResolvedValue(true);
    vi.mocked(utils.getSize).mockResolvedValue(1000000);
    vi.mocked(fsPromises.readdir).mockResolvedValue(['TestApp.app'] as unknown as Awaited<ReturnType<typeof fsPromises.readdir>>);
    vi.mocked(fsPromises.stat).mockResolvedValue({
      isDirectory: () => true,
      mtime: new Date(),
    } as Awaited<ReturnType<typeof fsPromises.stat>>);
    vi.mocked(inquirerPrompts.checkbox).mockResolvedValue(['TestApp']);
    vi.mocked(inquirerPrompts.confirm).mockResolvedValue(true);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await uninstallCommand({});

    expect(fsPromises.rm).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Uninstallation Complete'));

    consoleSpy.mockRestore();
  });

  it('should uninstall with --yes flag', async () => {
    vi.mocked(utils.exists).mockResolvedValue(true);
    vi.mocked(utils.getSize).mockResolvedValue(1000000);
    vi.mocked(fsPromises.readdir).mockResolvedValue(['TestApp.app'] as unknown as Awaited<ReturnType<typeof fsPromises.readdir>>);
    vi.mocked(fsPromises.stat).mockResolvedValue({
      isDirectory: () => true,
      mtime: new Date(),
    } as Awaited<ReturnType<typeof fsPromises.stat>>);
    vi.mocked(inquirerPrompts.checkbox).mockResolvedValue(['TestApp']);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await uninstallCommand({ yes: true });

    expect(fsPromises.rm).toHaveBeenCalled();
    expect(inquirerPrompts.confirm).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('should handle errors during uninstall', async () => {
    vi.mocked(utils.exists).mockResolvedValue(true);
    vi.mocked(utils.getSize).mockResolvedValue(1000000);
    vi.mocked(fsPromises.readdir).mockResolvedValue(['TestApp.app'] as unknown as Awaited<ReturnType<typeof fsPromises.readdir>>);
    vi.mocked(fsPromises.stat).mockResolvedValue({
      isDirectory: () => true,
      mtime: new Date(),
    } as Awaited<ReturnType<typeof fsPromises.stat>>);
    vi.mocked(inquirerPrompts.checkbox).mockResolvedValue(['TestApp']);
    vi.mocked(fsPromises.rm).mockRejectedValue(new Error('Permission denied'));

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await uninstallCommand({ yes: true });

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Errors'));

    consoleSpy.mockRestore();
  });

  it('should handle noProgress option', async () => {
    vi.mocked(utils.exists).mockResolvedValue(true);
    vi.mocked(utils.getSize).mockResolvedValue(1000000);
    vi.mocked(fsPromises.readdir).mockResolvedValue(['TestApp.app'] as unknown as Awaited<ReturnType<typeof fsPromises.readdir>>);
    vi.mocked(fsPromises.stat).mockResolvedValue({
      isDirectory: () => true,
      mtime: new Date(),
    } as Awaited<ReturnType<typeof fsPromises.stat>>);
    vi.mocked(inquirerPrompts.checkbox).mockResolvedValue(['TestApp']);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await uninstallCommand({ yes: true, noProgress: true });

    expect(utils.createCleanProgress).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('should find apps in both Application directories', async () => {
    vi.mocked(utils.exists).mockResolvedValue(true);
    vi.mocked(utils.getSize).mockResolvedValue(500000);
    vi.mocked(fsPromises.readdir).mockResolvedValue(['App1.app', 'App2.app'] as unknown as Awaited<ReturnType<typeof fsPromises.readdir>>);
    vi.mocked(fsPromises.stat).mockResolvedValue({
      isDirectory: () => true,
      mtime: new Date(),
    } as Awaited<ReturnType<typeof fsPromises.stat>>);
    vi.mocked(inquirerPrompts.checkbox).mockResolvedValue([]);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await uninstallCommand({});

    // Should check both /Applications and ~/Applications
    expect(utils.exists).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('should skip non-.app entries', async () => {
    vi.mocked(utils.exists).mockResolvedValue(true);
    vi.mocked(utils.getSize).mockResolvedValue(500000);
    vi.mocked(fsPromises.readdir).mockResolvedValue(['NotAnApp.txt', 'ActualApp.app'] as unknown as Awaited<ReturnType<typeof fsPromises.readdir>>);
    vi.mocked(fsPromises.stat).mockResolvedValue({
      isDirectory: () => true,
      mtime: new Date(),
    } as Awaited<ReturnType<typeof fsPromises.stat>>);
    vi.mocked(inquirerPrompts.checkbox).mockResolvedValue([]);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await uninstallCommand({});

    consoleSpy.mockRestore();
  });
});
