import { describe, it, expect } from 'vitest';
import { homedir } from 'os';
import { join, resolve } from 'path';
import { HOME, PATHS, expandPath, isSystemPath, hasTraversalPattern } from './paths.js';

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







