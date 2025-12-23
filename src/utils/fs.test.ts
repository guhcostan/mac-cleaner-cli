import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm, symlink, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir, homedir } from 'os';
import { 
  exists, 
  getSize, 
  getDirectorySize, 
  getItems, 
  getDirectoryItems,
  isProtectedPath,
  validatePathSafety,
  removeItem
} from './fs.js';

describe('fs utils', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'mac-cleaner-test-'));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('exists', () => {
    it('should return true for existing file', async () => {
      const filePath = join(testDir, 'test.txt');
      await writeFile(filePath, 'test content');
      expect(await exists(filePath)).toBe(true);
    });

    it('should return true for existing directory', async () => {
      const dirPath = join(testDir, 'subdir');
      await mkdir(dirPath);
      expect(await exists(dirPath)).toBe(true);
    });

    it('should return false for non-existing path', async () => {
      expect(await exists(join(testDir, 'nonexistent'))).toBe(false);
    });
  });

  describe('getSize', () => {
    it('should return file size', async () => {
      const filePath = join(testDir, 'test.txt');
      const content = 'test content';
      await writeFile(filePath, content);
      expect(await getSize(filePath)).toBe(content.length);
    });

    it('should return 0 for non-existing path', async () => {
      expect(await getSize(join(testDir, 'nonexistent'))).toBe(0);
    });
  });

  describe('getDirectorySize', () => {
    it('should return total size of directory contents', async () => {
      const content1 = 'content1';
      const content2 = 'content2';
      await writeFile(join(testDir, 'file1.txt'), content1);
      await writeFile(join(testDir, 'file2.txt'), content2);

      const size = await getDirectorySize(testDir);
      expect(size).toBe(content1.length + content2.length);
    });

    it('should include subdirectory contents', async () => {
      const subDir = join(testDir, 'subdir');
      await mkdir(subDir);

      const content1 = 'content1';
      const content2 = 'subcontent';
      await writeFile(join(testDir, 'file1.txt'), content1);
      await writeFile(join(subDir, 'file2.txt'), content2);

      const size = await getDirectorySize(testDir);
      expect(size).toBe(content1.length + content2.length);
    });

    it('should return 0 for non-existing directory', async () => {
      expect(await getDirectorySize(join(testDir, 'nonexistent'))).toBe(0);
    });
  });

  describe('getDirectoryItems', () => {
    it('should list items in directory', async () => {
      await writeFile(join(testDir, 'file1.txt'), 'content1');
      await writeFile(join(testDir, 'file2.txt'), 'content2');

      const items = await getDirectoryItems(testDir);

      expect(items).toHaveLength(2);
      expect(items.map((i) => i.name).sort()).toEqual(['file1.txt', 'file2.txt']);
    });

    it('should include size for each item', async () => {
      const content = 'test content';
      await writeFile(join(testDir, 'file.txt'), content);

      const items = await getDirectoryItems(testDir);

      expect(items[0].size).toBe(content.length);
    });

    it('should identify directories', async () => {
      await mkdir(join(testDir, 'subdir'));
      await writeFile(join(testDir, 'file.txt'), 'content');

      const items = await getDirectoryItems(testDir);

      const dir = items.find((i) => i.name === 'subdir');
      const file = items.find((i) => i.name === 'file.txt');

      expect(dir?.isDirectory).toBe(true);
      expect(file?.isDirectory).toBe(false);
    });

    it('should return empty array for non-existing directory', async () => {
      const items = await getDirectoryItems(join(testDir, 'nonexistent'));
      expect(items).toEqual([]);
    });
  });

  describe('getItems', () => {
    it('should filter by minimum age', async () => {
      await writeFile(join(testDir, 'file.txt'), 'content');

      const itemsWithAge = await getItems(testDir, { minAge: 30 });
      expect(itemsWithAge).toHaveLength(0);

      const itemsNoAge = await getItems(testDir, { minAge: 0 });
      expect(itemsNoAge.length).toBeGreaterThanOrEqual(0);
    });

    it('should filter by minimum size', async () => {
      await writeFile(join(testDir, 'small.txt'), 'a');
      await writeFile(join(testDir, 'large.txt'), 'a'.repeat(1000));

      const items = await getItems(testDir, { minSize: 500 });

      expect(items).toHaveLength(1);
      expect(items[0].name).toBe('large.txt');
    });
  });

  describe('symlink handling', () => {
    it('should not follow symlinks when calculating size', async () => {
      const largeContent = 'a'.repeat(10000);
      const largeFile = join(testDir, 'large.txt');
      await writeFile(largeFile, largeContent);

      const symlinkPath = join(testDir, 'link');
      await symlink(largeFile, symlinkPath);

      const size = await getSize(symlinkPath);
      expect(size).toBeLessThan(100);
    });

    it('should count symlink size not target size in directory', async () => {
      const largeContent = 'a'.repeat(10000);
      const subDir = join(testDir, 'subdir');
      await mkdir(subDir);

      const largeFile = join(testDir, 'large.txt');
      await writeFile(largeFile, largeContent);

      const symlinkPath = join(subDir, 'link');
      await symlink(largeFile, symlinkPath);

      const size = await getDirectorySize(subDir);
      expect(size).toBeLessThan(100);
    });

    it('should handle symlinks in getDirectoryItems', async () => {
      const largeContent = 'a'.repeat(10000);
      const largeFile = join(testDir, 'large.txt');
      await writeFile(largeFile, largeContent);

      const symlinkPath = join(testDir, 'link');
      await symlink(largeFile, symlinkPath);

      const items = await getDirectoryItems(testDir);
      const linkItem = items.find((i) => i.name === 'link');

      expect(linkItem).toBeDefined();
      expect(linkItem!.size).toBeLessThan(100);
    });
  });

  describe('isProtectedPath', () => {
    it('should return true for system paths', () => {
      expect(isProtectedPath('/System')).toBe(true);
      expect(isProtectedPath('/System/Library')).toBe(true);
      expect(isProtectedPath('/usr/bin')).toBe(true);
      expect(isProtectedPath('/bin/bash')).toBe(true);
      expect(isProtectedPath('/sbin/mount')).toBe(true);
      expect(isProtectedPath('/etc/hosts')).toBe(true);
      expect(isProtectedPath('/var/log')).toBe(true);
      expect(isProtectedPath('/var/log/system.log')).toBe(true);
      expect(isProtectedPath('/private/var/db')).toBe(true);
      expect(isProtectedPath('/private/var/log')).toBe(true);
    });

    it('should return false for user paths', () => {
      expect(isProtectedPath('/tmp')).toBe(false);
      expect(isProtectedPath('/tmp/test')).toBe(false);
      expect(isProtectedPath('/Users/test')).toBe(false);
      expect(isProtectedPath('/Applications')).toBe(false);
      expect(isProtectedPath(join(homedir(), 'Documents'))).toBe(false);
      expect(isProtectedPath(join(homedir(), 'Library', 'Caches'))).toBe(false);
    });

    it('should return false for allowed temp paths', () => {
      expect(isProtectedPath('/var/folders')).toBe(false);
      expect(isProtectedPath('/var/folders/abc/def')).toBe(false);
      expect(isProtectedPath('/private/var/folders')).toBe(false);
      expect(isProtectedPath('/var/tmp')).toBe(false);
      expect(isProtectedPath('/private/var/tmp')).toBe(false);
    });
  });

  describe('validatePathSafety', () => {
    it('should return null for safe paths', () => {
      expect(validatePathSafety(join(homedir(), 'Documents', 'test.txt'))).toBeNull();
      expect(validatePathSafety('/tmp/test')).toBeNull();
      expect(validatePathSafety('/Applications/Test.app')).toBeNull();
    });

    it('should return error message for protected paths', () => {
      expect(validatePathSafety('/System/Library')).toContain('protected');
      expect(validatePathSafety('/usr/bin/test')).toContain('protected');
      expect(validatePathSafety('/bin/bash')).toContain('protected');
    });

    it('should return error for root directory', () => {
      expect(validatePathSafety('/')).toContain('root');
    });

    it('should return error for home directory itself', () => {
      expect(validatePathSafety(homedir())).toContain('home');
    });
  });

  describe('removeItem', () => {
    it('should remove a file successfully', async () => {
      const filePath = join(testDir, 'to-remove.txt');
      await writeFile(filePath, 'test content');
      
      const result = await removeItem(filePath);
      
      expect(result).toBe(true);
      expect(await exists(filePath)).toBe(false);
    });

    it('should remove a directory recursively', async () => {
      const dirPath = join(testDir, 'to-remove-dir');
      await mkdir(dirPath);
      await writeFile(join(dirPath, 'file.txt'), 'content');
      
      const result = await removeItem(dirPath);
      
      expect(result).toBe(true);
      expect(await exists(dirPath)).toBe(false);
    });

    it('should return true for dry run without deleting', async () => {
      const filePath = join(testDir, 'dry-run.txt');
      await writeFile(filePath, 'test content');
      
      const result = await removeItem(filePath, true);
      
      expect(result).toBe(true);
      expect(await exists(filePath)).toBe(true);
    });

    it('should remove symlink without following it', async () => {
      const targetFile = join(testDir, 'target.txt');
      const targetContent = 'important content';
      await writeFile(targetFile, targetContent);
      
      const symlinkPath = join(testDir, 'symlink');
      await symlink(targetFile, symlinkPath);
      
      const result = await removeItem(symlinkPath);
      
      expect(result).toBe(true);
      expect(await exists(symlinkPath)).toBe(false);
      // Target should still exist
      expect(await exists(targetFile)).toBe(true);
      const content = await readFile(targetFile, 'utf-8');
      expect(content).toBe(targetContent);
    });

    it('should refuse to delete protected system paths', async () => {
      const result = await removeItem('/System/Library');
      expect(result).toBe(false);
    });

    it('should refuse to delete root directory', async () => {
      const result = await removeItem('/');
      expect(result).toBe(false);
    });

    it('should refuse to delete home directory', async () => {
      const result = await removeItem(homedir());
      expect(result).toBe(false);
    });

    it('should return false for non-existent path', async () => {
      const result = await removeItem(join(testDir, 'nonexistent'));
      expect(result).toBe(false);
    });
  });
});



