import { describe, expect, it } from 'vitest';
import type { AutoCleanSettings } from '../shared/types.js';
import { isAutoCleanDue, nextAutoCleanAt } from './schedule.js';

const settings: AutoCleanSettings = {
  enabled: true,
  hour: 10,
  minute: 30,
  categories: ['temp-files'],
  tempFilesMinAgeHours: 24,
};

const at = (day: number, hour: number, minute = 0) => new Date(2026, 8, day, hour, minute);
const installedAt = at(1, 8);

describe('isAutoCleanDue', () => {
  it('is not due before the scheduled time', () => {
    expect(isAutoCleanDue(at(10, 10, 29), settings, at(9, 10, 30), installedAt)).toBe(false);
  });

  it('is due once the scheduled time passes and it has not run today', () => {
    expect(isAutoCleanDue(at(10, 10, 30), settings, at(9, 10, 31), installedAt)).toBe(true);
  });

  it('does not run twice on the same day', () => {
    expect(isAutoCleanDue(at(10, 18), settings, at(10, 10, 31), installedAt)).toBe(false);
  });

  it('catches up after the Mac was asleep at the scheduled time', () => {
    expect(isAutoCleanDue(at(12, 21), settings, at(9, 10, 30), installedAt)).toBe(true);
  });

  it('waits for the first scheduled time after install instead of running immediately', () => {
    expect(isAutoCleanDue(at(1, 12), settings, null, at(1, 11))).toBe(false);
    expect(isAutoCleanDue(at(2, 10, 31), settings, null, at(1, 11))).toBe(true);
  });

  it('runs on install day when installed before the scheduled time', () => {
    expect(isAutoCleanDue(at(1, 10, 45), settings, null, at(1, 9))).toBe(true);
  });

  it('never runs when disabled or when no categories are selected', () => {
    expect(isAutoCleanDue(at(10, 12), { ...settings, enabled: false }, null, installedAt)).toBe(false);
    expect(isAutoCleanDue(at(10, 12), { ...settings, categories: [] }, null, installedAt)).toBe(false);
  });
});

describe('nextAutoCleanAt', () => {
  it('returns today when the time has not come yet', () => {
    expect(nextAutoCleanAt(at(10, 9), settings, at(9, 10, 30), installedAt)).toEqual(at(10, 10, 30));
  });

  it('returns tomorrow after today\'s run', () => {
    expect(nextAutoCleanAt(at(10, 11), settings, at(10, 10, 30), installedAt)).toEqual(at(11, 10, 30));
  });

  it('returns now when a run is overdue', () => {
    const now = at(10, 11);
    expect(nextAutoCleanAt(now, settings, at(8, 10, 30), installedAt)).toEqual(now);
  });

  it('returns null when disabled', () => {
    expect(nextAutoCleanAt(at(10, 9), { ...settings, enabled: false }, null, installedAt)).toBeNull();
  });
});
