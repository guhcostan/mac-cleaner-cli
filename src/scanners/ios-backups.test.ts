import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { IosBackupsScanner } from './ios-backups.js';
import * as paths from '../utils/paths.js';

describe('IosBackupsScanner', () => {
  let testDir: string;
  let scanner: IosBackupsScanner;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'clean-my-mac-ios-test-'));
    scanner = new IosBackupsScanner();
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('should have correct category', () => {
    expect(scanner.category.id).toBe('ios-backups');
    expect(scanner.category.name).toBe('iOS Backups');
    expect(scanner.category.group).toBe('Storage');
    expect(scanner.category.safetyLevel).toBe('risky');
  });

  it('should scan iOS backups directory', async () => {
    const backupsDir = join(testDir, 'Backup');
    const backup1 = join(backupsDir, '00000000-0000000000000001');
    const backup2 = join(backupsDir, '00000000-0000000000000002');
    
    await mkdir(backup1, { recursive: true });
    await mkdir(backup2, { recursive: true });
    await writeFile(join(backup1, 'Info.plist'), 'backup info');
    await writeFile(join(backup2, 'Info.plist'), 'backup info');

    vi.spyOn(paths, 'PATHS', 'get').mockReturnValue({
      ...paths.PATHS,
      iosBackups: backupsDir,
    });

    const result = await scanner.scan();

    expect(result.category.id).toBe('ios-backups');
    expect(result.items.length).toBe(2);
  });

  it('should handle missing backups directory', async () => {
    vi.spyOn(paths, 'PATHS', 'get').mockReturnValue({
      ...paths.PATHS,
      iosBackups: join(testDir, 'nonexistent'),
    });

    const result = await scanner.scan();

    expect(result.items).toHaveLength(0);
    expect(result.totalSize).toBe(0);
  });

  it('should truncate backup ID in name', async () => {
    const backupsDir = join(testDir, 'Backup');
    const backup = join(backupsDir, '00000000-0000000000000001');
    
    await mkdir(backup, { recursive: true });
    await writeFile(join(backup, 'Info.plist'), 'backup info');

    vi.spyOn(paths, 'PATHS', 'get').mockReturnValue({
      ...paths.PATHS,
      iosBackups: backupsDir,
    });

    const result = await scanner.scan();

    expect(result.items[0].name).toContain('iOS Backup');
    expect(result.items[0].name).toContain('...');
  });
});


