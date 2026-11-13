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
  | 'rust-artifacts'
  | 'go-artifacts'
  | 'node-build-artifacts'
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

export type Ecosystem = 'node' | 'rust' | 'go';
export type RepoCategoryId = 'node-modules' | 'node-build-artifacts' | 'rust-artifacts' | 'go-artifacts';
export interface RepoRoot { readonly input: string; readonly path: string; readonly nodeOnly: boolean; readonly dev: number; readonly ino: number }
export interface RepoPolicy {
  readonly roots: readonly RepoRoot[];
  readonly categories: readonly RepoCategoryId[];
  readonly excludePaths: readonly string[];
  readonly daysOld: number;
  readonly configDaysOld: number;
  readonly maxDepth: number;
  readonly explicitRoots: boolean;
}
export interface ArtifactEvidence {
  readonly category: RepoCategoryId;
  readonly marker: string;
  readonly markerDev: number;
  readonly markerIno: number;
  readonly dev: number;
  readonly ino: number;
}
export interface CleanContext {
  readonly repoPolicy: RepoPolicy;
  readonly evidence: Readonly<Record<string, ArtifactEvidence>>;
  readonly complete: boolean;
}
export interface RepoRequestOptions {
  roots?: string[];
  includeEcosystems?: Ecosystem[];
  excludePaths?: string[];
}

export interface CleanableItem {
  path: string;
  size: number;
  name: string;
  isDirectory: boolean;
  modifiedAt?: Date;
  detail?: string;
  id?: string;
  fileCount?: number;
  newestEntryModifiedAt?: Date;
  artifact?: ArtifactEvidence;
}

export interface ScanResult {
  category: Category;
  items: CleanableItem[];
  totalSize: number;
  error?: string;
  skipped?: string;
  warnings?: { path: string; reason: string }[];
  context?: CleanContext;
}

export interface ScanSummary {
  results: ScanResult[];
  totalSize: number;
  totalItems: number;
  cancelled?: boolean;
}

export interface CleanupOutcome {
  category: CategoryId;
  path?: string;
  scope: 'item' | 'action';
  status: 'deleted' | 'backed-up' | 'would-delete' | 'would-back-up' | 'rejected' | 'skipped';
  reason?: string;
  size: number;
}
export interface PreparedCleanup {
  item: CleanableItem;
  reason?: string;
  execute(dryRun: boolean): Promise<CleanResult>;
}
export interface CleanResult {
  category: Category;
  cleanedItems: number;
  outcomes?: CleanupOutcome[];
  wouldFreeSpace?: number;
  wouldBackUpSize?: number;
  wouldCleanItems?: number;
  /** Estimated logical bytes removed. Zero when items went to the backup. */
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
  wouldFreeSpace?: number;
  wouldBackUpSize?: number;
  wouldCleanItems?: number;
}

export type ScanEvent =
  | { type: 'start'; runId: string; categories: CategoryId[] }
  | { type: 'progress'; runId: string; category?: CategoryId; path?: string; completed: number }
  | { type: 'candidate'; runId: string; category: CategoryId; item: CleanableItem }
  | { type: 'warning'; runId: string; category?: CategoryId; path?: string; reason: string }
  | { type: 'done'; runId: string; cancelled: boolean; candidates: number; warnings: number };

export interface ScannerOptions extends RepoRequestOptions {
  onEvent?: (event: ScanEvent) => void;
  signal?: AbortSignal;
  /** Assigned by the registry; standalone callers may omit it. */
  runId?: string;
  verbose?: boolean;
  daysOld?: number;
  minSize?: number;
}

export interface Scanner {
  category: Category;
  /** false when cleanup is delegated to an external tool and cannot be backed up. */
  readonly supportsBackup?: boolean;
  scan(options?: ScannerOptions): Promise<ScanResult>;
  prepareClean?(items: CleanableItem[], backupDir?: string, context?: CleanContext): Promise<PreparedCleanup[]>;
  clean(items: CleanableItem[], dryRun?: boolean, backupDir?: string, context?: CleanContext): Promise<CleanResult>;
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
    description: 'Stale dependencies beside package.json',
    safetyLevel: 'moderate',
    safetyNote: 'Projects will need npm install to restore',
  },
  'go-artifacts': {
    id: 'go-artifacts', name: 'Go Artifacts', group: 'Development',
    description: 'Opt-in ignored bin/dist beside go.mod', safetyLevel: 'risky',
    safetyNote: 'May contain untracked files you want to keep. Explicit Go opt-in and review are required.', supportsFileSelection: true,
  },
  'rust-artifacts': {
    id: 'rust-artifacts', name: 'Rust Artifacts', group: 'Development',
    description: 'target directories beside Cargo.toml', safetyLevel: 'moderate',
    safetyNote: 'Rust projects will need to rebuild', supportsFileSelection: true,
  },
  'node-build-artifacts': {
    id: 'node-build-artifacts', name: 'Node Build Artifacts', group: 'Development',
    description: 'Build output beside package.json', safetyLevel: 'risky',
    safetyNote: 'May contain untracked files you want to keep. Review every output directory.', supportsFileSelection: true,
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

