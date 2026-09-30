import { describe, expect, it } from 'vitest';
import { DEFAULT_AUTO_CATEGORIES, DEFAULT_DEEP_CATEGORIES, DEFAULT_SETTINGS, loadSettingsFrom, mergeSettings } from './settings.js';
import { CATEGORIES } from '../../../src/types.js';

describe('settings', () => {
  it('uses defaults when nothing is persisted', () => {
    expect(loadSettingsFrom(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(loadSettingsFrom('garbage')).toEqual(DEFAULT_SETTINGS);
  });

  it('only auto-cleans non-risky categories by default', () => {
    for (const id of DEFAULT_AUTO_CATEGORIES) {
      expect(CATEGORIES[id].safetyLevel).not.toBe('risky');
    }
  });

  it('deep clean defaults exclude risky categories', () => {
    expect(DEFAULT_DEEP_CATEGORIES).not.toContain('downloads');
    expect(DEFAULT_DEEP_CATEGORIES).not.toContain('ios-backups');
    expect(DEFAULT_DEEP_CATEGORIES).toContain('system-cache');
  });

  it('merges a partial patch', () => {
    const next = mergeSettings(DEFAULT_SETTINGS, { autoClean: { hour: 22 }, notifyAfterAutoClean: false });
    expect(next.autoClean.hour).toBe(22);
    expect(next.autoClean.minute).toBe(DEFAULT_SETTINGS.autoClean.minute);
    expect(next.autoClean.categories).toEqual(DEFAULT_SETTINGS.autoClean.categories);
    expect(next.notifyAfterAutoClean).toBe(false);
    expect(next.launchAtLogin).toBe(DEFAULT_SETTINGS.launchAtLogin);
  });

  it('rejects out of range and wrongly typed values', () => {
    const next = mergeSettings(DEFAULT_SETTINGS, {
      autoClean: { hour: 25, minute: -1, enabled: 'yes', tempFilesMinAgeHours: 1.5 },
      launchAtLogin: 1,
    } as never);
    expect(next.autoClean.hour).toBe(DEFAULT_SETTINGS.autoClean.hour);
    expect(next.autoClean.minute).toBe(DEFAULT_SETTINGS.autoClean.minute);
    expect(next.autoClean.enabled).toBe(DEFAULT_SETTINGS.autoClean.enabled);
    expect(next.autoClean.tempFilesMinAgeHours).toBe(DEFAULT_SETTINGS.autoClean.tempFilesMinAgeHours);
    expect(next.launchAtLogin).toBe(DEFAULT_SETTINGS.launchAtLogin);
  });

  it('never lets risky or unknown categories into the automatic run', () => {
    const next = mergeSettings(DEFAULT_SETTINGS, {
      autoClean: { categories: ['trash', 'downloads', 'ios-backups', 'nope', 'trash'] as never },
    });
    expect(next.autoClean.categories).toEqual(['trash']);
  });
});
