import { readFile, writeFile, access } from 'fs/promises';
import { join, resolve } from 'path';
import { homedir } from 'os';
import type { CategoryId } from '../types.js';

const CONFIG_PATHS = [
  join(homedir(), '.maccleanerrc'),
  join(homedir(), '.config', 'mac-cleaner-cli', 'config.json'),
];

// Valid category IDs for validation
const VALID_CATEGORIES: CategoryId[] = [
  'system-cache', 'system-logs', 'browser-cache', 'dev-cache', 
  'node-modules', 'downloads', 'trash', 'temp-files', 'ios-backups',
  'mail-attachments', 'large-files', 'duplicates', 'docker', 
  'homebrew', 'language-files'
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

/**
 * Configuration validation constraints.
 */
const CONFIG_CONSTRAINTS = {
  downloadsDaysOld: { min: 1, max: 365 },
  largeFilesMinSize: { min: 1024, max: 100 * 1024 * 1024 * 1024 }, // 1KB to 100GB
  backupRetentionDays: { min: 1, max: 365 },
  concurrency: { min: 1, max: 16 },
  maxExtraPaths: 50,
};

/**
 * Validates a config object and returns a sanitized version.
 * Throws an error if critical validation fails.
 */
function validateConfig(config: Partial<Config>): Config {
  const validated: Config = {};
  const home = homedir();

  // Validate numeric fields with constraints
  if (config.downloadsDaysOld !== undefined) {
    const val = Number(config.downloadsDaysOld);
    if (!Number.isInteger(val) || val < CONFIG_CONSTRAINTS.downloadsDaysOld.min || val > CONFIG_CONSTRAINTS.downloadsDaysOld.max) {
      console.warn(`Invalid downloadsDaysOld value, using default`);
    } else {
      validated.downloadsDaysOld = val;
    }
  }

  if (config.largeFilesMinSize !== undefined) {
    const val = Number(config.largeFilesMinSize);
    if (!Number.isInteger(val) || val < CONFIG_CONSTRAINTS.largeFilesMinSize.min || val > CONFIG_CONSTRAINTS.largeFilesMinSize.max) {
      console.warn(`Invalid largeFilesMinSize value, using default`);
    } else {
      validated.largeFilesMinSize = val;
    }
  }

  if (config.backupRetentionDays !== undefined) {
    const val = Number(config.backupRetentionDays);
    if (!Number.isInteger(val) || val < CONFIG_CONSTRAINTS.backupRetentionDays.min || val > CONFIG_CONSTRAINTS.backupRetentionDays.max) {
      console.warn(`Invalid backupRetentionDays value, using default`);
    } else {
      validated.backupRetentionDays = val;
    }
  }

  if (config.concurrency !== undefined) {
    const val = Number(config.concurrency);
    if (!Number.isInteger(val) || val < CONFIG_CONSTRAINTS.concurrency.min || val > CONFIG_CONSTRAINTS.concurrency.max) {
      console.warn(`Invalid concurrency value, using default`);
    } else {
      validated.concurrency = val;
    }
  }

  // Validate boolean fields
  if (config.backupEnabled !== undefined) {
    validated.backupEnabled = Boolean(config.backupEnabled);
  }

  if (config.parallelScans !== undefined) {
    validated.parallelScans = Boolean(config.parallelScans);
  }

  // Validate category arrays
  if (config.defaultCategories !== undefined) {
    if (Array.isArray(config.defaultCategories)) {
      validated.defaultCategories = config.defaultCategories.filter(
        (cat): cat is CategoryId => VALID_CATEGORIES.includes(cat as CategoryId)
      );
    }
  }

  if (config.excludeCategories !== undefined) {
    if (Array.isArray(config.excludeCategories)) {
      validated.excludeCategories = config.excludeCategories.filter(
        (cat): cat is CategoryId => VALID_CATEGORIES.includes(cat as CategoryId)
      );
    }
  }

  // Validate extraPaths with security checks
  if (config.extraPaths !== undefined && typeof config.extraPaths === 'object') {
    validated.extraPaths = {};

    const validatePaths = (paths: unknown): string[] => {
      if (!Array.isArray(paths)) return [];
      
      return paths
        .filter((p): p is string => typeof p === 'string')
        .slice(0, CONFIG_CONSTRAINTS.maxExtraPaths) // Limit number of paths
        .map(p => {
          // Expand ~ to home directory
          if (p.startsWith('~/')) {
            return join(home, p.slice(2));
          }
          return p;
        })
        .filter(p => {
          // Security: ensure paths are within home directory or common dev locations
          const resolved = resolve(p);
          const allowedPrefixes = [
            home,
            '/Users',
            '/Volumes',
          ];
          const isAllowed = allowedPrefixes.some(prefix => 
            resolved.startsWith(prefix + '/') || resolved === prefix
          );
          if (!isAllowed) {
            console.warn(`Skipping path outside allowed directories: ${p}`);
          }
          return isAllowed;
        });
    };

    if (config.extraPaths.nodeModules) {
      validated.extraPaths.nodeModules = validatePaths(config.extraPaths.nodeModules);
    }

    if (config.extraPaths.projects) {
      validated.extraPaths.projects = validatePaths(config.extraPaths.projects);
    }
  }

  return validated;
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

  // Security: validate custom config path is within allowed directories
  if (configPath) {
    const home = homedir();
    const resolved = resolve(configPath);
    const allowedDirs = [home, join(home, '.config')];
    
    if (!allowedDirs.some(dir => resolved.startsWith(dir + '/') || resolved === dir)) {
      console.warn('Config path must be within home directory, using defaults');
      cachedConfig = DEFAULT_CONFIG;
      return cachedConfig;
    }
  }

  const paths = configPath ? [configPath] : CONFIG_PATHS;

  for (const path of paths) {
    try {
      await access(path);
      const content = await readFile(path, 'utf-8');
      
      // Limit config file size to prevent DoS
      if (content.length > 100 * 1024) { // 100KB max
        console.warn('Config file too large, using defaults');
        continue;
      }
      
      const parsed = JSON.parse(content) as Partial<Config>;
      
      // Validate and sanitize the config
      const validated = validateConfig(parsed);
      
      cachedConfig = { ...DEFAULT_CONFIG, ...validated };
      return cachedConfig;
    } catch (error) {
      if (error instanceof SyntaxError) {
        console.warn(`Invalid JSON in config file: ${path}`);
      }
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



