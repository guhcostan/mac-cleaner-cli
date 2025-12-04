import { readFile, writeFile, access } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import type { CategoryId } from '../types.js';

const CONFIG_PATHS = [
  join(homedir(), '.cleanmymacrc'),
  join(homedir(), '.config', 'clean-my-mac', 'config.json'),
];

export interface Config {
  defaultCategories?: CategoryId[];
  excludeCategories?: CategoryId[];
  downloadsDaysOld?: number;
  largeFilesMinSize?: number;
  backupEnabled?: boolean;
  backupRetentionDays?: number;
  parallelScans?: boolean;
  concurrency?: number;
  extraPaths?: {
    nodeModules?: string[];
    projects?: string[];
  };
}

const DEFAULT_CONFIG: Config = {
  downloadsDaysOld: 30,
  largeFilesMinSize: 500 * 1024 * 1024,
  backupEnabled: false,
  backupRetentionDays: 7,
  parallelScans: true,
  concurrency: 4,
};

let cachedConfig: Config | null = null;

export async function loadConfig(configPath?: string): Promise<Config> {
  if (cachedConfig && !configPath) {
    return cachedConfig;
  }

  const paths = configPath ? [configPath] : CONFIG_PATHS;

  for (const path of paths) {
    try {
      await access(path);
      const content = await readFile(path, 'utf-8');
      const parsed = JSON.parse(content) as Partial<Config>;
      cachedConfig = { ...DEFAULT_CONFIG, ...parsed };
      return cachedConfig;
    } catch {
      continue;
    }
  }

  cachedConfig = DEFAULT_CONFIG;
  return cachedConfig;
}

export async function saveConfig(config: Config, configPath?: string): Promise<void> {
  const path = configPath ?? CONFIG_PATHS[0];
  await writeFile(path, JSON.stringify(config, null, 2));
  cachedConfig = config;
}

export function getDefaultConfig(): Config {
  return { ...DEFAULT_CONFIG };
}

export async function configExists(): Promise<boolean> {
  for (const path of CONFIG_PATHS) {
    try {
      await access(path);
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

export function clearConfigCache(): void {
  cachedConfig = null;
}

export async function initConfig(): Promise<string> {
  const configPath = CONFIG_PATHS[0];
  const defaultConfig: Config = {
    downloadsDaysOld: 30,
    largeFilesMinSize: 500 * 1024 * 1024,
    backupEnabled: false,
    backupRetentionDays: 7,
    parallelScans: true,
    concurrency: 4,
    extraPaths: {
      nodeModules: ['~/Projects', '~/Developer', '~/Code'],
      projects: ['~/Projects', '~/Developer', '~/Code'],
    },
  };

  await writeFile(configPath, JSON.stringify(defaultConfig, null, 2));
  return configPath;
}


