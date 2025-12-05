import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushDnsCache } from './dns-cache.js';
import { exec } from 'child_process';
import { promisify } from 'util';

vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

const execAsync = promisify(exec);

describe('dns-cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('flushDnsCache', () => {
    it('should return a MaintenanceResult', async () => {
      vi.mocked(exec).mockImplementation(((
        _cmd: string,
        callback: (error: null, stdout: string, stderr: string) => void
      ) => {
        callback(null, '', '');
      }) as any);

      const result = await flushDnsCache();

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('message');
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.message).toBe('string');
    });

    it('should have error property when fails', async () => {
      vi.mocked(exec).mockImplementation(((
        _cmd: string,
        callback: (error: Error, stdout: string, stderr: string) => void
      ) => {
        callback(new Error('Permission denied'), '', '');
      }) as any);

      const result = await flushDnsCache();

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return proper message format', async () => {
      vi.mocked(exec).mockImplementation(((
        _cmd: string,
        callback: (error: null, stdout: string, stderr: string) => void
      ) => {
        callback(null, '', '');
      }) as any);

      const result = await flushDnsCache();

      expect(result.success).toBe(true);
      expect(result.message).toContain('successfully');
    });
  });
});
