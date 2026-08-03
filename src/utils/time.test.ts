import { describe, it, expect } from 'vitest';
import { formatRelativeAge } from './time.js';

describe('formatRelativeAge', () => {
  const now = Date.parse('2026-08-03T12:00:00.000Z');

  it('should format today', () => {
    expect(formatRelativeAge(new Date(now), now)).toBe('today');
  });

  it('should format recent days', () => {
    expect(formatRelativeAge(new Date(now - 1 * 86400000), now)).toBe('1d ago');
    expect(formatRelativeAge(new Date(now - 17 * 86400000), now)).toBe('17d ago');
  });

  it('should format older dates with month and day', () => {
    const value = formatRelativeAge(new Date('2026-03-29T12:00:00.000Z'), now);
    expect(value).toMatch(/Mar/);
    expect(value).toMatch(/29/);
  });

  it('should include year for dates older than a year', () => {
    const value = formatRelativeAge(new Date('2025-01-15T12:00:00.000Z'), now);
    expect(value).toMatch(/2025/);
  });
});
