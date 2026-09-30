import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, rm, writeFile, readFile } from 'fs/promises';
import { join } from 'path';

// Isolate the config helpers from the real home directory: config.ts resolves its
// well-known config paths from homedir() at import time.
const { FAKE_HOME } = vi.hoisted(() => {
  return { FAKE_HOME: `/tmp/mac-cleaner-config-home-${process.pid}` };
});

vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os');
  return { ...actual, homedir: () => FAKE_HOME };
});

const config = await import('./config.js');

describe('config utilities', () => {
  const testConfigDir = join(FAKE_HOME, 'config-tests');

  beforeEach(async () => {
    await mkdir(testConfigDir, { recursive: true });
    config.clearConfigCache();
  });

  afterEach(async () => {
    await rm(FAKE_HOME, { recursive: true, force: true });
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

    it('should load from the default config paths', async () => {
      await writeFile(join(FAKE_HOME, '.maccleanerrc'), JSON.stringify({ concurrency: 8 }));

      const loaded = await config.loadConfig();
      expect(loaded.concurrency).toBe(8);
    });

    it('should fall back to the second default config path', async () => {
      await mkdir(join(FAKE_HOME, '.config', 'mac-cleaner-cli'), { recursive: true });
      await writeFile(
        join(FAKE_HOME, '.config', 'mac-cleaner-cli', 'config.json'),
        JSON.stringify({ concurrency: 2 })
      );

      const loaded = await config.loadConfig();
      expect(loaded.concurrency).toBe(2);
    });

    it('should reuse the cached config when no path is given', async () => {
      const rcPath = join(FAKE_HOME, '.maccleanerrc');
      await writeFile(rcPath, JSON.stringify({ concurrency: 8 }));
      await config.loadConfig();

      await writeFile(rcPath, JSON.stringify({ concurrency: 1 }));
      const loaded = await config.loadConfig();

      expect(loaded.concurrency).toBe(8);
    });

    it('should reject config path outside home directory', async () => {
      const loaded = await config.loadConfig('/etc/malicious-config.json');
      // Should fall back to defaults
      expect(loaded.downloadsDaysOld).toBe(30);
    });

    it('should ignore a config file larger than 100KB', async () => {
      const configPath = join(testConfigDir, 'huge.json');
      await writeFile(configPath, JSON.stringify({ concurrency: 8, padding: 'x'.repeat(200 * 1024) }));
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      const loaded = await config.loadConfig(configPath);

      expect(loaded.concurrency).toBe(4);
      expect(warn).toHaveBeenCalledWith('Config file too large, using defaults');
      warn.mockRestore();
    });

    it('should validate numeric values within bounds', async () => {
      const configPath = join(testConfigDir, 'invalid-numbers.json');
      await writeFile(configPath, JSON.stringify({
        downloadsDaysOld: -5,  // Invalid: negative
        concurrency: 100,      // Invalid: too high
        backupRetentionDays: 0, // Invalid: zero
        largeFilesMinSize: 10, // Invalid: below 1KB
      }));
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      const loaded = await config.loadConfig(configPath);
      // Should use defaults for invalid values
      expect(loaded.downloadsDaysOld).toBe(30);
      expect(loaded.concurrency).toBe(4);
      expect(loaded.backupRetentionDays).toBe(7);
      expect(loaded.largeFilesMinSize).toBe(500 * 1024 * 1024);
      expect(warn).toHaveBeenCalledTimes(4);
      warn.mockRestore();
    });

    it('should accept numeric values within bounds', async () => {
      const configPath = join(testConfigDir, 'valid-numbers.json');
      await writeFile(configPath, JSON.stringify({
        downloadsDaysOld: 90,
        concurrency: 8,
        backupRetentionDays: 30,
        largeFilesMinSize: 1024 * 1024,
      }));

      const loaded = await config.loadConfig(configPath);

      expect(loaded).toMatchObject({
        downloadsDaysOld: 90,
        concurrency: 8,
        backupRetentionDays: 30,
        largeFilesMinSize: 1024 * 1024,
      });
    });

    it('should coerce boolean fields', async () => {
      const configPath = join(testConfigDir, 'booleans.json');
      await writeFile(configPath, JSON.stringify({
        backupEnabled: 1,
        parallelScans: 0,
        filePicker: 'yes',
      }));

      const loaded = await config.loadConfig(configPath);

      expect(loaded.backupEnabled).toBe(true);
      expect(loaded.parallelScans).toBe(false);
      expect(loaded.filePicker).toBe(true);
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

    it('should ignore category fields that are not arrays', async () => {
      const configPath = join(testConfigDir, 'non-array-categories.json');
      await writeFile(configPath, JSON.stringify({
        defaultCategories: 'trash',
        excludeCategories: { trash: true },
      }));

      const loaded = await config.loadConfig(configPath);
      expect(loaded.defaultCategories).toBeUndefined();
      expect(loaded.excludeCategories).toBeUndefined();
    });

    it('should handle malformed JSON gracefully', async () => {
      const configPath = join(testConfigDir, 'malformed.json');
      await writeFile(configPath, '{ invalid json }');
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      const loaded = await config.loadConfig(configPath);
      // Should fall back to defaults
      expect(loaded.downloadsDaysOld).toBe(30);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Invalid JSON in config file'));
      warn.mockRestore();
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
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      const loaded = await config.loadConfig(configPath);
      expect(loaded.extraPaths?.nodeModules).toEqual([join(FAKE_HOME, 'Projects'), '/Users/other']);
      expect(loaded.extraPaths?.projects).toEqual([join(FAKE_HOME, 'Developer')]);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Skipping path outside allowed directories'));
      warn.mockRestore();
    });

    it('should drop non-string extra paths and cap the list at 50 entries', async () => {
      const configPath = join(testConfigDir, 'too-many-paths.json');
      await writeFile(configPath, JSON.stringify({
        extraPaths: {
          nodeModules: [42, null, ...Array.from({ length: 60 }, (_, i) => `~/Projects/p${i}`)],
          projects: 'not-an-array',
        }
      }));

      const loaded = await config.loadConfig(configPath);

      expect(loaded.extraPaths?.nodeModules).toHaveLength(50);
      expect(loaded.extraPaths?.nodeModules?.[0]).toBe(join(FAKE_HOME, 'Projects', 'p0'));
      expect(loaded.extraPaths?.projects).toEqual([]);
    });

    it('should ignore extraPaths keys that are not set', async () => {
      const configPath = join(testConfigDir, 'empty-extra-paths.json');
      await writeFile(configPath, JSON.stringify({ extraPaths: {} }));

      const loaded = await config.loadConfig(configPath);

      expect(loaded.extraPaths).toEqual({});
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

    it('should save to the default config path and update the cache', async () => {
      await config.saveConfig({ concurrency: 3 });

      const written = JSON.parse(await readFile(join(FAKE_HOME, '.maccleanerrc'), 'utf-8'));
      expect(written).toEqual({ concurrency: 3 });
      expect(await config.loadConfig()).toEqual({ concurrency: 3 });
    });
  });

  describe('configExists', () => {
    it('should return false when config does not exist', async () => {
      expect(await config.configExists()).toBe(false);
    });

    it('should return true when a config file exists', async () => {
      await writeFile(join(FAKE_HOME, '.maccleanerrc'), '{}');

      expect(await config.configExists()).toBe(true);
    });
  });

  describe('initConfig', () => {
    it('should write a default config file to the home directory', async () => {
      const path = await config.initConfig();

      expect(path).toBe(join(FAKE_HOME, '.maccleanerrc'));
      const written = JSON.parse(await readFile(path, 'utf-8'));
      expect(written).toMatchObject({
        downloadsDaysOld: 30,
        concurrency: 4,
        extraPaths: { nodeModules: ['~/Projects', '~/Developer', '~/Code'] },
      });
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
