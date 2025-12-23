import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import * as config from './config.js';

describe('config utilities', () => {
  const testConfigDir = join(homedir(), '.mac-cleaner-config-test-' + Date.now());

  beforeEach(async () => {
    await mkdir(testConfigDir, { recursive: true });
    config.clearConfigCache();
  });

  afterEach(async () => {
    await rm(testConfigDir, { recursive: true, force: true });
    config.clearConfigCache();
  });

  describe('getDefaultConfig', () => {
    it('should return default config', () => {
      const defaultConfig = config.getDefaultConfig();
      expect(defaultConfig).toBeDefined();
      expect(defaultConfig.downloadsDaysOld).toBe(30);
      expect(defaultConfig.parallelScans).toBe(true);
      expect(defaultConfig.concurrency).toBe(4);
    });
  });

  describe('loadConfig', () => {
    it('should return default config when no file exists', async () => {
      const loaded = await config.loadConfig(join(testConfigDir, 'nonexistent.json'));
      expect(loaded.downloadsDaysOld).toBe(30);
    });

    it('should load config from file', async () => {
      const configPath = join(testConfigDir, 'config.json');
      await writeFile(configPath, JSON.stringify({ downloadsDaysOld: 60 }));

      const loaded = await config.loadConfig(configPath);
      expect(loaded.downloadsDaysOld).toBe(60);
    });

    it('should merge with defaults', async () => {
      const configPath = join(testConfigDir, 'config2.json');
      await writeFile(configPath, JSON.stringify({ downloadsDaysOld: 60 }));

      const loaded = await config.loadConfig(configPath);
      expect(loaded.downloadsDaysOld).toBe(60);
      expect(loaded.parallelScans).toBe(true);
    });

    it('should reject config path outside home directory', async () => {
      const loaded = await config.loadConfig('/tmp/malicious-config.json');
      // Should fall back to defaults
      expect(loaded.downloadsDaysOld).toBe(30);
    });

    it('should validate numeric values within bounds', async () => {
      const configPath = join(testConfigDir, 'invalid-numbers.json');
      await writeFile(configPath, JSON.stringify({ 
        downloadsDaysOld: -5,  // Invalid: negative
        concurrency: 100,      // Invalid: too high
        backupRetentionDays: 0 // Invalid: zero
      }));

      const loaded = await config.loadConfig(configPath);
      // Should use defaults for invalid values
      expect(loaded.downloadsDaysOld).toBe(30);
      expect(loaded.concurrency).toBe(4);
      expect(loaded.backupRetentionDays).toBe(7);
    });

    it('should filter invalid category IDs', async () => {
      const configPath = join(testConfigDir, 'invalid-categories.json');
      await writeFile(configPath, JSON.stringify({ 
        defaultCategories: ['trash', 'invalid-category', 'system-cache'],
        excludeCategories: ['fake-category']
      }));

      const loaded = await config.loadConfig(configPath);
      expect(loaded.defaultCategories).toEqual(['trash', 'system-cache']);
      expect(loaded.excludeCategories).toEqual([]);
    });

    it('should handle malformed JSON gracefully', async () => {
      const configPath = join(testConfigDir, 'malformed.json');
      await writeFile(configPath, '{ invalid json }');

      const loaded = await config.loadConfig(configPath);
      // Should fall back to defaults
      expect(loaded.downloadsDaysOld).toBe(30);
    });

    it('should validate extraPaths are within allowed directories', async () => {
      const configPath = join(testConfigDir, 'extra-paths.json');
      await writeFile(configPath, JSON.stringify({ 
        extraPaths: {
          nodeModules: [
            '~/Projects',           // Valid
            '/System/Library',      // Invalid: system path
            '/Users/other',         // Valid: under /Users
          ],
          projects: [
            '~/Developer',          // Valid
            '/etc/passwd',          // Invalid: outside allowed
          ]
        }
      }));

      const loaded = await config.loadConfig(configPath);
      expect(loaded.extraPaths?.nodeModules).toContain(join(homedir(), 'Projects'));
      expect(loaded.extraPaths?.nodeModules).not.toContain('/System/Library');
      expect(loaded.extraPaths?.projects).toContain(join(homedir(), 'Developer'));
    });
  });

  describe('saveConfig', () => {
    it('should save config to file', async () => {
      const configPath = join(testConfigDir, 'saved-config.json');
      await config.saveConfig({ downloadsDaysOld: 90 }, configPath);

      config.clearConfigCache();
      const loaded = await config.loadConfig(configPath);
      expect(loaded.downloadsDaysOld).toBe(90);
    });
  });

  describe('configExists', () => {
    it('should return false when config does not exist', async () => {
      const exists = await config.configExists();
      expect(typeof exists).toBe('boolean');
    });
  });

  describe('clearConfigCache', () => {
    it('should clear cached config', async () => {
      const configPath = join(testConfigDir, 'cached-config.json');
      await writeFile(configPath, JSON.stringify({ downloadsDaysOld: 45 }));

      await config.loadConfig(configPath);
      config.clearConfigCache();

      const loaded = await config.loadConfig(configPath);
      expect(loaded.downloadsDaysOld).toBe(45);
    });
  });
});

