import { describe, it, expect } from 'vitest';
import { formatSize, parseSize, SIZE_THRESHOLDS } from './size.js';

describe('formatSize', () => {
  it('should format bytes', () => {
    expect(formatSize(0)).toBe('0 B');
    expect(formatSize(500)).toBe('500 B');
    expect(formatSize(1023)).toBe('1023 B');
  });

  it('should format kilobytes', () => {
    expect(formatSize(1024)).toBe('1.0 KB');
    expect(formatSize(1536)).toBe('1.5 KB');
    expect(formatSize(10240)).toBe('10.0 KB');
  });

  it('should format megabytes', () => {
    expect(formatSize(1024 * 1024)).toBe('1.0 MB');
    expect(formatSize(1.5 * 1024 * 1024)).toBe('1.5 MB');
    expect(formatSize(100 * 1024 * 1024)).toBe('100.0 MB');
  });

  it('should format gigabytes', () => {
    expect(formatSize(1024 * 1024 * 1024)).toBe('1.0 GB');
    expect(formatSize(2.5 * 1024 * 1024 * 1024)).toBe('2.5 GB');
  });

  it('should format terabytes', () => {
    expect(formatSize(1024 * 1024 * 1024 * 1024)).toBe('1.0 TB');
  });
});

describe('parseSize', () => {
  it('should parse bytes', () => {
    expect(parseSize('500 B')).toBe(500);
    expect(parseSize('0 B')).toBe(0);
  });

  it('should parse kilobytes', () => {
    expect(parseSize('1 KB')).toBe(1024);
    expect(parseSize('1.5 KB')).toBe(1536);
  });

  it('should parse megabytes', () => {
    expect(parseSize('1 MB')).toBe(1024 * 1024);
    expect(parseSize('100 MB')).toBe(100 * 1024 * 1024);
  });

  it('should parse gigabytes', () => {
    expect(parseSize('1 GB')).toBe(1024 * 1024 * 1024);
  });

  it('should return 0 for invalid input', () => {
    expect(parseSize('')).toBe(0);
    expect(parseSize('invalid')).toBe(0);
    expect(parseSize('1 XB')).toBe(0);
  });

  it('should be case insensitive', () => {
    expect(parseSize('1 kb')).toBe(1024);
    expect(parseSize('1 Kb')).toBe(1024);
    expect(parseSize('1 KB')).toBe(1024);
  });
});

describe('SIZE_THRESHOLDS', () => {
  it('should have correct values', () => {
    expect(SIZE_THRESHOLDS.LARGE_FILE).toBe(500 * 1024 * 1024);
    expect(SIZE_THRESHOLDS.MEDIUM_FILE).toBe(100 * 1024 * 1024);
    expect(SIZE_THRESHOLDS.SMALL_FILE).toBe(10 * 1024 * 1024);
  });
});




