import type { CategoryGroup, CategoryId, SafetyLevel } from '../../../src/types.js';

export type { CategoryId };

export type RunMode = 'auto' | 'quick' | 'deep';

export interface AutoCleanSettings {
  enabled: boolean;
  /** Local time of day for the daily run, 0-23 */
  hour: number;
  /** 0-59 */
  minute: number;
  categories: CategoryId[];
  /** Temp files are only removed by automatic runs when untouched for this many hours */
  tempFilesMinAgeHours: number;
}

export interface Settings {
  autoClean: AutoCleanSettings;
  notifyAfterAutoClean: boolean;
  launchAtLogin: boolean;
  /** Show the amount freed by the last run next to the menu bar icon */
  showFreedInMenuBar: boolean;
}

export interface CategoryRunResult {
  id: CategoryId;
  name: string;
  freedSpace: number;
  cleanedItems: number;
  errors: string[];
}

export interface RunRecord {
  id: string;
  mode: RunMode;
  startedAt: string;
  finishedAt: string;
  freedSpace: number;
  cleanedItems: number;
  categories: CategoryRunResult[];
  errors: string[];
}

export interface CategoryInfo {
  id: CategoryId;
  name: string;
  group: CategoryGroup;
  description: string;
  safetyLevel: SafetyLevel;
  safetyNote?: string;
}

export interface ScanPreviewItem {
  name: string;
  path: string;
  size: number;
}

export interface CategoryScanPreview {
  id: CategoryId;
  name: string;
  safetyLevel: SafetyLevel;
  safetyNote?: string;
  totalSize: number;
  itemCount: number;
  topItems: ScanPreviewItem[];
  error?: string;
}

export interface DeepScanPreview {
  scannedAt: string;
  totalSize: number;
  categories: CategoryScanPreview[];
}

export type RunPhase = 'idle' | 'scanning' | 'cleaning';

export interface RunStatus {
  phase: RunPhase;
  mode?: RunMode;
  completed?: number;
  total?: number;
  current?: string;
}

export interface DiskInfo {
  total: number;
  free: number;
}

export interface AppState {
  version: string;
  settings: Settings;
  history: RunRecord[];
  totalFreed: number;
  nextAutoRunAt: string | null;
  status: RunStatus;
  disk: DiskInfo | null;
  fullDiskAccess: boolean | null;
  categories: CategoryInfo[];
}

export type SettingsPatch = Partial<Omit<Settings, 'autoClean'>> & {
  autoClean?: Partial<AutoCleanSettings>;
};

/** API exposed to the renderer through the preload script (window.cleaner) */
export interface CleanerApi {
  getState(): Promise<AppState>;
  updateSettings(patch: SettingsPatch): Promise<AppState>;
  runQuickClean(): Promise<RunRecord | null>;
  scanDeep(categoryIds: CategoryId[]): Promise<DeepScanPreview>;
  cleanDeep(categoryIds: CategoryId[]): Promise<RunRecord | null>;
  clearHistory(): Promise<AppState>;
  openFullDiskAccessSettings(): Promise<void>;
  revealPath(path: string): Promise<void>;
  quit(): Promise<void>;
  onStateChanged(listener: (state: AppState) => void): () => void;
}

export const IPC = {
  getState: 'cleaner:get-state',
  updateSettings: 'cleaner:update-settings',
  runQuickClean: 'cleaner:run-quick-clean',
  scanDeep: 'cleaner:scan-deep',
  cleanDeep: 'cleaner:clean-deep',
  clearHistory: 'cleaner:clear-history',
  openFullDiskAccessSettings: 'cleaner:open-fda-settings',
  revealPath: 'cleaner:reveal-path',
  quit: 'cleaner:quit',
  stateChanged: 'cleaner:state-changed',
} as const;
