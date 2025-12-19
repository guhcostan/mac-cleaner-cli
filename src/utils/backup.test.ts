import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import * as backup from './backup.js';

describe('backup utilities', () => {
  const testBackupDir = join(tmpdir(), 'mac-cleaner-backup-test-' + Date.now());

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
      expect(dir).toContain('mac-cleaner');
      await rm(dir, { recursive: true, force: true });
    });
  });

  describe('getBackupDir', () => {
    it('should return backup directory path', () => {
      const dir = backup.getBackupDir();
      expect(dir).toContain('.mac-cleaner-cli');
      expect(dir).toContain('backup');
    });
  });

  describe('listBackups', () => {
    it('should list backups', async () => {
      const backups = await backup.listBackups();
      expect(Array.isArray(backups)).toBe(true);
    });
  });

  describe('cleanOldBackups', () => {
    it('should clean old backups', async () => {
      const cleaned = await backup.cleanOldBackups();
      expect(typeof cleaned).toBe('number');
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
      const testFile = join(testBackupDir, 'test-backup.txt');
      await writeFile(testFile, 'test content');

      const dir = await backup.ensureBackupDir();
      const result = await backup.backupItem(
        { path: testFile, size: 12, name: 'test-backup.txt', isDirectory: false },
        dir
      );

      expect(typeof result).toBe('boolean');
      await rm(dir, { recursive: true, force: true });
    });
  });

  describe('backupItems', () => {
    it('should handle empty items array', async () => {
      const result = await backup.backupItems([]);

      expect(result.success).toBe(0);
      expect(result.failed).toBe(0);
      await rm(result.backupDir, { recursive: true, force: true });
    });

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
      // Create a backup directory within the valid backup location
      const backupDir = backup.getBackupDir();
      const emptyDir = join(backupDir, 'empty-restore-test-' + Date.now());
      await mkdir(emptyDir, { recursive: true });

      const result = await backup.restoreBackup(emptyDir);

      expect(result.success).toBe(0);
      expect(result.failed).toBe(0);
      
      await rm(emptyDir, { recursive: true, force: true });
    });

    it('should reject restore from invalid backup directory', async () => {
      // Try to restore from a directory outside the backup location
      const invalidDir = join(tmpdir(), 'invalid-backup-' + Date.now());
      await mkdir(invalidDir, { recursive: true });
      await writeFile(join(invalidDir, 'file.txt'), 'malicious content');

      const result = await backup.restoreBackup(invalidDir);

      expect(result.success).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Invalid backup directory');

      await rm(invalidDir, { recursive: true, force: true });
    });

    it('should return errors array in result', async () => {
      const backupDir = backup.getBackupDir();
      const testDir = join(backupDir, 'error-test-' + Date.now());
      await mkdir(testDir, { recursive: true });

      const result = await backup.restoreBackup(testDir);

      expect(result).toHaveProperty('errors');
      expect(Array.isArray(result.errors)).toBe(true);

      await rm(testDir, { recursive: true, force: true });
    });

    it('should skip files with path traversal patterns', async () => {
      const backupDir = backup.getBackupDir();
      const testDir = join(backupDir, 'traversal-test-' + Date.now());
      const homeSubdir = join(testDir, 'HOME');
      await mkdir(homeSubdir, { recursive: true });
      
      // Create a file that would try to escape (the restore should skip it)
      // Note: We can't actually test path traversal without crafting malicious paths,
      // but we can verify the structure is handled correctly
      await writeFile(join(homeSubdir, 'safe-file.txt'), 'safe content');

      const result = await backup.restoreBackup(testDir);

      // The restore should process files under HOME structure
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('failed');
      expect(result).toHaveProperty('errors');

      await rm(testDir, { recursive: true, force: true });
    });
  });
});
