import { CATEGORIES, type CategoryId, type ScanResult } from '../../../src/types.js';
import type {
  AppState,
  CategoryInfo,
  DeepScanPreview,
  DiskInfo,
  RunMode,
  RunRecord,
  RunStatus,
  SettingsPatch,
} from '../shared/types.js';
import {
  cleanScanResults,
  filterItemsForAutoClean,
  scanCategories,
  toScanPreview,
  type ProgressEvent,
  type ScannerRegistry,
} from './engine.js';
import { isAutoCleanDue, nextAutoCleanAt } from './schedule.js';
import type { Store } from './store.js';

/** A deep scan older than this is rescanned before deleting anything. */
export const DEEP_SCAN_MAX_AGE_MS = 15 * 60 * 1000;

export class BusyError extends Error {
  constructor() {
    super('A scan or clean is already running');
  }
}

export interface ControllerDeps {
  store: Store;
  registry: ScannerRegistry;
  version: string;
  now?: () => Date;
  getDisk?: () => Promise<DiskInfo | null>;
  getFullDiskAccess?: () => Promise<boolean | null>;
  onStateChanged?: (state: AppState) => void;
  onRunFinished?: (record: RunRecord) => void;
  onSettingsChanged?: (state: AppState) => void;
}

const CATEGORY_LIST: CategoryInfo[] = (Object.keys(CATEGORIES) as CategoryId[]).map((id) => {
  const { name, group, description, safetyLevel, safetyNote } = CATEGORIES[id];
  return { id, name, group, description, safetyLevel, safetyNote };
});

export class CleanerController {
  private status: RunStatus = { phase: 'idle' };
  private lastDeepScan: { at: Date; results: ScanResult[] } | null = null;
  private readonly now: () => Date;

  constructor(private readonly deps: ControllerDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  get isBusy(): boolean {
    return this.status.phase !== 'idle';
  }

  async getState(): Promise<AppState> {
    const { store } = this.deps;
    const now = this.now();
    const next = nextAutoCleanAt(now, store.settings.autoClean, store.lastAutoRunAt, store.installedAt);
    const [disk, fullDiskAccess] = await Promise.all([
      this.deps.getDisk?.().catch(() => null) ?? null,
      this.deps.getFullDiskAccess?.().catch(() => null) ?? null,
    ]);

    return {
      version: this.deps.version,
      settings: store.settings,
      history: store.history,
      totalFreed: store.totalFreed,
      nextAutoRunAt: next ? next.toISOString() : null,
      status: this.status,
      disk,
      fullDiskAccess,
      categories: CATEGORY_LIST,
    };
  }

  async updateSettings(patch: SettingsPatch): Promise<AppState> {
    await this.deps.store.updateSettings(patch);
    const state = await this.getState();
    this.deps.onSettingsChanged?.(state);
    this.deps.onStateChanged?.(state);
    return state;
  }

  async clearHistory(): Promise<AppState> {
    await this.deps.store.clearHistory();
    return this.emit();
  }

  /** Called periodically and when the Mac wakes up. */
  async tick(): Promise<RunRecord | null> {
    const { store } = this.deps;
    if (this.isBusy) return null;
    if (!isAutoCleanDue(this.now(), store.settings.autoClean, store.lastAutoRunAt, store.installedAt)) {
      return null;
    }
    return this.runLightClean('auto');
  }

  /** The same selection as the daily run, triggered by hand. */
  runQuickClean(): Promise<RunRecord> {
    return this.runLightClean('quick');
  }

  async scanDeep(categoryIds: CategoryId[]): Promise<DeepScanPreview> {
    const ids = this.validIds(categoryIds);
    const results = await this.exclusive('deep', () =>
      scanCategories(this.deps.registry, ids, (e) => this.setProgress('deep', e))
    );
    const at = this.now();
    this.lastDeepScan = { at, results };
    return toScanPreview(results, at);
  }

  /**
   * Hard delete: permanently removes everything found in the selected
   * categories of the last deep scan (rescanning if it is stale).
   */
  async cleanDeep(categoryIds: CategoryId[]): Promise<RunRecord> {
    const ids = this.validIds(categoryIds);
    const record = await this.exclusive('deep', async () => {
      const scan = this.lastDeepScan;
      const fresh = scan && this.now().getTime() - scan.at.getTime() < DEEP_SCAN_MAX_AGE_MS;
      const cached = fresh ? scan.results.filter((r) => ids.includes(r.category.id)) : [];
      const missing = ids.filter((id) => !cached.some((r) => r.category.id === id));
      const rescanned = missing.length
        ? await scanCategories(this.deps.registry, missing, (e) => this.setProgress('deep', e))
        : [];

      return cleanScanResults(this.deps.registry, 'deep', [...cached, ...rescanned], {
        now: this.now,
        onProgress: (e) => this.setProgress('deep', e),
      });
    });

    this.lastDeepScan = null;
    await this.finishRun(record);
    return record;
  }

  private async runLightClean(mode: RunMode): Promise<RunRecord> {
    const { settings } = this.deps.store;
    const ids = this.validIds(settings.autoClean.categories);

    const record = await this.exclusive(mode, async () => {
      const results = await scanCategories(this.deps.registry, ids, (e) => this.setProgress(mode, e));
      return cleanScanResults(this.deps.registry, mode, results, {
        now: this.now,
        itemFilter: (result) =>
          filterItemsForAutoClean(result, {
            now: this.now(),
            tempFilesMinAgeHours: settings.autoClean.tempFilesMinAgeHours,
          }),
        onProgress: (e) => this.setProgress(mode, e),
      });
    });

    await this.finishRun(record);
    return record;
  }

  private async finishRun(record: RunRecord): Promise<void> {
    await this.deps.store.addRun(record);
    this.deps.onRunFinished?.(record);
    await this.emit();
  }

  private validIds(categoryIds: CategoryId[]): CategoryId[] {
    if (!Array.isArray(categoryIds)) return [];
    return [...new Set(categoryIds)].filter((id) => id in CATEGORIES && this.deps.registry[id]);
  }

  private async exclusive<T>(mode: RunMode, fn: () => Promise<T>): Promise<T> {
    if (this.isBusy) throw new BusyError();
    this.status = { phase: 'scanning', mode, completed: 0, total: 0 };
    void this.emit();
    try {
      return await fn();
    } finally {
      this.status = { phase: 'idle' };
      void this.emit();
    }
  }

  private setProgress(mode: RunMode, event: ProgressEvent): void {
    this.status = {
      phase: event.phase,
      mode,
      completed: event.completed,
      total: event.total,
      current: event.current,
    };
    void this.emit();
  }

  private async emit(): Promise<AppState> {
    const state = await this.getState();
    this.deps.onStateChanged?.(state);
    return state;
  }
}
