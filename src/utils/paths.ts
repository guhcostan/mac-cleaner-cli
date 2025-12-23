import { homedir } from 'os';
import { join, resolve } from 'path';

export const HOME = homedir();

export const PATHS = {
  userCaches: join(HOME, 'Library', 'Caches'),
  systemCaches: '/Library/Caches',
  userLogs: join(HOME, 'Library', 'Logs'),
  systemLogs: '/var/log',
  tmp: '/tmp',
  varFolders: '/private/var/folders',
  trash: join(HOME, '.Trash'),
  downloads: join(HOME, 'Downloads'),
  documents: join(HOME, 'Documents'),

  chromeCacheDefault: join(HOME, 'Library', 'Caches', 'Google', 'Chrome', 'Default', 'Cache'),
  chromeCache: join(HOME, 'Library', 'Caches', 'Google', 'Chrome'),
  safariCache: join(HOME, 'Library', 'Caches', 'com.apple.Safari'),
  firefoxProfiles: join(HOME, 'Library', 'Caches', 'Firefox', 'Profiles'),
  arcCache: join(HOME, 'Library', 'Caches', 'company.thebrowser.Browser'),

  npmCache: join(HOME, '.npm', '_cacache'),
  yarnCache: join(HOME, 'Library', 'Caches', 'Yarn'),
  pnpmCache: join(HOME, 'Library', 'pnpm', 'store'),
  pipCache: join(HOME, '.cache', 'pip'),
  xcodeDerivedData: join(HOME, 'Library', 'Developer', 'Xcode', 'DerivedData'),
  xcodeArchives: join(HOME, 'Library', 'Developer', 'Xcode', 'Archives'),
  xcodeSimulators: join(HOME, 'Library', 'Developer', 'CoreSimulator', 'Devices'),
  cocoapodsCache: join(HOME, 'Library', 'Caches', 'CocoaPods'),
  gradleCache: join(HOME, '.gradle', 'caches'),
  cargoCache: join(HOME, '.cargo', 'registry'),

  iosBackups: join(HOME, 'Library', 'Application Support', 'MobileSync', 'Backup'),

  mailDownloads: join(HOME, 'Library', 'Containers', 'com.apple.mail', 'Data', 'Library', 'Mail Downloads'),

  applications: '/Applications',
};

/**
 * Expands a path that starts with ~ to use the full home directory.
 * Also validates that the resulting path doesn't escape expected boundaries.
 * 
 * @param path - The path to expand
 * @param allowOutsideHome - If false (default), throws an error if path escapes home directory
 * @returns The expanded path
 * @throws Error if the path contains traversal attempts and allowOutsideHome is false
 */
export function expandPath(path: string, allowOutsideHome = false): string {
  let expanded = path;
  
  if (path.startsWith('~/')) {
    expanded = join(HOME, path.slice(2));
  } else if (path === '~') {
    expanded = HOME;
  }
  
  // Resolve the path to catch any traversal attempts like ~/../../etc
  const resolved = resolve(expanded);
  
  // Security check: ensure the resolved path is within home directory
  if (!allowOutsideHome && path.startsWith('~')) {
    if (!resolved.startsWith(HOME + '/') && resolved !== HOME) {
      throw new Error(`Path traversal detected: ${path} resolves outside home directory`);
    }
  }
  
  return resolved;
}

/**
 * Validates that a path doesn't contain obvious traversal patterns.
 * This is a quick check before more expensive operations.
 */
export function hasTraversalPattern(path: string): boolean {
  // Check for common traversal patterns
  return path.includes('../') || 
         path.includes('/..') || 
         path === '..' ||
         /\/\.\.($|\/)/.test(path);
}

/**
 * System paths that should NEVER be modified.
 * Note: This is duplicated in fs.ts for performance. Keep them in sync.
 */
const SYSTEM_PATHS = [
  '/System',
  '/usr',
  '/bin',
  '/sbin',
  '/etc',
  '/var',
  '/private/var/db',
  '/private/var/root',
  '/Library/Apple',
  '/Applications/Utilities',
];

/**
 * Checks if a path is a protected system path.
 * @deprecated Use isProtectedPath from fs.ts instead for consistency
 */
export function isSystemPath(path: string): boolean {
  const resolved = resolve(path);
  return SYSTEM_PATHS.some((p) => resolved === p || resolved.startsWith(p + '/'));
}

/**
 * Shortens absolute paths by replacing home directory with `~`.
 * Inverse of expandPath.
 */
export function contractPath(absolutePath: string): string {
  if (absolutePath.startsWith(HOME)) {
    return absolutePath.replace(HOME, '~');
  }
  return absolutePath;
}

/**
 * Truncates a directory path -> Ellipsis strategy.
 *
 * Strategy:
 * 1. Abbreviate home directory to `~/`
 * 2. If path fits within maxLength, return as is
 * 3. For long paths, show [ part1 + ... + last 2 parts ]
 * 4. If still too long, hard truncate with ellipsis at end
 * 
 * @param dirPath - Absolute directory path to truncate
 * @param absolutePaths - If false, abbreviate home directory to `~/`
 * @param maxLength - Maximum display length (default: 50)
 * @returns Truncated path for display
 * 
 * @example
 * truncateDirectoryPath('/Users/mac/Documents/Projects/MyApp/src', false)
 * // Returns: "~/Documents/.../MyApp/src"
 */
export function truncateDirectoryPath(
  dirPath: string,
  absolutePaths: boolean,
  maxLength: number = 50
): string {
  // 1: Abbreviate home dir unless absolutePaths is used
  const displayPath = absolutePaths ? dirPath : contractPath(dirPath);
 
  // 2: If it fits, return as is
  if (displayPath.length <= maxLength) {
    return displayPath;
  }
 
  // 3: Split for truncation
  const parts = displayPath.split('/').filter((p) => p.length > 0);
 
  // For very short paths (1 or 2), just hard truncate
  if (parts.length <= 2) {
    return displayPath.substring(0, maxLength - 3) + '...';
  }
 
  // 4: Elide middle strategy - show part1 + ... + last 2 parts
  const firstPart = parts[0] === '~' ? '~' : '/' + parts[0];
  const lastTwoParts = parts.slice(-2).join('/');
  const truncated = `${firstPart}/.../${lastTwoParts}`;
 
  // If the truncated version fits, use it
  if (truncated.length <= maxLength) {
    return truncated;
  }
 
  // 5: Even the truncated version is too long - hard truncate it
  return truncated.substring(0, maxLength - 3) + '...';
}

/**
 * Truncates long filenames except extension.
 * Uses Ellipsis placement: beginning...end.ext
 */
export function truncateFileName(fileName: string, maxLength: number): string {
  if (fileName.length <= maxLength) {
    return fileName;
  }

  const lastDot = fileName.lastIndexOf('.');
  const ext = lastDot > 0 ? fileName.substring(lastDot) : '';
  const nameWithoutExt = lastDot > 0 ? fileName.substring(0, lastDot) : fileName;

  const ellipsis = '...';
  const availableLength = maxLength - ext.length - ellipsis.length;

  if (availableLength <= 0) {
    return `${fileName.substring(0, maxLength - ellipsis.length)}${ellipsis}`;
  }

  const firstPartLength = Math.ceil(availableLength / 2);
  const lastPartLength = Math.floor(availableLength / 2);

  return `${nameWithoutExt.substring(0, firstPartLength)}${ellipsis}${nameWithoutExt.substring(nameWithoutExt.length - lastPartLength)}${ext}`;
}

