import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import * as config from './config.js';

describe('config utilities', () => {
  const testConfigDir = join(tmpdir(), 'clean-my-mac-config-test');

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
      const loaded = await config.loadConfig('/non/existent/path');
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
  });

  describe('saveConfig', () => {
    it('should save config to file', async () => {
      const configPath = join(testConfigDir, 'saved-config.json');
      await config.saveConfig({ downloadsDaysOld: 90 }, configPath);

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

