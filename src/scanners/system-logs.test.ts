import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { SystemLogsScanner } from './system-logs.js';
import * as paths from '../utils/paths.js';

describe('SystemLogsScanner', () => {
  let testDir: string;
  let scanner: SystemLogsScanner;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'clean-my-mac-logs-test-'));
    scanner = new SystemLogsScanner();
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('should have correct category', () => {
    expect(scanner.category.id).toBe('system-logs');
    expect(scanner.category.name).toBe('System Log Files');
    expect(scanner.category.group).toBe('System Junk');
    expect(scanner.category.safetyLevel).toBe('moderate');
  });

  it('should scan user logs directory', async () => {
    const userLogs = join(testDir, 'Logs');
    await mkdir(userLogs);
    await writeFile(join(userLogs, 'app1.log'), 'log content 1');
    await writeFile(join(userLogs, 'app2.log'), 'log content 2');

    vi.spyOn(paths, 'PATHS', 'get').mockReturnValue({
      ...paths.PATHS,
      userLogs: userLogs,
      systemLogs: join(testDir, 'nonexistent'),
    });

    const result = await scanner.scan();

    expect(result.category.id).toBe('system-logs');
    expect(result.items.length).toBe(2);
  });

  it('should handle missing log directories', async () => {
    vi.spyOn(paths, 'PATHS', 'get').mockReturnValue({
      ...paths.PATHS,
      userLogs: join(testDir, 'nonexistent1'),
      systemLogs: join(testDir, 'nonexistent2'),
    });

    const result = await scanner.scan();

    expect(result.items).toHaveLength(0);
    expect(result.totalSize).toBe(0);
  });

  it('should calculate total size correctly', async () => {
    const userLogs = join(testDir, 'Logs');
    await mkdir(userLogs);
    const content1 = 'log content 1';
    const content2 = 'log content 2';
    await writeFile(join(userLogs, 'app1.log'), content1);
    await writeFile(join(userLogs, 'app2.log'), content2);

    vi.spyOn(paths, 'PATHS', 'get').mockReturnValue({
      ...paths.PATHS,
      userLogs: userLogs,
      systemLogs: join(testDir, 'nonexistent'),
    });

    const result = await scanner.scan();

    expect(result.totalSize).toBe(content1.length + content2.length);
  });
});

