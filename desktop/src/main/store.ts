import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import type { RunRecord, Settings, SettingsPatch } from '../shared/types.js';
import { loadSettingsFrom, mergeSettings } from './settings.js';

export const MAX_HISTORY = 100;

interface PersistedData {
  installedAt: string;
  lastAutoRunAt: string | null;
  /** Lifetime total, kept separately because history is capped. */
  totalFreed: number;
  settings: Settings;
  history: RunRecord[];
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf-8'));
  } catch {
    return undefined;
  }
}

/**
 * Settings and run history, persisted as a JSON file in the app's
 * user data directory (~/Library/Application Support/Mac Cleaner).
 */
export class Store {
  private data: PersistedData;
  private writing: Promise<void> = Promise.resolve();

  private constructor(
    private readonly path: string,
    data: PersistedData
  ) {
    this.data = data;
  }

  static async open(dir: string, now: Date = new Date()): Promise<Store> {
    const path = join(dir, 'state.json');
    const raw = (await readJson(path)) as Partial<PersistedData> | undefined;
    const isFirstLaunch = raw === undefined;

    const history = Array.isArray(raw?.history) ? raw.history.slice(0, MAX_HISTORY) : [];
    const data: PersistedData = {
      installedAt: typeof raw?.installedAt === 'string' ? raw.installedAt : now.toISOString(),
      lastAutoRunAt: typeof raw?.lastAutoRunAt === 'string' ? raw.lastAutoRunAt : null,
      totalFreed:
        typeof raw?.totalFreed === 'number' && Number.isFinite(raw.totalFreed) && raw.totalFreed >= 0
          ? raw.totalFreed
          : history.reduce((sum, r) => sum + (r.freedSpace || 0), 0),
      settings: loadSettingsFrom(raw?.settings),
      history,
    };

    const store = new Store(path, data);
    if (isFirstLaunch) await store.save();
    return store;
  }

  get settings(): Settings {
    return this.data.settings;
  }

  get history(): RunRecord[] {
    return this.data.history;
  }

  get installedAt(): Date {
    return new Date(this.data.installedAt);
  }

  get lastAutoRunAt(): Date | null {
    return this.data.lastAutoRunAt ? new Date(this.data.lastAutoRunAt) : null;
  }

  get totalFreed(): number {
    return this.data.totalFreed;
  }

  async updateSettings(patch: SettingsPatch): Promise<Settings> {
    this.data.settings = mergeSettings(this.data.settings, patch);
    await this.save();
    return this.data.settings;
  }

  async addRun(record: RunRecord): Promise<void> {
    this.data.history = [record, ...this.data.history].slice(0, MAX_HISTORY);
    this.data.totalFreed += record.freedSpace || 0;
    if (record.mode === 'auto') {
      this.data.lastAutoRunAt = record.startedAt;
    }
    await this.save();
  }

  /** Clears the run list; the lifetime total is kept. */
  async clearHistory(): Promise<void> {
    this.data.history = [];
    await this.save();
  }

  /** Writes are serialized and atomic (write to temp file, then rename). */
  private save(): Promise<void> {
    const snapshot = JSON.stringify(this.data, null, 2);
    this.writing = this.writing
      .catch(() => undefined)
      .then(async () => {
        await mkdir(dirname(this.path), { recursive: true });
        const tmp = `${this.path}.tmp`;
        await writeFile(tmp, snapshot);
        await rename(tmp, this.path);
      });
    return this.writing;
  }
}
