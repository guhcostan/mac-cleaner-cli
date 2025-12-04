import { homedir } from 'os';
import { join } from 'path';

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

export function expandPath(path: string): string {
  if (path.startsWith('~')) {
    return path.replace('~', HOME);
  }
  return path;
}

export function isSystemPath(path: string): boolean {
  const systemPaths = [
    '/System',
    '/usr',
    '/bin',
    '/sbin',
    '/private/var/db',
    '/private/var/root',
  ];
  return systemPaths.some((p) => path.startsWith(p));
}

