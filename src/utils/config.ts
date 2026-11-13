import { readFile, writeFile, access } from 'fs/promises';
import { join, resolve } from 'path';
import { homedir } from 'os';
import { CATEGORIES, type CategoryId, type Ecosystem } from '../types.js';
import { debugError, errorCode, formatError } from './errors.js';

const CONFIG_PATHS = [
  join(homedir(), '.maccleanerrc'),
  join(homedir(), '.config', 'mac-cleaner-cli', 'config.json'),
];

// Valid category IDs for validation
const VALID_CATEGORIES = Object.keys(CATEGORIES) as CategoryId[];

export interface Config {
  /** A bad user config may not silently broaden repository cleanup. */
  repoPolicyError?: string;
  excludePaths?: string[];
  includeEcosystems?: Ecosystem[];
  nodeModulesDaysOld?: number;
  projectScanMaxDepth?: number;
  defaultCategories?: CategoryId[];
  excludeCategories?: CategoryId[];
  downloadsDaysOld?: number;
  largeFilesMinSize?: number;
  backupEnabled?: boolean;
  backupRetentionDays?: number;
  parallelScans?: boolean;
  concurrency?: number;
  filePicker?: boolean;
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
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('INVALID_CONFIG');
  for (const [key, max] of [['nodeModulesDaysOld', 365], ['projectScanMaxDepth', 16]] as const) {
    const value = config[key];
    if (value !== undefined) {
      if (!Number.isInteger(value) || value < 0 || value > max) throw new Error(`INVALID_CONFIG: ${key}`);
      validated[key] = value;
    }
  }
  if (config.excludePaths !== undefined) {
    // The full grammar is also validated by the repository policy normalizer.
    if (!Array.isArray(config.excludePaths) || config.excludePaths.some((p) => typeof p !== 'string')) throw new Error('INVALID_EXCLUSIONS');
    validated.excludePaths = [...config.excludePaths];
  }
  if (config.includeEcosystems !== undefined) {
    if (!Array.isArray(config.includeEcosystems) || config.includeEcosystems.some((e) => !['node', 'rust', 'go'].includes(e))) throw new Error('INVALID_ECOSYSTEM');
    validated.includeEcosystems = [...config.includeEcosystems];
  }

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

  if (config.filePicker !== undefined) {
    validated.filePicker = Boolean(config.filePicker);
  }

  // Validate category arrays
  if (config.defaultCategories !== undefined) {
    if (!Array.isArray(config.defaultCategories) || config.defaultCategories.some((cat) => !VALID_CATEGORIES.includes(cat))) throw new Error('INVALID_DEFAULT_CATEGORIES');
    if (Array.isArray(config.defaultCategories)) {
      validated.defaultCategories = config.defaultCategories.filter(
        (cat): cat is CategoryId => VALID_CATEGORIES.includes(cat as CategoryId)
      );
    }
  }

  if (config.excludeCategories !== undefined) {
    if (!Array.isArray(config.excludeCategories) || config.excludeCategories.some((cat) => !VALID_CATEGORIES.includes(cat))) throw new Error('INVALID_EXCLUDE_CATEGORIES');
    if (Array.isArray(config.excludeCategories)) {
      validated.excludeCategories = config.excludeCategories.filter(
        (cat): cat is CategoryId => VALID_CATEGORIES.includes(cat as CategoryId)
      );
    }
  }

  if (config.extraPaths !== undefined) {
    if (!config.extraPaths || typeof config.extraPaths !== 'object' || Array.isArray(config.extraPaths)) throw new Error('INVALID_ROOTS');
    validated.extraPaths = {};
    for (const key of ['nodeModules', 'projects'] as const) {
      const paths = config.extraPaths[key];
      if (paths === undefined) continue;
      if (!Array.isArray(paths) || paths.length > CONFIG_CONSTRAINTS.maxExtraPaths || paths.some((p) => typeof p !== 'string' || !p || p.includes('\0'))) throw new Error('INVALID_ROOTS');
      validated.extraPaths[key] = paths.map((p) => {
        const expanded = resolve(p.startsWith('~/') ? join(home, p.slice(2)) : p);
        if (![home, '/Users', '/Volumes'].some((base) => expanded.startsWith(base + '/')) || [home, '/Users', '/Volumes'].includes(expanded)) throw new Error('INVALID_ROOT');
        return expanded;
      });
    }
  }

  return validated;
}

const DEFAULT_CONFIG: Config = {
  nodeModulesDaysOld: 30,
  projectScanMaxDepth: 4,
  excludePaths: [],
  includeEcosystems: [],
  downloadsDaysOld: 30,
  largeFilesMinSize: 500 * 1024 * 1024,
  backupEnabled: false,
  backupRetentionDays: 7,
  parallelScans: true,
  concurrency: 4,
};

let cachedConfig: Config | null = null;

export async function loadConfig(configPath?: string, refresh = false): Promise<Config> {
  if (cachedConfig && !configPath && !refresh) {
    return cachedConfig;
  }

  // Security: validate custom config path is within allowed directories
  if (configPath) {
    const home = homedir();
    const resolved = resolve(configPath);
    const allowedDirs = [home, join(home, '.config')];
    
    if (!allowedDirs.some(dir => resolved.startsWith(dir + '/') || resolved === dir)) {
      console.warn('Config path must be within home directory, using defaults');
      cachedConfig = { ...DEFAULT_CONFIG, repoPolicyError: 'INVALID_CONFIG_PATH' };
      return cachedConfig;
    }
  }

  const paths = configPath ? [configPath] : CONFIG_PATHS;

  for (const path of paths) {
    try {
      const content = await readFile(path, 'utf-8');
      
      // Limit config file size to prevent DoS
      if (content.length > 100 * 1024) { // 100KB max
        throw new Error('CONFIG_TOO_LARGE');
      }
      
      const parsed = JSON.parse(content) as Partial<Config>;
      
      // Validate and sanitize the config
      const validated = validateConfig(parsed);
      
      cachedConfig = { ...DEFAULT_CONFIG, ...validated };
      return cachedConfig;
    } catch (error) {
      if (error instanceof SyntaxError) {
        console.warn(`Invalid JSON in config file: ${path}`);
      } else if (errorCode(error) !== 'ENOENT') {
        // A config file that exists but cannot be read would otherwise be
        // silently replaced by defaults
        console.warn(`Could not read config file ${path}: ${formatError(error)}`);
      }
      debugError(`loadConfig(${path})`, error);
      if (errorCode(error) !== 'ENOENT') {
        cachedConfig = { ...DEFAULT_CONFIG, repoPolicyError: `INVALID_CONFIG: ${formatError(error)}` };
        return cachedConfig;
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
    } catch (error) {
      debugError(`configExists(${path})`, error);
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
    nodeModulesDaysOld: 30,
  projectScanMaxDepth: 4,
  excludePaths: [],
  includeEcosystems: [],
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
