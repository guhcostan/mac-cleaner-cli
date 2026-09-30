import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RunRecord } from '../shared/types.js';
import { DEFAULT_SETTINGS } from './settings.js';
import { MAX_HISTORY, Store } from './store.js';

function run(mode: RunRecord['mode'], freed: number, startedAt = '2026-09-30T10:00:00.000Z'): RunRecord {
  return {
    id: `${mode}-${freed}-${Math.random()}`,
    mode,
    startedAt,
    finishedAt: startedAt,
    freedSpace: freed,
    cleanedItems: 1,
    categories: [],
    errors: [],
  };
}

describe('Store', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mac-cleaner-desktop-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('creates a state file with defaults on first launch', async () => {
    const now = new Date('2026-09-30T08:00:00Z');
    const store = await Store.open(dir, now);
    expect(store.settings).toEqual(DEFAULT_SETTINGS);
    expect(store.installedAt).toEqual(now);
    expect(store.lastAutoRunAt).toBeNull();

    const saved = JSON.parse(await readFile(join(dir, 'state.json'), 'utf-8'));
    expect(saved.installedAt).toBe(now.toISOString());
  });

  it('persists settings and history across reopen', async () => {
    const store = await Store.open(dir);
    await store.updateSettings({ autoClean: { hour: 7 } });
    await store.addRun(run('auto', 100, '2026-09-30T07:00:00.000Z'));
    await store.addRun(run('deep', 50));

    const reopened = await Store.open(dir);
    expect(reopened.settings.autoClean.hour).toBe(7);
    expect(reopened.history.map((r) => r.mode)).toEqual(['deep', 'auto']);
    expect(reopened.totalFreed).toBe(150);
    expect(reopened.lastAutoRunAt?.toISOString()).toBe('2026-09-30T07:00:00.000Z');
  });

  it('only automatic runs move the auto-run baseline', async () => {
    const store = await Store.open(dir);
    await store.addRun(run('quick', 1));
    await store.addRun(run('deep', 1));
    expect(store.lastAutoRunAt).toBeNull();
  });

  it('caps history length', async () => {
    const store = await Store.open(dir);
    for (let i = 0; i < MAX_HISTORY + 5; i++) {
      await store.addRun(run('quick', i));
    }
    expect(store.history).toHaveLength(MAX_HISTORY);
    expect(store.history[0].freedSpace).toBe(MAX_HISTORY + 4);
  });

  it('keeps the lifetime total when old runs fall out of history', async () => {
    const store = await Store.open(dir);
    const runs = MAX_HISTORY + 5;
    for (let i = 0; i < runs; i++) {
      await store.addRun(run('quick', 10));
    }
    expect(store.totalFreed).toBe(runs * 10);
    expect((await Store.open(dir)).totalFreed).toBe(runs * 10);
  });

  it('derives the lifetime total from history for state files that predate it', async () => {
    await writeFile(
      join(dir, 'state.json'),
      JSON.stringify({ installedAt: '2026-09-01T00:00:00.000Z', history: [run('auto', 30), run('deep', 70)] })
    );
    expect((await Store.open(dir)).totalFreed).toBe(100);
  });

  it('recovers from a corrupted state file', async () => {
    await writeFile(join(dir, 'state.json'), '{not json');
    const store = await Store.open(dir);
    expect(store.settings).toEqual(DEFAULT_SETTINGS);
    expect(store.history).toEqual([]);
  });

  it('clears history', async () => {
    const store = await Store.open(dir);
    await store.addRun(run('quick', 1));
    await store.clearHistory();
    const reopened = await Store.open(dir);
    expect(reopened.history).toEqual([]);
    expect(reopened.totalFreed).toBe(1);
  });
});
