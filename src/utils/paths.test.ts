import { describe, it, expect } from 'vitest';
import { homedir } from 'os';
import { join, resolve } from 'path';
import { HOME, PATHS, expandPath, isSystemPath, contractPath, truncateDirectoryPath, truncateFileName, hasTraversalPattern } from './paths.js';

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
    expect(expandPath('~/Documents')).toBe(resolve(HOME, 'Documents'));
    expect(expandPath('~/.config')).toBe(resolve(HOME, '.config'));
  });

  it('should expand just ~ to home directory', () => {
    expect(expandPath('~')).toBe(HOME);
  });

  it('should resolve paths without ~', () => {
    expect(expandPath('/usr/local')).toBe('/usr/local');
    expect(expandPath('/tmp')).toBe('/tmp');
  });

  it('should throw error for path traversal attempts from home', () => {
    expect(() => expandPath('~/../../etc/passwd')).toThrow('traversal');
    expect(() => expandPath('~/../../../tmp')).toThrow('traversal');
  });

  it('should allow paths outside home when allowOutsideHome is true', () => {
    const result = expandPath('~/../../tmp', true);
    expect(result).toBe('/tmp');
  });

  it('should resolve relative path components', () => {
    const result = expandPath('~/Documents/../Downloads');
    expect(result).toBe(resolve(HOME, 'Downloads'));
  });
});

describe('hasTraversalPattern', () => {
  it('should detect ../ pattern', () => {
    expect(hasTraversalPattern('../test')).toBe(true);
    expect(hasTraversalPattern('foo/../bar')).toBe(true);
    expect(hasTraversalPattern('foo/bar/../baz')).toBe(true);
  });

  it('should detect /.. pattern', () => {
    expect(hasTraversalPattern('foo/..')).toBe(true);
    expect(hasTraversalPattern('/foo/bar/..')).toBe(true);
  });

  it('should detect standalone ..', () => {
    expect(hasTraversalPattern('..')).toBe(true);
  });

  it('should not flag safe paths', () => {
    expect(hasTraversalPattern('/usr/local')).toBe(false);
    expect(hasTraversalPattern('~/Documents')).toBe(false);
    expect(hasTraversalPattern('/tmp/file.txt')).toBe(false);
    expect(hasTraversalPattern('..foo')).toBe(false); // Not a traversal
    expect(hasTraversalPattern('foo..bar')).toBe(false); // Not a traversal
  });
});

describe('isSystemPath', () => {
  it('should return true for system paths', () => {
    expect(isSystemPath('/System/Library')).toBe(true);
    expect(isSystemPath('/usr/bin')).toBe(true);
    expect(isSystemPath('/bin/bash')).toBe(true);
    expect(isSystemPath('/sbin/mount')).toBe(true);
    expect(isSystemPath('/private/var/db/something')).toBe(true);
    expect(isSystemPath('/etc/hosts')).toBe(true);
    expect(isSystemPath('/var/log')).toBe(true);
  });

  it('should return false for non-system paths', () => {
    expect(isSystemPath('/tmp')).toBe(false);
    expect(isSystemPath('/Users/test')).toBe(false);
    expect(isSystemPath('/Applications')).toBe(false);
    expect(isSystemPath(join(HOME, 'Documents'))).toBe(false);
  });

  it('should handle exact system path matches', () => {
    expect(isSystemPath('/System')).toBe(true);
    expect(isSystemPath('/usr')).toBe(true);
    expect(isSystemPath('/bin')).toBe(true);
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

describe('truncateFileName', () => {
  it('should not truncate short filenames', () => {
    expect(truncateFileName('file.txt', 20)).toBe('file.txt');
    expect(truncateFileName('short.js', 10)).toBe('short.js');
  });

  it('should not truncate filenames equal to maxLength', () => {
    expect(truncateFileName('exact.txt', 9)).toBe('exact.txt');
  });

  it('should truncate long filenames with extension', () => {
    const result = truncateFileName('very-long-filename-that-needs-truncation.txt', 20);
    expect(result.length).toBe(20);
    expect(result).toContain('...');
    expect(result).toMatch(/\.txt$/); // Should preserve extension
  });

  it('should truncate filename and split basename evenly', () => {
    // "a-very-long-file-name.txt" (25 chars) -> max 15
    // ext = ".txt" (4), ellipsis = "..." (3)
    // available = 15 - 4 - 3 = 8
    // first = ceil(8/2) = 4, last = floor(8/2) = 4
    // Result: "a-ve...name.txt" (15 chars)
    const result = truncateFileName('a-very-long-file-name.txt', 15);
    expect(result).toBe('a-ve...name.txt');
    expect(result.length).toBe(15);
  });

  it('should handle filenames without extension', () => {
    // "verylongfilenamewithoutextension" (32 chars) -> max 15
    // No extension, so ext = ''
    // available = 15 - 0 - 3 = 12
    // first = ceil(12/2) = 6, last = floor(12/2) = 6
    // Result: "verylo...ension" (15 chars)
    const result = truncateFileName('verylongfilenamewithoutextension', 15);
    expect(result).toBe('verylo...ension');
    expect(result.length).toBe(15);
    expect(result).toContain('...');
  });

  it('should handle files with multiple dots', () => {
    const result = truncateFileName('my.file.name.tar.gz', 12);
    expect(result.length).toBe(12);
    expect(result).toContain('...');
    expect(result).toMatch(/\.gz$/); // Should preserve last extension
  });

  it('should handle edge case where extension is very long', () => {
    // If extension + ellipsis > maxLength, use hard truncation
    const result = truncateFileName('file.verylongextension', 10);
    expect(result.length).toBe(10);
    expect(result).toContain('...');
  });

  it('should handle extreme case where maxLength is very small', () => {
    const result = truncateFileName('verylongfilename.txt', 5);
    expect(result.length).toBe(5);
    expect(result).toBe('ve...');
  });

  it('should handle filename with dot at start (hidden file)', () => {
    const result = truncateFileName('.gitignore-very-long-name', 15);
    expect(result.length).toBe(15);
    expect(result).toContain('...');
    expect(result).toMatch(/^\.git/); // Should start with .git
  });

  it('should preserve extension for files with single character basename', () => {
    const result = truncateFileName('a.txt', 10);
    expect(result).toBe('a.txt');
  });

  it('should handle filename that is just an extension', () => {
    const result = truncateFileName('.txt', 10);
    expect(result).toBe('.txt');
  });

  it('should truncate basename symmetrically', () => {
    // "abcdefghij.txt" (14 chars) -> max 10
    // ext = ".txt" (4), ellipsis = "..." (3)
    // available = 10 - 4 - 3 = 3
    // first = ceil(3/2) = 2, last = floor(3/2) = 1
    // Result: "ab...j.txt" (10 chars)
    const result = truncateFileName('abcdefghij.txt', 10);
    expect(result).toBe('ab...j.txt');
    expect(result.length).toBe(10);
  });

  it('should handle filename with no dots in middle', () => {
    // "verylongfilename" (16 chars) -> max 10
    // No extension, so ext = ''
    // available = 10 - 0 - 3 = 7
    // first = ceil(7/2) = 4, last = floor(7/2) = 3
    // Result: "very...ame" (10 chars)
    const result = truncateFileName('verylongfilename', 10);
    expect(result).toBe('very...ame');
    expect(result.length).toBe(10);
  });

  it('should handle maxLength equal to filename length', () => {
    expect(truncateFileName('test.txt', 8)).toBe('test.txt');
  });
});


