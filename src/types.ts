export type CategoryId =
  | 'system-cache'
  | 'system-logs'
  | 'temp-files'
  | 'trash'
  | 'downloads'
  | 'browser-cache'
  | 'dev-cache'
  | 'homebrew'
  | 'docker'
  | 'ios-backups'
  | 'mail-attachments'
  | 'language-files'
  | 'large-files'
  | 'node-modules'
  | 'duplicates';

export type CategoryGroup = 'System Junk' | 'Development' | 'Storage' | 'Browsers' | 'Large Files';

export type SafetyLevel = 'safe' | 'moderate' | 'risky';

export interface Category {
  id: CategoryId;
  name: string;
  group: CategoryGroup;
  description: string;
  safetyLevel: SafetyLevel;
  safetyNote?: string;
  supportsFileSelection?: boolean;
}

export interface CleanableItem {
  path: string;
  size: number;
  name: string;
  isDirectory: boolean;
  modifiedAt?: Date;
}

export interface ScanResult {
  category: Category;
  items: CleanableItem[];
  totalSize: number;
  error?: string;
}

export interface ScanSummary {
  results: ScanResult[];
  totalSize: number;
  totalItems: number;
}

export interface CleanResult {
  category: Category;
  cleanedItems: number;
  freedSpace: number;
  errors: string[];
}

export interface CleanSummary {
  results: CleanResult[];
  totalFreedSpace: number;
  totalCleanedItems: number;
  totalErrors: number;
}

export interface ScannerOptions {
  verbose?: boolean;
  daysOld?: number;
  minSize?: number;
}

export interface Scanner {
  category: Category;
  scan(options?: ScannerOptions): Promise<ScanResult>;
  clean(items: CleanableItem[], dryRun?: boolean): Promise<CleanResult>;
}

export const CATEGORIES: Record<CategoryId, Category> = {
  'system-cache': {
    id: 'system-cache',
    name: 'User Cache Files',
    group: 'System Junk',
    description: 'Application caches stored in ~/Library/Caches',
    safetyLevel: 'moderate',
    safetyNote: 'Some apps may need to rebuild cache on next launch',
  },
  'system-logs': {
    id: 'system-logs',
    name: 'System Log Files',
    group: 'System Junk',
    description: 'System and application logs',
    safetyLevel: 'moderate',
    safetyNote: 'Logs may be useful for debugging issues',
  },
  'temp-files': {
    id: 'temp-files',
    name: 'Temporary Files',
    group: 'System Junk',
    description: 'Temporary files in /tmp and /var/folders',
    safetyLevel: 'safe',
  },
  'trash': {
    id: 'trash',
    name: 'Trash',
    group: 'Storage',
    description: 'Files in the Trash bin',
    safetyLevel: 'safe',
  },
  'downloads': {
    id: 'downloads',
    name: 'Old Downloads',
    group: 'Storage',
    description: 'Downloads older than 30 days',
    safetyLevel: 'risky',
    safetyNote: 'May contain important files you forgot about',
    supportsFileSelection: true,
  },
  'browser-cache': {
    id: 'browser-cache',
    name: 'Browser Cache',
    group: 'Browsers',
    description: 'Cache from Chrome, Safari, Firefox, and Arc',
    safetyLevel: 'safe',
  },
  'dev-cache': {
    id: 'dev-cache',
    name: 'Development Cache',
    group: 'Development',
    description: 'npm, yarn, pip, Xcode DerivedData, CocoaPods cache',
    safetyLevel: 'moderate',
    safetyNote: 'Projects will need to rebuild/reinstall dependencies',
  },
  'homebrew': {
    id: 'homebrew',
    name: 'Homebrew Cache',
    group: 'Development',
    description: 'Homebrew download cache and old versions',
    safetyLevel: 'safe',
  },
  'docker': {
    id: 'docker',
    name: 'Docker',
    group: 'Development',
    description: 'Unused Docker images, containers, and volumes',
    safetyLevel: 'safe',
  },
  'ios-backups': {
    id: 'ios-backups',
    name: 'iOS Backups',
    group: 'Storage',
    description: 'iPhone and iPad backup files',
    safetyLevel: 'risky',
    safetyNote: 'DANGER: You may lose important device backups permanently!',
  },
  'mail-attachments': {
    id: 'mail-attachments',
    name: 'Mail Attachments',
    group: 'Storage',
    description: 'Downloaded email attachments from Mail.app',
    safetyLevel: 'risky',
    safetyNote: 'May contain important documents and files',
  },
  'language-files': {
    id: 'language-files',
    name: 'Language Files',
    group: 'System Junk',
    description: 'Unused language localizations in applications',
    safetyLevel: 'risky',
    safetyNote: 'May break apps if you switch system language',
  },
  'large-files': {
    id: 'large-files',
    name: 'Large Files',
    group: 'Large Files',
    description: 'Files larger than 500MB for review',
    safetyLevel: 'risky',
    safetyNote: 'Review each file carefully before deleting',
    supportsFileSelection: true,
  },
  'node-modules': {
    id: 'node-modules',
    name: 'Node Modules',
    group: 'Development',
    description: 'Orphaned node_modules in old projects',
    safetyLevel: 'moderate',
    safetyNote: 'Projects will need npm install to restore',
  },
  'duplicates': {
    id: 'duplicates',
    name: 'Duplicate Files',
    group: 'Storage',
    description: 'Files with identical content',
    safetyLevel: 'risky',
    safetyNote: 'Review carefully - keeps newest copy by default',
  },
};

