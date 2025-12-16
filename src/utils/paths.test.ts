import { describe, it, expect } from 'vitest';
import { homedir } from 'os';
import { join } from 'path';
import { HOME, PATHS, expandPath, isSystemPath, contractPath, truncateDirectoryPath } from './paths.js';

describe('HOME', () => {
  it('should be the user home directory', () => {
    expect(HOME).toBe(homedir());
  });
});

describe('PATHS', () => {
  it('should have userCaches path', () => {
    expect(PATHS.userCaches).toBe(join(HOME, 'Library', 'Caches'));
  });

  it('should have systemCaches path', () => {
    expect(PATHS.systemCaches).toBe('/Library/Caches');
  });

  it('should have trash path', () => {
    expect(PATHS.trash).toBe(join(HOME, '.Trash'));
  });

  it('should have downloads path', () => {
    expect(PATHS.downloads).toBe(join(HOME, 'Downloads'));
  });

  it('should have npm cache path', () => {
    expect(PATHS.npmCache).toBe(join(HOME, '.npm', '_cacache'));
  });

  it('should have xcode derived data path', () => {
    expect(PATHS.xcodeDerivedData).toBe(join(HOME, 'Library', 'Developer', 'Xcode', 'DerivedData'));
  });
});

describe('expandPath', () => {
  it('should expand ~ to home directory', () => {
    expect(expandPath('~/Documents')).toBe(join(HOME, 'Documents'));
    expect(expandPath('~/.config')).toBe(join(HOME, '.config'));
  });

  it('should not modify paths without ~', () => {
    expect(expandPath('/usr/local')).toBe('/usr/local');
    expect(expandPath('/tmp')).toBe('/tmp');
  });
});

describe('isSystemPath', () => {
  it('should return true for system paths', () => {
    expect(isSystemPath('/System/Library')).toBe(true);
    expect(isSystemPath('/usr/bin')).toBe(true);
    expect(isSystemPath('/bin/bash')).toBe(true);
    expect(isSystemPath('/sbin/mount')).toBe(true);
    expect(isSystemPath('/private/var/db/something')).toBe(true);
  });

  it('should return false for non-system paths', () => {
    expect(isSystemPath('/tmp')).toBe(false);
    expect(isSystemPath('/Users/test')).toBe(false);
    expect(isSystemPath('/Applications')).toBe(false);
    expect(isSystemPath(join(HOME, 'Documents'))).toBe(false);
  });
});

describe('contractPath', () => {
  it('should contract home directory to ~', () => {
    expect(contractPath(join(HOME, 'Documents'))).toBe('~/Documents');
    expect(contractPath(join(HOME, 'Library', 'Caches'))).toBe('~/Library/Caches');
  });

  it('should not modify paths outside home directory', () => {
    expect(contractPath('/usr/local')).toBe('/usr/local');
    expect(contractPath('/tmp')).toBe('/tmp');
  });

  it('should handle exact home directory', () => {
    expect(contractPath(HOME)).toBe('~');
  });
});

describe('truncateDirectoryPath', () => {

  it('should not truncate short paths', () => {
    expect(truncateDirectoryPath('~/Downloads', false)).toBe('~/Downloads');
    expect(truncateDirectoryPath('~/Documents/Projects', false)).toBe('~/Documents/Projects');
  });

  /**
   * Tests truncation of deeply nested paths.
   * Should show home (~), ellipsis (...), and preserve last 2 segments within max length.
   */
  it('should truncate very deep paths', () => {
    const deepPath = join(HOME, 'very-long-folder-name-here', 'another-long-name', 'third-level', 'fourth-level', 'fifth-level', 'sixth-level');
    const result = truncateDirectoryPath(deepPath, false);
    expect(result).toContain('~');
    expect(result).toContain('...');
    expect(result).toContain('fifth-level/sixth-level');
    expect(result.length).toBeLessThanOrEqual(53);
  });

  it('should use absolute paths when absolutePaths is true', () => {
    const result = truncateDirectoryPath(join(HOME, 'Documents'), true);
    expect(result).not.toContain('~');
    expect(result).toContain(HOME);
  });

  it('should truncate long absolute paths', () => {
    const longPath = '/very/long/path/that/exceeds/the/maximum/allowed/length/for/display/purposes/end';
    const result = truncateDirectoryPath(longPath, true);
    expect(result.length).toBeLessThanOrEqual(53);
    expect(result).toContain('...');
  });

  /**
   * Truncation strategy: keep first segment (~) and last 2 segments,
   * inserting ellipsis for omitted middle segments.
   */
  it('should keep first and last two segments for deep paths', () => {
    const deepPath = join(HOME, 'Projects', 'work-project', 'node_modules', 'package', 'dist', 'subfolder');
    const result = truncateDirectoryPath(deepPath, false);
    expect(result).toMatch(/~\/\.\.\.\/dist\/subfolder/);
  });
});



