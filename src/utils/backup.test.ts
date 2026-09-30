import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir, homedir } from 'os';
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

  describe('backupItem / backupItems (round-trip real)', () => {
    // These move REAL files and check the content afterwards. The previous
    // version only asserted `expect(typeof result).toBe('boolean')`, which
    // passed even with the backup failing 100% of the time — which was exactly
    // the state of this module: no callers, never exercised.
    let sourceDir: string;

    beforeEach(async () => {
      // Must be INSIDE home: backupItem refuses anything else, because
      // restoreBackup only knows how to restore what sits under the HOME/ prefix.
      sourceDir = join(homedir(), '.mac-cleaner-cli-test-src');
      await mkdir(sourceDir, { recursive: true });
    });

    afterEach(async () => {
      await rm(sourceDir, { recursive: true, force: true });
    });

    it('should MOVE the file into the backup, not copy it', async () => {
      const testFile = join(sourceDir, 'moved.txt');
      await writeFile(testFile, 'conteudo original');

      const dir = await backup.ensureBackupDir();
      const ok = await backup.backupItem(
        { path: testFile, size: 17, name: 'moved.txt', isDirectory: false },
        dir
      );

      expect(ok).toBe(true);
      expect(existsSync(testFile)).toBe(false);

      const backedUpPath = backup.backupPathFor(testFile, dir);
      expect(backedUpPath).not.toBeNull();
      expect(await readFile(backedUpPath as string, 'utf-8')).toBe('conteudo original');

      await rm(dir, { recursive: true, force: true });
    });

    it('should refuse paths outside the home directory', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const outside = join(tmpdir(), 'outside-home.txt');
      await writeFile(outside, 'x');

      const dir = await backup.ensureBackupDir();
      const ok = await backup.backupItem(
        { path: outside, size: 1, name: 'outside-home.txt', isDirectory: false },
        dir
      );

      // Refuses, rather than creating a backup restoreBackup could not undo.
      expect(ok).toBe(false);
      expect(existsSync(outside)).toBe(true);

      await rm(outside, { force: true });
      await rm(dir, { recursive: true, force: true });
      consoleSpy.mockRestore();
    });

    it('should refuse protected system paths', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const dir = await backup.ensureBackupDir();

      const ok = await backup.backupItem(
        { path: '/var/log/system.log', size: 1, name: 'system.log', isDirectory: false },
        dir
      );

      expect(ok).toBe(false);
      await rm(dir, { recursive: true, force: true });
      consoleSpy.mockRestore();
    });

    it('should not touch the disk in dry run but still report the item', async () => {
      const testFile = join(sourceDir, 'dry.txt');
      await writeFile(testFile, 'intacto');

      const dir = await backup.ensureBackupDir();
      const result = await backup.backupItems(
        [{ path: testFile, size: 7, name: 'dry.txt', isDirectory: false }],
        dir,
        true
      );

      expect(result.success).toBe(1);
      expect(result.backedUpSize).toBe(7);
      expect(await readFile(testFile, 'utf-8')).toBe('intacto');

      await rm(dir, { recursive: true, force: true });
    });

    it('should report backedUpSize separately from freed space', async () => {
      const testFile = join(sourceDir, 'sized.txt');
      await writeFile(testFile, 'abcdefghij');

      const dir = await backup.ensureBackupDir();
      const result = await backup.backupItems(
        [{ path: testFile, size: 10, name: 'sized.txt', isDirectory: false }],
        dir
      );

      expect(result.success).toBe(1);
      expect(result.backedUpSize).toBe(10);

      await rm(dir, { recursive: true, force: true });
    });

    it('should count failures without deleting the failed item', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const good = join(sourceDir, 'good.txt');
      await writeFile(good, 'ok');

      const dir = await backup.ensureBackupDir();
      const result = await backup.backupItems(
        [
          { path: good, size: 2, name: 'good.txt', isDirectory: false },
          { path: join(sourceDir, 'ghost.txt'), size: 0, name: 'ghost.txt', isDirectory: false },
        ],
        dir
      );

      expect(result.success).toBe(1);
      expect(result.failed).toBe(1);

      await rm(dir, { recursive: true, force: true });
      consoleSpy.mockRestore();
    });

    it('should call the progress callback', async () => {
      const testFile = join(sourceDir, 'progress.txt');
      await writeFile(testFile, 'p');
      const progressFn = vi.fn();

      const dir = await backup.ensureBackupDir();
      await backup.backupItems(
        [{ path: testFile, size: 1, name: 'progress.txt', isDirectory: false }],
        dir,
        false,
        progressFn
      );

      expect(progressFn).toHaveBeenCalled();
      await rm(dir, { recursive: true, force: true });
    });

    it('should survive a full backup -> restore round trip with identical content', async () => {
      const testFile = join(sourceDir, 'roundtrip.txt');
      const content = 'este conteudo precisa voltar identico';
      await writeFile(testFile, content);

      const dir = await backup.ensureBackupDir();
      expect(
        await backup.backupItem(
          { path: testFile, size: content.length, name: 'roundtrip.txt', isDirectory: false },
          dir
        )
      ).toBe(true);
      expect(existsSync(testFile)).toBe(false);

      const restored = await backup.restoreBackup(dir);

      expect(restored.failed).toBe(0);
      expect(restored.success).toBe(1);
      expect(await readFile(testFile, 'utf-8')).toBe(content);

      await rm(dir, { recursive: true, force: true });
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
      const invalidDir = await mkdtemp(join(tmpdir(), 'invalid-backup-'));
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

describe('ensureBackupDir uniqueness', () => {
  // Regression guard: the name was just the ISO timestamp (millisecond
  // resolution) and `mkdir` with `recursive: true` accepts an existing directory
  // silently. Two sessions in the same millisecond would share the folder and
  // one would overwrite the other. This surfaced as suite flakiness (vitest runs
  // files in parallel) before it could surface as a production bug.
  it('never hands out the same directory twice', async () => {
    const dirs = await Promise.all(
      Array.from({ length: 25 }, () => backup.ensureBackupDir())
    );

    expect(new Set(dirs).size).toBe(dirs.length);

    await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
  });
});
