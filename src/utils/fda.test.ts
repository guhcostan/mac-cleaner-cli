import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('fs/promises', () => ({
  readdir: vi.fn(),
}));

import { readdir } from 'fs/promises';
import { hasFullDiskAccess } from './fda.js';

const originalPlatform = process.platform;

function setPlatform(platform: string): void {
  Object.defineProperty(process, 'platform', { value: platform });
}

function errnoError(code: string): NodeJS.ErrnoException {
  const error: NodeJS.ErrnoException = new Error(code);
  error.code = code;
  return error;
}

describe('hasFullDiskAccess', () => {
  afterEach(() => {
    setPlatform(originalPlatform);
    vi.clearAllMocks();
  });

  it('should return null on non-macOS platforms', async () => {
    setPlatform('linux');

    expect(await hasFullDiskAccess()).toBeNull();
    expect(readdir).not.toHaveBeenCalled();
  });

  it('should return true when the TCC-protected directory is readable', async () => {
    setPlatform('darwin');
    vi.mocked(readdir).mockResolvedValue([]);

    expect(await hasFullDiskAccess()).toBe(true);
  });

  it('should return false on EPERM', async () => {
    setPlatform('darwin');
    vi.mocked(readdir).mockRejectedValue(errnoError('EPERM'));

    expect(await hasFullDiskAccess()).toBe(false);
  });

  it('should return false on EACCES', async () => {
    setPlatform('darwin');
    vi.mocked(readdir).mockRejectedValue(errnoError('EACCES'));

    expect(await hasFullDiskAccess()).toBe(false);
  });

  it('should return null when the probe path does not exist', async () => {
    setPlatform('darwin');
    vi.mocked(readdir).mockRejectedValue(errnoError('ENOENT'));

    expect(await hasFullDiskAccess()).toBeNull();
  });
});
