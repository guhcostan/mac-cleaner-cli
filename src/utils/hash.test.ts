import { describe, it, expect, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { getFileHash, getFileHashPartial } from './hash.js';

describe('hash utilities', () => {
  const testDir = join(tmpdir(), 'clean-my-mac-hash-test');

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('getFileHash', () => {
    it('should calculate file hash', async () => {
      await mkdir(testDir, { recursive: true });
      const testFile = join(testDir, 'test.txt');
      await writeFile(testFile, 'hello world');

      const hash = await getFileHash(testFile);
      expect(hash).toBeDefined();
      expect(hash.length).toBe(32);
    });

    it('should produce same hash for identical content', async () => {
      await mkdir(testDir, { recursive: true });
      const file1 = join(testDir, 'file1.txt');
      const file2 = join(testDir, 'file2.txt');
      await writeFile(file1, 'identical content');
      await writeFile(file2, 'identical content');

      const hash1 = await getFileHash(file1);
      const hash2 = await getFileHash(file2);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hash for different content', async () => {
      await mkdir(testDir, { recursive: true });
      const file1 = join(testDir, 'fileA.txt');
      const file2 = join(testDir, 'fileB.txt');
      await writeFile(file1, 'content A');
      await writeFile(file2, 'content B');

      const hash1 = await getFileHash(file1);
      const hash2 = await getFileHash(file2);

      expect(hash1).not.toBe(hash2);
    });

    it('should use specified algorithm', async () => {
      await mkdir(testDir, { recursive: true });
      const testFile = join(testDir, 'algo-test.txt');
      await writeFile(testFile, 'test');

      const sha256Hash = await getFileHash(testFile, 'sha256');
      expect(sha256Hash.length).toBe(64);
    });

    it('should reject for non-existent file', async () => {
      await expect(getFileHash('/non/existent/file.txt')).rejects.toThrow();
    });
  });

  describe('getFileHashPartial', () => {
    it('should calculate partial file hash', async () => {
      await mkdir(testDir, { recursive: true });
      const testFile = join(testDir, 'partial.txt');
      await writeFile(testFile, 'a'.repeat(2000));

      const hash = await getFileHashPartial(testFile, 1000);
      expect(hash).toBeDefined();
      expect(hash.length).toBe(32);
    });

    it('should handle files smaller than byte limit', async () => {
      await mkdir(testDir, { recursive: true });
      const testFile = join(testDir, 'small.txt');
      await writeFile(testFile, 'small');

      const hash = await getFileHashPartial(testFile, 1000);
      expect(hash).toBeDefined();
    });
  });
});

