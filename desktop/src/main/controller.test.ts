import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BusyError, CleanerController, DEEP_SCAN_MAX_AGE_MS, StaleScanError } from './controller.js';
import { Store } from './store.js';
import { fakeScanner, item } from './test-helpers.js';

describe('CleanerController', () => {
  let dir: string;
  let clock: Date;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mac-cleaner-controller-'));
    clock = new Date(2026, 8, 30, 9, 0);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function setup() {
    const store = await Store.open(dir, new Date(2026, 8, 29, 9, 0));
    await store.updateSettings({ autoClean: { hour: 10, minute: 0, categories: ['temp-files', 'trash'] } });
    const registry = {
      'temp-files': fakeScanner('temp-files', [
        item('stale', 100, new Date(2026, 8, 27)),
        item('in-use', 50, new Date(2026, 8, 30, 8, 30)),
      ]),
      trash: fakeScanner('trash', [item('t', 10)]),
      'system-cache': fakeScanner('system-cache', [item('cache', 1000)]),
      downloads: fakeScanner('downloads', [item('dl', 5000)]),
    };
    const onRunFinished = vi.fn();
    const onStateChanged = vi.fn();
    const controller = new CleanerController({
      store,
      registry,
      version: '0.0.0-test',
      now: () => clock,
      onRunFinished,
      onStateChanged,
    });
    return { store, registry, controller, onRunFinished, onStateChanged };
  }

  it('runs the automatic clean once when it is due', async () => {
    const { controller, registry, onRunFinished, store } = await setup();

    expect(await controller.tick()).toBeNull();

    clock = new Date(2026, 8, 30, 10, 5);
    const record = await controller.tick();
    expect(record?.mode).toBe('auto');
    // Fresh temp files are left alone by unattended runs.
    expect(registry['temp-files'].clean).toHaveBeenCalledWith([expect.objectContaining({ name: 'stale' })], false);
    expect(record?.freedSpace).toBe(110);
    expect(onRunFinished).toHaveBeenCalledWith(record);
    expect(store.lastAutoRunAt).toEqual(new Date(2026, 8, 30, 10, 5));

    clock = new Date(2026, 8, 30, 15, 0);
    expect(await controller.tick()).toBeNull();
  });

  it('quick clean uses the automatic selection but does not move the daily schedule', async () => {
    const { controller, registry, store } = await setup();
    const record = await controller.runQuickClean();
    expect(record.mode).toBe('quick');
    expect(registry['system-cache'].scan).not.toHaveBeenCalled();
    expect(store.lastAutoRunAt).toBeNull();
  });

  it('deep scan previews without deleting, then deletes only the confirmed categories', async () => {
    const { controller, registry } = await setup();

    const preview = await controller.scanDeep(['system-cache', 'downloads', 'trash']);
    expect(preview.totalSize).toBe(6010);
    expect(registry.downloads.clean).not.toHaveBeenCalled();

    const record = await controller.cleanDeep(['system-cache', 'trash']);
    expect(record.mode).toBe('deep');
    expect(record.freedSpace).toBe(1010);
    expect(registry.downloads.clean).not.toHaveBeenCalled();
    // Reuses the fresh scan instead of scanning again.
    expect(registry['system-cache'].scan).toHaveBeenCalledTimes(1);
  });

  it('refuses to delete from a stale preview instead of rescanning', async () => {
    const { controller, registry } = await setup();
    await controller.scanDeep(['system-cache']);
    clock = new Date(clock.getTime() + DEEP_SCAN_MAX_AGE_MS + 1);
    await expect(controller.cleanDeep(['system-cache'])).rejects.toBeInstanceOf(StaleScanError);
    expect(registry['system-cache'].scan).toHaveBeenCalledTimes(1);
    expect(registry['system-cache'].clean).not.toHaveBeenCalled();
    expect(controller.isBusy).toBe(false);
  });

  it('refuses to delete categories that were not in the preview', async () => {
    const { controller, registry } = await setup();
    await controller.scanDeep(['system-cache']);
    await expect(controller.cleanDeep(['system-cache', 'downloads'])).rejects.toBeInstanceOf(StaleScanError);
    expect(registry.downloads.scan).not.toHaveBeenCalled();
    expect(registry['system-cache'].clean).not.toHaveBeenCalled();
  });

  it('refuses to delete when nothing was scanned', async () => {
    const { controller } = await setup();
    await expect(controller.cleanDeep(['trash'])).rejects.toBeInstanceOf(StaleScanError);
  });

  it('ignores unknown category ids from the renderer', async () => {
    const { controller } = await setup();
    const preview = await controller.scanDeep(['system-cache', 'not-a-category' as never]);
    expect(preview.categories.map((c) => c.id)).toEqual(['system-cache']);
  });

  it('refuses to start a second run while one is in progress', async () => {
    const { controller, registry } = await setup();
    let release!: () => void;
    registry.trash.scan.mockImplementationOnce(
      () => new Promise((resolve) => { release = () => resolve({ category: registry.trash.category, items: [], totalSize: 0 }); })
    );

    const first = controller.scanDeep(['trash']);
    await vi.waitFor(() => expect(controller.isBusy).toBe(true));
    await expect(controller.runQuickClean()).rejects.toBeInstanceOf(BusyError);
    expect(await controller.tick()).toBeNull();

    release();
    await first;
    expect(controller.isBusy).toBe(false);
  });

  it('exposes state for the UI', async () => {
    const { controller } = await setup();
    await controller.runQuickClean();
    const state = await controller.getState();
    expect(state.version).toBe('0.0.0-test');
    expect(state.history).toHaveLength(1);
    expect(state.status.phase).toBe('idle');
    expect(state.nextAutoRunAt).toBe(new Date(2026, 8, 30, 10, 0).toISOString());
    expect(state.categories.length).toBeGreaterThan(10);
  });
});
