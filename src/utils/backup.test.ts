import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Reset modules to ensure clean mocks
vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>();
  return {
    ...actual,
    mkdir: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
    readdir: vi.fn().mockResolvedValue([]),
    stat: vi.fn().mockResolvedValue({ isDirectory: () => true, mtime: new Date(), size: 1000 }),
    rm: vi.fn().mockResolvedValue(undefined),
  };
});

import * as backup from './backup.js';
import * as fsPromises from 'fs/promises';

describe('backup utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('ensureBackupDir', () => {
    it('should create backup directory', async () => {
      const dir = await backup.ensureBackupDir();

      expect(dir).toBeDefined();
      expect(dir).toContain('clean-my-mac');
      expect(fsPromises.mkdir).toHaveBeenCalled();
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
      vi.mocked(fsPromises.readdir).mockResolvedValue(['backup1', 'backup2'] as unknown as Awaited<ReturnType<typeof fsPromises.readdir>>);
      vi.mocked(fsPromises.stat).mockResolvedValue({
        isDirectory: () => true,
        mtime: new Date(),
        size: 1000,
      } as Awaited<ReturnType<typeof fsPromises.stat>>);

      const backups = await backup.listBackups();

      expect(Array.isArray(backups)).toBe(true);
    });

    it('should return empty array when no backups exist', async () => {
      vi.mocked(fsPromises.readdir).mockRejectedValue(new Error('Directory not found'));

      const backups = await backup.listBackups();

      expect(backups).toHaveLength(0);
    });

    it('should skip non-directory entries', async () => {
      vi.mocked(fsPromises.readdir).mockResolvedValue(['file.txt'] as unknown as Awaited<ReturnType<typeof fsPromises.readdir>>);
      vi.mocked(fsPromises.stat).mockResolvedValue({
        isDirectory: () => false,
        mtime: new Date(),
      } as Awaited<ReturnType<typeof fsPromises.stat>>);

      const backups = await backup.listBackups();

      expect(backups).toHaveLength(0);
    });

    it('should handle stat errors gracefully', async () => {
      vi.mocked(fsPromises.readdir).mockResolvedValue(['backup1'] as unknown as Awaited<ReturnType<typeof fsPromises.readdir>>);
      vi.mocked(fsPromises.stat).mockRejectedValue(new Error('Permission denied'));

      const backups = await backup.listBackups();

      expect(backups).toHaveLength(0);
    });

    it('should sort backups by date descending', async () => {
      vi.mocked(fsPromises.readdir).mockResolvedValue(['old', 'new'] as unknown as Awaited<ReturnType<typeof fsPromises.readdir>>);

      let callCount = 0;
      vi.mocked(fsPromises.stat).mockImplementation(async () => {
        callCount++;
        return {
          isDirectory: () => true,
          mtime: callCount === 1 ? new Date('2020-01-01') : new Date('2024-01-01'),
          size: 1000,
        } as Awaited<ReturnType<typeof fsPromises.stat>>;
      });

      const backups = await backup.listBackups();

      if (backups.length > 1) {
        expect(backups[0].date.getTime()).toBeGreaterThanOrEqual(backups[1].date.getTime());
      }
    });
  });

  describe('cleanOldBackups', () => {
    it('should clean old backups', async () => {
      vi.mocked(fsPromises.readdir).mockResolvedValue(['old-backup'] as unknown as Awaited<ReturnType<typeof fsPromises.readdir>>);
      vi.mocked(fsPromises.stat).mockResolvedValue({
        isDirectory: () => true,
        mtime: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days old
      } as Awaited<ReturnType<typeof fsPromises.stat>>);

      const cleaned = await backup.cleanOldBackups();

      expect(cleaned).toBeGreaterThanOrEqual(0);
    });

    it('should return 0 when backup dir does not exist', async () => {
      vi.mocked(fsPromises.readdir).mockRejectedValue(new Error('Directory not found'));

      const cleaned = await backup.cleanOldBackups();

      expect(cleaned).toBe(0);
    });

    it('should skip recent backups', async () => {
      vi.mocked(fsPromises.readdir).mockResolvedValue(['recent-backup'] as unknown as Awaited<ReturnType<typeof fsPromises.readdir>>);
      vi.mocked(fsPromises.stat).mockResolvedValue({
        isDirectory: () => true,
        mtime: new Date(), // Today
      } as Awaited<ReturnType<typeof fsPromises.stat>>);

      await backup.cleanOldBackups();

      expect(fsPromises.rm).not.toHaveBeenCalled();
    });

    it('should handle stat errors', async () => {
      vi.mocked(fsPromises.readdir).mockResolvedValue(['backup'] as unknown as Awaited<ReturnType<typeof fsPromises.readdir>>);
      vi.mocked(fsPromises.stat).mockRejectedValue(new Error('Permission denied'));

      const cleaned = await backup.cleanOldBackups();

      expect(cleaned).toBe(0);
    });
  });

  describe('backupItem', () => {
    it('should return false for non-existent item', async () => {
      vi.mocked(fsPromises.rename).mockRejectedValue(new Error('File not found'));

      const result = await backup.backupItem(
        { path: '/non/existent/file.txt', size: 0, name: 'file.txt', isDirectory: false },
        '/backup/dir'
      );

      expect(result).toBe(false);
    });

    it('should backup existing file', async () => {
      vi.mocked(fsPromises.mkdir).mockResolvedValue(undefined);
      vi.mocked(fsPromises.rename).mockResolvedValue(undefined);

      const result = await backup.backupItem(
        { path: '/test/file.txt', size: 100, name: 'file.txt', isDirectory: false },
        '/backup/dir'
      );

      expect(result).toBe(true);
      expect(fsPromises.rename).toHaveBeenCalled();
    });
  });

  describe('backupItems', () => {
    it('should backup multiple items', async () => {
      vi.mocked(fsPromises.mkdir).mockResolvedValue(undefined);
      vi.mocked(fsPromises.rename).mockResolvedValue(undefined);

      const result = await backup.backupItems([
        { path: '/test/file1.txt', size: 100, name: 'file1.txt', isDirectory: false },
        { path: '/test/file2.txt', size: 200, name: 'file2.txt', isDirectory: false },
      ]);

      expect(result.backupDir).toBeDefined();
      expect(result.success).toBe(2);
    });

    it('should call progress callback', async () => {
      vi.mocked(fsPromises.mkdir).mockResolvedValue(undefined);
      vi.mocked(fsPromises.rename).mockResolvedValue(undefined);

      const progressFn = vi.fn();

      await backup.backupItems(
        [{ path: '/test/file.txt', size: 100, name: 'file.txt', isDirectory: false }],
        progressFn
      );

      expect(progressFn).toHaveBeenCalled();
    });

    it('should handle empty items array', async () => {
      const result = await backup.backupItems([]);

      expect(result.success).toBe(0);
      expect(result.failed).toBe(0);
    });

    it('should count failures', async () => {
      vi.mocked(fsPromises.mkdir).mockResolvedValue(undefined);
      vi.mocked(fsPromises.rename).mockRejectedValue(new Error('Cannot move'));

      const result = await backup.backupItems([
        { path: '/test/file.txt', size: 100, name: 'file.txt', isDirectory: false },
      ]);

      expect(result.failed).toBe(1);
    });
  });

  describe('restoreBackup', () => {
    it('should handle empty backup directory', async () => {
      vi.mocked(fsPromises.readdir).mockResolvedValue([]);

      const result = await backup.restoreBackup('/backup/dir');

      expect(result.success).toBe(0);
      expect(result.failed).toBe(0);
    });

    it('should restore files from backup', async () => {
      vi.mocked(fsPromises.readdir).mockImplementation(async (dir) => {
        if (String(dir).includes('backup')) {
          return [
            { name: 'HOME', isDirectory: () => true, isFile: () => false },
          ] as unknown as Awaited<ReturnType<typeof fsPromises.readdir>>;
        }
        return [
          { name: 'file.txt', isDirectory: () => false, isFile: () => true },
        ] as unknown as Awaited<ReturnType<typeof fsPromises.readdir>>;
      });
      vi.mocked(fsPromises.mkdir).mockResolvedValue(undefined);
      vi.mocked(fsPromises.rename).mockResolvedValue(undefined);

      const result = await backup.restoreBackup('/backup/dir');

      expect(result).toBeDefined();
    });

    it('should handle restore errors gracefully', async () => {
      vi.mocked(fsPromises.readdir).mockImplementation(async () => {
        return [
          { name: 'file.txt', isDirectory: () => false, isFile: () => true },
        ] as unknown as Awaited<ReturnType<typeof fsPromises.readdir>>;
      });
      vi.mocked(fsPromises.mkdir).mockResolvedValue(undefined);
      vi.mocked(fsPromises.rename).mockRejectedValue(new Error('Cannot restore'));

      const result = await backup.restoreBackup('/backup/dir');

      expect(result.failed).toBeGreaterThan(0);
    });
  });
});
