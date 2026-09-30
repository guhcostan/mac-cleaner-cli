import type { AutoCleanSettings } from '../shared/types.js';

/** The scheduled run time on the same local calendar day as `now`. */
export function scheduledTimeOn(now: Date, hour: number, minute: number): Date {
  const d = new Date(now);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/**
 * Whether the daily automatic clean should run now.
 *
 * It is due once `now` has passed today's scheduled time and the last run
 * (or, before the first run, the moment the app was installed) happened
 * before that time. This way a Mac that was asleep or off at the scheduled
 * time catches up as soon as it wakes, and it never runs twice a day.
 */
export function isAutoCleanDue(now: Date, settings: AutoCleanSettings, lastRunAt: Date | null, installedAt: Date): boolean {
  if (!settings.enabled || settings.categories.length === 0) return false;

  const scheduled = scheduledTimeOn(now, settings.hour, settings.minute);
  if (now < scheduled) return false;

  const baseline = lastRunAt ?? installedAt;
  return baseline < scheduled;
}

/** When the next automatic run will happen, or null when it is disabled. */
export function nextAutoCleanAt(now: Date, settings: AutoCleanSettings, lastRunAt: Date | null, installedAt: Date): Date | null {
  if (!settings.enabled || settings.categories.length === 0) return null;
  if (isAutoCleanDue(now, settings, lastRunAt, installedAt)) return now;

  const today = scheduledTimeOn(now, settings.hour, settings.minute);
  if (now < today) return today;

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow;
}
