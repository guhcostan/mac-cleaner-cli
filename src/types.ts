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
  | 'git-worktrees'
  | 'duplicates'
  | 'launch-agents';

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
  detail?: string;
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
  /** Space actually returned to the disk. Zero when items went to the backup. */
  freedSpace: number;
  /** Size moved into the backup. Still occupying disk until `backup --clean`. */
  backedUpSize?: number;
  backupDir?: string;
  errors: string[];
}

export interface CleanSummary {
  results: CleanResult[];
  totalFreedSpace: number;
  totalBackedUpSize?: number;
  backupDir?: string;
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
  /** false when cleanup is delegated to an external tool and cannot be backed up. */
  readonly supportsBackup?: boolean;
  scan(options?: ScannerOptions): Promise<ScanResult>;
  clean(items: CleanableItem[], dryRun?: boolean, backupDir?: string): Promise<CleanResult>;
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
    // Not `safe`: cleanup runs `brew cleanup --prune=all`, which removes ALL old
    // formula versions — not just the download cache. Rolling back to a previous
    // version then requires downloading it again (and that is not always possible).
    safetyLevel: 'moderate',
    safetyNote: 'Runs "brew cleanup --prune=all": old formula versions are removed, not just downloads',
  },
  'docker': {
    id: 'docker',
    name: 'Docker',
    group: 'Development',
    description: 'Unused Docker images, containers, and build cache',
    // Not `safe`: removing images not used by a running container forces a
    // re-pull (or rebuild) of everything. On a poor connection, or for an image
    // no longer present in the registry, that is not reversible.
    safetyLevel: 'moderate',
    safetyNote: 'Removes images not used by a RUNNING container — they must be pulled or rebuilt again',
  },
  'ios-backups': {
    id: 'ios-backups',
    name: 'iOS Backups',
    group: 'Storage',
    description: 'iPhone and iPad backup files',
    safetyLevel: 'risky',
    safetyNote: 'DANGER: You may lose important device backups permanently!',
    supportsFileSelection: true,
  },
  'mail-attachments': {
    id: 'mail-attachments',
    name: 'Mail Attachments',
    group: 'Storage',
    description: 'Downloaded email attachments from Mail.app',
    safetyLevel: 'risky',
    safetyNote: 'May contain important documents and files',
    supportsFileSelection: true,
  },
  'language-files': {
    id: 'language-files',
    name: 'Language Files',
    group: 'System Junk',
    description: 'Unused language localizations in applications',
    safetyLevel: 'risky',
    // The old note ("may break apps if you switch system language") described the
    // smallest of the problems. Deleting .lproj folders from inside a .app
    // modifies the bundle and BREAKS its code signature — Gatekeeper may refuse
    // to open the app and delta/Sparkle updates may fail. It has nothing to do
    // with switching the system language.
    safetyNote: 'BREAKS the app code signature: macOS may refuse to open the app and updates may fail',
    supportsFileSelection: true,
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
  'git-worktrees': {
    id: 'git-worktrees',
    name: 'Git Worktrees',
    group: 'Development',
    description: 'Stale or orphaned git worktrees from agents and local checkouts',
    safetyLevel: 'risky',
    safetyNote: 'Worktrees may contain uncommitted work. Review each path before deleting.',
    supportsFileSelection: true,
  },
  'duplicates': {
    id: 'duplicates',
    name: 'Duplicate Files',
    group: 'Storage',
    description: 'Files with identical content',
    safetyLevel: 'risky',
    safetyNote: 'Review carefully - keeps newest copy by default',
    supportsFileSelection: true,
  },
  'launch-agents': {
    id: 'launch-agents',
    name: 'Orphaned Launch Agents',
    group: 'System Junk',
    description: 'Launch agents pointing to non-existent applications',
    safetyLevel: 'moderate',
    safetyNote: 'Removing launch agents will prevent applications from auto-starting. Only orphaned items (pointing to non-existent apps) are detected.',
  },
};

