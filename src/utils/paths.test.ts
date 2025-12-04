import { describe, it, expect } from 'vitest';
import { homedir } from 'os';
import { join } from 'path';
import { HOME, PATHS, expandPath, isSystemPath } from './paths.js';

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




