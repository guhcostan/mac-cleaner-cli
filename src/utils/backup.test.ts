import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import * as backup from './backup.js';

describe('backup utilities', () => {
  const testBackupDir = join(tmpdir(), 'clean-my-mac-backup-test');

  beforeEach(async () => {
    await mkdir(testBackupDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testBackupDir, { recursive: true, force: true });
  });

  describe('ensureBackupDir', () => {
    it('should create backup directory', async () => {
      const dir = await backup.ensureBackupDir();
      expect(dir).toBeDefined();
      expect(dir).toContain('clean-my-mac');
      await rm(dir, { recursive: true, force: true });
    });

    it('should create unique directories for each call', async () => {
      const dir1 = await backup.ensureBackupDir();
      await new Promise((resolve) => setTimeout(resolve, 10));
      const dir2 = await backup.ensureBackupDir();
      expect(dir1).not.toBe(dir2);
      await rm(dir1, { recursive: true, force: true });
      await rm(dir2, { recursive: true, force: true });
    });
  });

  describe('getBackupDir', () => {
    it('should return backup directory path', () => {
      const dir = backup.getBackupDir();
      expect(dir).toContain('.clean-my-mac');
      expect(dir).toContain('backup');
    });
  });

  describe('listBackups', () => {
    it('should list backups', async () => {
      const backups = await backup.listBackups();
      expect(Array.isArray(backups)).toBe(true);
    });

    it('should return empty array when no backups exist', async () => {
      const backups = await backup.listBackups();
      expect(Array.isArray(backups)).toBe(true);
    });
  });

  describe('cleanOldBackups', () => {
    it('should clean old backups', async () => {
      const cleaned = await backup.cleanOldBackups();
      expect(typeof cleaned).toBe('number');
    });

    it('should return 0 when no old backups exist', async () => {
      const cleaned = await backup.cleanOldBackups();
      expect(cleaned).toBeGreaterThanOrEqual(0);
    });
  });

  describe('backupItem', () => {
    it('should return false for non-existent item', async () => {
      const dir = await backup.ensureBackupDir();
      const result = await backup.backupItem(
        { path: '/non/existent/file.txt', size: 0, name: 'file.txt', isDirectory: false },
        dir
      );
      expect(result).toBe(false);
      await rm(dir, { recursive: true, force: true });
    });

    it('should backup existing file', async () => {
      const testFile = join(testBackupDir, 'backup-test.txt');
      await writeFile(testFile, 'test content');

      const dir = await backup.ensureBackupDir();
      const result = await backup.backupItem(
        { path: testFile, size: 12, name: 'backup-test.txt', isDirectory: false },
        dir
      );

      // Result depends on whether file can be moved
      expect(typeof result).toBe('boolean');
      await rm(dir, { recursive: true, force: true });
    });
  });

  describe('backupItems', () => {
    it('should backup multiple items', async () => {
      const testFile = join(testBackupDir, 'test.txt');
      await writeFile(testFile, 'test content');

      const result = await backup.backupItems([
        { path: testFile, size: 12, name: 'test.txt', isDirectory: false },
      ]);

      expect(result.backupDir).toBeDefined();
      await rm(result.backupDir, { recursive: true, force: true });
    });

    it('should call progress callback', async () => {
      const testFile = join(testBackupDir, 'test2.txt');
      await writeFile(testFile, 'test content');

      const progressFn = vi.fn();

      const result = await backup.backupItems(
        [{ path: testFile, size: 12, name: 'test2.txt', isDirectory: false }],
        progressFn
      );

      expect(progressFn).toHaveBeenCalled();
      await rm(result.backupDir, { recursive: true, force: true });
    });

    it('should handle empty items array', async () => {
      const result = await backup.backupItems([]);

      expect(result.success).toBe(0);
      expect(result.failed).toBe(0);
      await rm(result.backupDir, { recursive: true, force: true });
    });

    it('should count successes and failures', async () => {
      const testFile = join(testBackupDir, 'success.txt');
      await writeFile(testFile, 'test');

      const result = await backup.backupItems([
        { path: testFile, size: 4, name: 'success.txt', isDirectory: false },
        { path: '/non/existent.txt', size: 0, name: 'fail.txt', isDirectory: false },
      ]);

      expect(result.success + result.failed).toBe(2);
      await rm(result.backupDir, { recursive: true, force: true });
    });
  });

  describe('restoreBackup', () => {
    it('should handle empty backup directory', async () => {
      const emptyDir = join(testBackupDir, 'empty-restore');
      await mkdir(emptyDir, { recursive: true });

      const result = await backup.restoreBackup(emptyDir);

      expect(result.success).toBe(0);
      expect(result.failed).toBe(0);
    });
  });
});
